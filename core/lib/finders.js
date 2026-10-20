// 运行时模块查找
import { W } from "../env.js";
import { Logger } from "./logger.js";
import { proxyLazy } from "./lazy.js";
import { matchesOne } from "./patches.js";
import { canonicalizeRegex } from "./patches.js";
import {
    moduleCache, onModuleLoad, runtime, findInRegistry, getCacheVersion, rescanRuntimeCache, syncRuntimeCache,
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

export function find(filter, { all = false } = {}) {
    if (typeof filter !== "function") throw new TypeError("filter 必须是函数");
    return quietly(() => {
        const found = [];
        const seen = new Set();
        syncRuntimeCache();
        for (const exports of moduleCache.values()) {
            for (const v of candidates(exports)) {
                if (v == null || (typeof v !== "object" && typeof v !== "function")) continue;
                if (seen.has(v)) continue;
                if (v !== exports && isSkippable(v)) continue;
                if (testSafe(filter, v)) {
                    if (!all) return v;
                    seen.add(v);
                    found.push(v);
                }
            }
        }
        return all ? found : null;
    });
}
export const findAll = filter => find(filter, { all: true });

// ---------- 过滤器 ----------
const codeOf = f => { try { return fnToString.call(f); } catch { return ""; } };
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
    const m = find(v => names.some(n => v[n] != null && (typeof v[n] === "function" || typeof v[n] === "object")));
    if (!m) return null;
    for (const n of names) if (m[n] != null) return m[n];
    return null;
}
export function findStore(name) {
    const key = storeKey(name);
    const m = find(v => isZustandStore(v[key]));
    return m ? m[key] : null;
}

// ---------- Lazy 版本 ----------
function retryOnChange() {
    let last = -1;
    return () => {
        const v = getCacheVersion();
        if (v === last) return false;
        last = v;
        return true;
    };
}
const lazy = fn => proxyLazy(fn, retryOnChange());

function lazyComponent(resolveFn, label) {
    let cached = null, last = -1;
    const get = () => {
        if (cached) return cached;
        const v = getCacheVersion();
        if (v === last) return null;
        last = v;
        cached = resolveFn();
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

export const findLazy = filter => lazy(() => find(filter));
export const findByPropsLazy = (...keys) => lazy(() => findByProps(...keys));
export const findByCodeLazy = (...ps) => lazy(() => findByCode(...ps));
export const findByDisplayNameLazy = name => lazyComponent(() => findByDisplayName(name), name);
export const findComponentByCodeLazy = (...ps) => lazyComponent(() => findComponentByCode(...ps), String(ps[0]));
export const findExportedComponentLazy = (...names) => lazyComponent(() => findExportedComponent(...names), names[0]);
export const findStoreLazy = name => lazy(() => findStore(name));

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
