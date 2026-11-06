// 运行时模块查找
import { W } from "../env.js";
import { escapeRegExp } from "./utils.js";
import { Logger } from "./logger.js";
import { proxyLazy } from "./lazy.js";
import { matchesOne } from "./patches.js";
import { canonicalizeRegex } from "./patches.js";
import {
    moduleCache, onModuleLoad, runtime, findInRegistry, getCacheVersion, getResetVersion, rescanRuntimeCache, syncRuntimeCache, chunkPaths,
} from "./turbopack.js";

const logger = new Logger("Finders", "#67e8f9");
const fnToString = Function.prototype.toString;

const REACT_MEMO = Symbol.for("react.memo");
const REACT_FORWARD_REF = Symbol.for("react.forward_ref");

// ---------- 跳过不该检查的值 ----------
function isSkippable(v) {
    if (v == null) return true;
    const t = typeof v;
    if (t !== "object" && t !== "function") return true;
    try {
        if (v === W || v === window || v === W.document || v === document) return true;
        if (typeof W.Node === "function" && v instanceof W.Node) return true;
        if (v instanceof Map || v instanceof Set || v instanceof WeakMap || v instanceof WeakSet) return true;
        if (W.Map && (v instanceof W.Map || v instanceof W.Set || v instanceof W.WeakMap || v instanceof W.WeakSet)) return true;
        if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return true;
        if (W.ArrayBuffer && (v instanceof W.ArrayBuffer || W.ArrayBuffer.isView(v))) return true;
        if (W.WebSocket && v instanceof W.WebSocket) return true;
        if (W.MessagePort && v instanceof W.MessagePort) return true;
        if (W.EventTarget && v instanceof W.EventTarget && !(t === "function")) return true;
        if (W.Promise && v instanceof W.Promise) return true;
        // 动画库的组件代理(motion.div 之类):对任意键都返回值的 Proxy
        if (t === "function" || t === "object") {
            const probe = v["$$uspp_probe_" + "x"];
            if (probe != null) return true;
        }
    } catch {
        return true;
    }
    return false;
}

// 查找时屏蔽库在 getter 里打印的弃用警告
function quietly(fn) {
    const c = W.console || console;
    const ow = c.warn, oe = c.error;
    c.warn = () => { };
    c.error = () => { };
    try { return fn(); } finally { c.warn = ow; c.error = oe; }
}

function testSafe(filter, v) {
    try { return !!filter(v); } catch { return false; }
}

const SKIP_KEYS = new Set(["default"]); // default 单独处理
function* candidates(exports) {
    yield exports;
    if (isSkippable(exports)) return;
    let keys;
    try { keys = Object.keys(exports); } catch { return; }
    for (const k of keys) {
        if (k.startsWith("__") || k.startsWith("unstable_") || k.startsWith("UNSAFE_")) continue;
        let v;
        try { v = exports[k]; } catch { continue; }
        if (v == null || SKIP_KEYS.has(k) && v === exports) continue;
        yield v;
    }
}

/** 从第 start 个模块(按进入缓存的顺序)开始扫;返回命中和扫到的位置 */
function scan(filter, { all = false, start = 0 } = {}) {
    const found = [];
    const seen = new Set();
    let i = 0, hit = null;
    for (const exports of moduleCache.values()) {
        if (i++ < start) continue;
        for (const v of candidates(exports)) {
            if (v == null || (typeof v !== "object" && typeof v !== "function")) continue;
            if (seen.has(v)) continue;
            if (v !== exports && isSkippable(v)) continue;
            if (testSafe(filter, v)) {
                if (!all) { hit = v; return { hit, end: i }; }
                seen.add(v);
                found.push(v);
            }
        }
    }
    return { hit: all ? found : null, end: i };
}

export function find(filter, { all = false } = {}) {
    if (typeof filter !== "function") throw new TypeError("filter 必须是函数");
    return quietly(() => {
        syncRuntimeCache();
        return scan(filter, { all }).hit;
    });
}
export const findAll = filter => find(filter, { all: true });

// ---------- 过滤器 ----------
// 同一个函数的源码只取一次(查找器会对同一批函数反复测试)
const codeCache = new WeakMap();
const codeOf = f => {
    let c = codeCache.get(f);
    if (c === undefined) {
        try { c = fnToString.call(f); } catch { c = ""; }
        codeCache.set(f, c);
    }
    return c;
};
const toPatterns = ps => ps.map(canonicalizeRegex);

export const isZustandStore = v => typeof v === "function" && typeof v.getState === "function" && typeof v.subscribe === "function" && typeof v.setState === "function";

const storeKey = name => "use" + (name.startsWith("use") ? name.slice(3) : name).replace(/Store$/, "") + "Store";

export const filters = {
    byProps: (...keys) => v => keys.every(k => v[k] != null),
    byCode: (...patterns) => {
        const ps = toPatterns(patterns);
        return v => typeof v === "function" && ps.every(p => matchesOne(codeOf(v), p));
    },
    byDisplayName: name => v => v.displayName === name || v.render?.displayName === name || v.type?.displayName === name,
    // CSS 模块:导出对象的值是混淆后的类名字符串,每个类名都能在某个值里找到
    byClassName: (...classes) => {
        const res = classes.map(c => new RegExp(`(?:\\b|_)${escapeRegExp(c)}(?:\\b|_)`));
        return v => {
            if (!v || typeof v !== "object") return false;
            const vals = Object.values(v);
            return vals.length > 0 && vals.every(x => typeof x === "string") && res.every(re => vals.some(x => re.test(x)));
        };
    },
    byStoreName: name => {
        const key = storeKey(name);
        return v => isZustandStore(v[key]);
    },
    componentByCode: (...patterns) => {
        const ps = toPatterns(patterns);
        const check = f => typeof f === "function" && ps.every(p => matchesOne(codeOf(f), p));
        return v => {
            if (check(v)) return true;
            if (v.$$typeof === REACT_MEMO) return check(v.type) || check(v.type?.render);
            if (v.$$typeof === REACT_FORWARD_REF) return check(v.render);
            return false;
        };
    },
};

export const findByProps = (...keys) => find(filters.byProps(...keys));
export const findByCode = (...ps) => find(filters.byCode(...ps));
export const findByDisplayName = name => find(filters.byDisplayName(name));
export const findComponentByCode = (...ps) => find(filters.componentByCode(...ps));
export function findExportedComponent(...names) {
    const m = find(exportedComponentFilter(names));
    return m ? pickExported(names)(m) : null;
}
export function findStore(name) {
    const key = storeKey(name);
    const m = find(v => isZustandStore(v[key]));
    return m ? m[key] : null;
}

/** 把 CSS 模块里混淆后的类名按原名取出:{ 原名: 混淆后的类名 };找不到的原名不在结果里 */
export function mapMangledCssClasses(mod, classes) {
    const out = {};
    if (!mod) return out;
    for (const name of classes) {
        const re = new RegExp(`(?:\\b|_)${escapeRegExp(name)}(?:\\b|_)`);
        for (const k of Object.keys(mod)) {
            const v = mod[k];
            if (typeof v === "string" && re.test(v)) { out[name] = v; break; }
        }
        if (!(name in out)) logger.debug(`mapMangledCssClasses:模块里没有类名 ${name}`);
    }
    return out;
}
export function findCssClasses(...classes) {
    const mod = find(filters.byClassName(...classes));
    return mod ? mapMangledCssClasses(mod, classes) : {};
}

/** 一次扫描找多个模块,结果和过滤器一一对应(没找到的是 null) */
export function findBulk(...filterFns) {
    const results = new Array(filterFns.length).fill(null);
    let left = filterFns.length;
    if (!left) return results;
    quietly(() => {
        syncRuntimeCache();
        outer: for (const exports of moduleCache.values()) {
            for (const v of candidates(exports)) {
                if (v == null || (typeof v !== "object" && typeof v !== "function")) continue;
                if (v !== exports && isSkippable(v)) continue;
                for (let i = 0; i < filterFns.length; i++) {
                    if (results[i] === null && testSafe(filterFns[i], v)) { results[i] = v; if (--left === 0) break outer; }
                }
            }
        }
    });
    if (left) logger.debug(`findBulk:${filterFns.length} 个过滤器只找到 ${filterFns.length - left} 个`);
    return results;
}

// ---------- Lazy 版本 ----------
/**
 * 增量查找:记住扫到了哪个模块,之后只扫新进入缓存的模块;已有模块的导出变了(getResetVersion 变化)时全部重扫。
 * 找不到的懒查找器不再在每次有新模块时把全部模块扫一遍。pick 把命中的模块转成最终结果(返回 null 视为没找到,下次只扫新模块)。
 */
function incremental(filter, pick = v => v) {
    let cursor = 0, reset = -1, last = -1;
    return () => {
        const v = getCacheVersion();
        if (v === last) return null;
        last = v;
        const r = getResetVersion();
        if (r !== reset) { reset = r; cursor = 0; }
        return quietly(() => {
            syncRuntimeCache();
            const res = scan(filter, { start: cursor });
            // 命中时下次(pick 返回 null 的情况)从命中的模块重新开始;没命中时从末尾开始
            cursor = res.hit ? res.end - 1 : res.end;
            return res.hit ? pick(res.hit) : null;
        });
    };
}
const lazyFind = (filter, pick) => proxyLazy(incremental(filter, pick));

function lazyComponent(resolveFn, label) {
    let cached = null;
    const get = () => {
        if (cached) return cached;
        cached = resolveFn() ?? null;
        return cached;
    };
    const Lazy = props => {
        const C = get();
        if (!C) return null;
        const React = getReact();
        return React ? React.createElement(C, props) : null;
    };
    Lazy.displayName = `UsppLazy(${label})`;
    Lazy.$$usppResolve = get;
    return Lazy;
}

const exportedComponentFilter = names => v => names.some(n => v[n] != null && (typeof v[n] === "function" || typeof v[n] === "object"));
const pickExported = names => m => { for (const n of names) if (m[n] != null) return m[n]; return null; };

export const findLazy = filter => lazyFind(filter);
export const findByPropsLazy = (...keys) => lazyFind(filters.byProps(...keys));
export const findByCodeLazy = (...ps) => lazyFind(filters.byCode(...ps));
export const findByDisplayNameLazy = name => lazyComponent(incremental(filters.byDisplayName(name)), name);
export const findComponentByCodeLazy = (...ps) => lazyComponent(incremental(filters.componentByCode(...ps)), String(ps[0]));
export const findExportedComponentLazy = (...names) => lazyComponent(incremental(exportedComponentFilter(names), pickExported(names)), names[0]);
export const findStoreLazy = name => { const key = storeKey(name); return lazyFind(v => isZustandStore(v[key]), m => m[key]); };
export const findCssClassesLazy = (...classes) => lazyFind(filters.byClassName(...classes), m => { const r = mapMangledCssClasses(m, classes); return Object.keys(r).length ? r : null; });
// 按源码在注册表里找,不走模块缓存的增量扫描
const retryOnChange = () => { let last = -1; return () => { const v = getCacheVersion(); if (v === last) return false; last = v; return true; }; };
export const mapMangledModuleLazy = (patterns, mappers) => proxyLazy(() => { const r = mapMangledModule(patterns, mappers); return Object.keys(r).length ? r : null; }, retryOnChange());

// ---------- 注册表查找 ----------
function srcMatcher(patterns) {
    const ps = toPatterns(patterns);
    return src => ps.every(p => matchesOne(src, p));
}
export function findModuleFactory(...patterns) {
    const hit = findInRegistry(srcMatcher(patterns))[0];
    return hit ?? null;
}
export function findModuleId(...patterns) {
    const hit = findModuleFactory(...patterns);
    return hit ? hit[0] : null;
}
export function search(...patterns) {
    const out = {};
    for (const [id, f] of findInRegistry(srcMatcher(patterns))) out[id] = f;
    return out;
}

export function requireModule(id) {
    if (moduleCache.has(id)) return moduleCache.get(id);
    if (moduleCache.has(+id)) return moduleCache.get(+id);
    try {
        const c = runtime.cache;
        if (c && c[id] && !c[id].error) return c[id].exports;
        if (runtime.ctx && typeof runtime.ctx.r === "function") return runtime.ctx.r(isNaN(+id) ? id : +id);
        // webpack:__webpack_require__;没注册的模块会抛错,按"不可用"处理
        if (typeof runtime.require === "function" && runtime.registry && Object.prototype.hasOwnProperty.call(runtime.registry, id)) return runtime.require(isNaN(+id) ? id : +id);
    } catch (e) {
        logger.debug(`加载模块 ${id} 失败`, e);
    }
    return null;
}

export function mapMangledModule(patterns, mappers) {
    const out = {};
    const id = findModuleId(...(Array.isArray(patterns) ? patterns : [patterns]));
    if (id == null) return out;
    const exports = requireModule(id);
    if (!exports) return out;
    quietly(() => {
        for (const k of Object.keys(exports)) {
            let v;
            try { v = exports[k]; } catch { continue; }
            if (v == null) continue;
            for (const [name, filter] of Object.entries(mappers)) {
                if (out[name] === undefined && testSafe(filter, v)) out[name] = v;
            }
        }
    });
    return out;
}

// ---------- 懒加载分块 ----------
const IDENT = "[A-Za-z_$][\\w$]*";
/** 工厂里加载懒分块再取入口模块的写法:Promise.all(["static/chunks/x.js", …].map(e=>t.l(e))).then(()=>t(123)) */
export const DefaultChunkLoadRegex = new RegExp(`Promise\\.all\\(\\[([^\\]]*)\\]\\.map\\(\\(?${IDENT}\\)?=>${IDENT}\\.[lL]\\(${IDENT}\\)\\)\\)\\.then\\(\\(\\)=>${IDENT}\\((\\d+|"[^"]+")\\)\\)`);
/** webpack 的懒加载写法:n.e(12).then(n.bind(n, 34)) 或 Promise.all([n.e(1), n.e(2)]).then(n.bind(n, 34)) */
export const WebpackChunkLoadRegex = new RegExp(`((?:Promise\\.all\\(\\[(?:${IDENT}\\.e\\((?:\\d+|"[^"]+")\\),?)+\\]\\))|${IDENT}\\.e\\((?:\\d+|"[^"]+")\\))\\.then\\(${IDENT}\\.bind\\(${IDENT},(\\d+|"[^"]+")\\)\\)`);
const WEBPACK_CHUNK_ID = /\.e\((\d+|"[^"]+")\)/g;
const isWebpack = () => typeof runtime.require === "function";
const CHUNK_IN_LIST = /["'`]((?:\/?_next\/)?static\/chunks\/[^"'`]+?\.js)["'`]/g;

let chunkPrefix = "/_next/";
/** 站点的分块地址前缀(driverOptions.chunkPath 里 static/chunks/ 之前的部分) */
export function setChunkPrefix(chunkPath) {
    if (typeof chunkPath === "string" && chunkPath) chunkPrefix = chunkPath.replace(/static\/chunks\/?$/, "") || "/";
}

const loadingChunks = new Map(); // 路径 -> Promise
/** 加载一个分块:优先用运行时自己的加载函数,没有时插入 <script>(和页面自己加载分块的方式一样) */
export function loadChunk(path) {
    // webpack:path 是分块 ID,交给运行时自己的 __webpack_require__.e(它会处理依赖分块和重复加载)
    if (isWebpack()) {
        const e = runtime.require.e;
        if (typeof e !== "function") return Promise.reject(new Error("webpack 运行时没有分块加载函数(__webpack_require__.e)"));
        const key = String(path);
        if (!loadingChunks.has(key)) loadingChunks.set(key, Promise.resolve(e(/^\d+$/.test(key) ? +key : key)).then(() => true, err => { loadingChunks.delete(key); throw err; }));
        return loadingChunks.get(key);
    }
    const p = String(path).replace(/^\/?_next\//, "");
    if (chunkPaths.has(p) || [...chunkPaths].some(x => String(x).endsWith(p))) return Promise.resolve(true);
    if (loadingChunks.has(p)) return loadingChunks.get(p);
    const ctx = runtime.ctx;
    let promise;
    if (ctx && typeof ctx.l === "function") promise = Promise.resolve(ctx.l(p)).then(() => true);
    else {
        promise = new Promise((resolve, reject) => {
            const el = document.createElement("script");
            el.src = new URL(chunkPrefix + p, location.origin).href;
            el.async = true;
            el.onload = () => { el.remove(); resolve(true); };
            el.onerror = () => { el.remove(); reject(new Error(`加载分块失败:${p}`)); };
            (document.head || document.documentElement).appendChild(el);
        });
    }
    promise = promise.catch(e => { loadingChunks.delete(p); throw e; });
    loadingChunks.set(p, promise);
    return promise;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** 等模块工厂注册到运行时(分块加载完成后才会注册) */
async function waitRegistered(id, ms = 5000) {
    // webpack 的工厂表是普通对象,Turbopack 的是 Map
    const inObject = () => { const r = runtime.registry; return !!r && !(r instanceof Map) && typeof r.has !== "function" && Object.prototype.hasOwnProperty.call(r, id); };
    const has = () => !!(inObject() || runtime.registry?.has?.(id) || runtime.registry?.has?.(String(id)) || moduleCache.has(id) || findInRegistry((_, x) => x == id).length);
    for (let t = 0; !has() && t < ms; t += 50) await sleep(50);
    return has();
}

/**
 * 找到源码匹配 code 的模块工厂,从里面取出它懒加载的分块并加载,再执行入口模块。
 * 用来让懒加载的组件 / 模块提前进入模块缓存,之后 find* 就能找到。成功返回 true。
 */
export async function extractAndLoadChunks(code, matcher) {
    matcher ??= isWebpack() ? WebpackChunkLoadRegex : DefaultChunkLoadRegex;
    const patterns = Array.isArray(code) ? code : [code];
    const hit = findInRegistry(srcMatcher(patterns))[0];
    if (!hit) { logger.warn("extractAndLoadChunks:没有找到匹配的模块", patterns.map(String)); return false; }
    let src = "";
    try { src = String(hit[1].toString()); } catch { /* 忽略 */ }
    const re = matcher instanceof RegExp ? new RegExp(matcher.source, matcher.flags.replace("g", "")) : canonicalizeRegex(matcher);
    const m = re.exec(src);
    if (!m) { logger.warn("extractAndLoadChunks:模块里没有加载分块的写法", patterns.map(String)); return false; }
    const paths = isWebpack()
        ? [...String(m[1] || "").matchAll(WEBPACK_CHUNK_ID)].map(x => x[1].replace(/^"|"$/g, ""))
        : [...String(m[1] || "").matchAll(CHUNK_IN_LIST)].map(x => x[1]);
    try { await Promise.all(paths.map(loadChunk)); } catch (e) { logger.warn("extractAndLoadChunks:加载分块失败", e); return false; }
    if (m[2] == null) return true;
    const id = /^\d+$/.test(m[2]) ? +m[2] : m[2].replace(/^"|"$/g, "");
    if (!(await waitRegistered(id))) { logger.warn(`extractAndLoadChunks:入口模块 ${id} 没有注册`); return false; }
    const exports = requireModule(id);
    if (exports == null) { logger.warn(`extractAndLoadChunks:入口模块 ${id} 执行失败`); return false; }
    rescanRuntimeCache();
    return true;
}
/** 返回一个函数,第一次调用时才加载;失败后下次调用会重试 */
export function extractAndLoadChunksLazy(code, matcher) {
    let cache = null;
    return () => {
        if (cache) return cache;
        cache = extractAndLoadChunks(code, matcher).then(ok => { if (!ok) cache = null; return ok; }, e => { cache = null; throw e; });
        return cache;
    };
}

/** 按 ID 异步取模块:已注册的直接执行;运行时提供异步加载函数时用它 */
export async function importModule(id) {
    const now = requireModule(id);
    if (now != null) return now;
    const ctx = runtime.ctx;
    if (ctx && typeof ctx.A === "function") return ctx.A(id);
    if (await waitRegistered(id, 3000)) return requireModule(id);
    throw new Error(`importModule:模块 ${id} 不可用`);
}

// ---------- waitFor ----------
export function waitFor(filter, callback, timeoutMs) {
    const existing = find(filter);
    if (existing) {
        try { callback(existing); } catch (e) { logger.error("waitFor 回调出错", e); }
        return () => { };
    }
    let timer;
    const unsub = onModuleLoad(exports => {
        let hit = null;
        quietly(() => {
            for (const v of candidates(exports)) {
                if (v == null || (typeof v !== "object" && typeof v !== "function")) continue;
                if (v !== exports && isSkippable(v)) continue;
                if (testSafe(filter, v)) { hit = v; break; }
            }
        });
        if (hit) {
            cancel();
            try { callback(hit); } catch (e) { logger.error("waitFor 回调出错", e); }
        }
    });
    const cancel = () => { unsub(); clearTimeout(timer); };
    if (timeoutMs) timer = setTimeout(() => { unsub(); logger.warn(`waitFor 超时(${timeoutMs} ms)`, filter); }, timeoutMs);
    return cancel;
}

export function getAllStores() {
    const out = new Map();
    quietly(() => {
        syncRuntimeCache();
        for (const exports of moduleCache.values()) {
            if (isSkippable(exports)) continue;
            let keys;
            try { keys = Object.keys(exports); } catch { continue; }
            for (const k of keys) {
                if (!k.startsWith("use") || out.has(k)) continue;
                let v;
                try { v = exports[k]; } catch { continue; }
                if (isZustandStore(v)) out.set(k, v);
            }
        }
    });
    return out;
}

// ---------- React ----------
let reactCache = null;
export function getReact() {
    if (reactCache) return reactCache;
    reactCache = find(v => typeof v.createElement === "function" && typeof v.useState === "function" && typeof v.Component === "function" && typeof v.Fragment !== "undefined" && v.version != null) || null;
    return reactCache;
}
export { rescanRuntimeCache };
