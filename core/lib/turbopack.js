// Turbopack 拦截:包装模块工厂、应用补丁、维护模块缓存
import { W, IS_DEV } from "../env.js";
import { Logger } from "./logger.js";
import { applyPatches, canonicalizePatch, describeFind, matchesFind, runPredicate } from "./patches.js";

const logger = new Logger("Turbopack", "#93c5fd");
const fnToString = Function.prototype.toString;
const META = Symbol.for("uspp.factory");

export const patches = [];          // 已登记且未消耗的补丁(含已消耗,报告时过滤)
export const patchResults = [];
export const patchStats = { applied: 0, bypassed: 0, noEffect: 0, errors: 0, runtimeFallbacks: 0, patchedModules: new Set(), injectionFallbacks: new Set() };
export const checkOnlyMismatches = [];

export const moduleCache = new Map();      // id -> exports
export const factories = new Map();        // id -> 原始工厂(本系统见过的)
export const chunkPaths = new Set();

const wrapperOf = new WeakMap();           // 原始工厂 -> 包装
const wrappers = new WeakSet();
const metaById = new Map();                // id -> meta
const loadListeners = new Set();
let cacheVersion = 0;
export const getCacheVersion = () => cacheVersion;

export const runtime = { registry: null, cache: null, ctx: null };

// ---------- 与其他包装者共存 ----------
// 别人的包装函数会把 toString 改成返回原文;用原生 toString 能看出差别
function isForeignWrapper(f) {
    try {
        if (!Object.prototype.hasOwnProperty.call(f, "toString")) return false;
        return fnToString.call(f) !== String(f.toString());
    } catch { return false; }
}

const lostListeners = new Set();
const lostModules = new Set();
export const onPatchLost = cb => { lostListeners.add(cb); for (const id of lostModules) safeLost(cb, id); return () => lostListeners.delete(cb); };
/** 某插件的补丁被 bypassed 时回调 cb(results, moduleId);兜底怎么做由站点适配和插件自己决定 */
export function onPatchBypassed(pluginName, cb) {
    return onPatchLost((id, _plugins, results) => {
        const mine = results.filter(r => r.plugin === pluginName);
        if (mine.length) cb(mine, id);
    });
}
function safeLost(cb, id) {
    const meta = metaById.get(id);
    try { cb(id, meta ? meta.plugins.slice() : [], meta ? meta.results.filter(r => r.replacements.some(x => x.status === "bypassed")) : []); } catch (e) { logger.error("补丁失效监听者出错", e); }
}
const appliedEntries = meta => meta.results.flatMap(r => r.replacements.filter(x => x.status === "applied"));

function markRan(meta) {
    if (meta.ranPatched) return;
    meta.ranPatched = true;
    patchStats.applied += appliedEntries(meta).length;
}

function markLost(id, why) {
    if (lostModules.has(id)) return;
    lostModules.add(id);
    const meta = metaById.get(id);
    if (meta) {
        const entries = appliedEntries(meta);
        for (const e of entries) { e.status = "bypassed"; e.reason = why; }
        patchStats.bypassed += entries.length;
    }
    logger.warn(`模块 ${id} 的补丁没有生效(${why}),相关插件改用运行时兜底:${meta ? meta.plugins.join(", ") : ""}`);
    for (const cb of [...lostListeners]) safeLost(cb, id);
}
export const isPatchLost = id => lostModules.has(id);

/** 内置插件启用运行时兜底时登记(进入 patchReport().stats.injectionFallbacks) */
export function registerInjectionFallback(pluginName, detail) {
    if (patchStats.injectionFallbacks.has(pluginName)) return;
    patchStats.injectionFallbacks.add(pluginName);
    logger.info(`${pluginName} 的补丁被绕过,已启用运行时兜底${detail ? `(${detail})` : ""}`);
}

/** 补丁过的模块已在运行时缓存里、却没经过本系统的补丁代码执行 => 被外层包装绕过 */
export function checkLostPatches() {
    const c = runtime.cache;
    if (!c) return;
    for (const [id, meta] of metaById) {
        if (!meta.patched || meta.ranPatched || lostModules.has(id)) continue;
        const m = c[id];
        if (m && m.exports != null && !meta.executing) markLost(id, "被其他脚本的包装绕过");
    }
}

// ---------- 补丁登记 ----------
const registeredKeys = new Set();
/** self:补丁里 $self 指向的表达式,缺省为该插件对象 */
export function addPatch(patch, pluginName, { checkOnly = false, key, self } = {}) {
    if (key) {
        if (registeredKeys.has(key)) return null;
        registeredKeys.add(key);
    }
    if (!runPredicate(patch.predicate, pluginName)) return null;
    const p = canonicalizePatch(patch, pluginName, checkOnly, self);
    patches.push(p);
    return p;
}

export const activePatches = () => patches.filter(p => !p.consumed && !p.checkOnly);

// ---------- 模块加载通知 ----------
export function onModuleLoad(cb) {
    loadListeners.add(cb);
    return () => loadListeners.delete(cb);
}

function registerExports(id, exports) {
    if (exports == null) return;
    moduleCache.set(id, exports);
    cacheVersion++;
    for (const cb of [...loadListeners]) {
        try { cb(exports, id); } catch (e) { logger.error("模块加载监听者出错", e); }
    }
}

/** 把运行时缓存里本系统还没见过的模块并入(注入前已执行的模块) */
export function rescanRuntimeCache() {
    const c = runtime.cache;
    if (!c) return 0;
    const fresh = [];
    for (const id of Object.keys(c)) {
        const key = isNaN(+id) ? id : +id;
        if (moduleCache.has(key)) continue;
        const m = c[id];
        if (m && !m.error && m.exports != null) {
            moduleCache.set(key, m.exports);
            fresh.push([key, m.exports]);
        }
    }
    if (fresh.length) cacheVersion++;
    for (const [key, exports] of fresh) {
        for (const cb of [...loadListeners]) {
            try { cb(exports, key); } catch (e) { logger.error("模块加载监听者出错", e); }
        }
    }
    return fresh.length;
}

/** 运行时缓存条数变了才重扫;他人的包装可能让模块绕过本系统的工厂包装 */
let lastRuntimeCount = -1;
export function syncRuntimeCache() {
    const c = runtime.cache;
    if (!c) return 0;
    let n;
    try { n = Object.keys(c).length; } catch { return 0; }
    if (n === lastRuntimeCount) return 0;
    lastRuntimeCount = n;
    return rescanRuntimeCache();
}

// ---------- 编译 ----------
const COMPILED = Symbol.for("uspp.compiled");
function getNonce() {
    const s = document.querySelector("script[nonce]");
    return s ? (s.nonce || s.getAttribute("nonce") || "") : "";
}

function compile(id, code) {
    const sourceURL = `\n//# sourceURL=uspp:///turbopack/module-${String(id).replace(/[^\w.-]/g, "_")}.js`;
    const ns = W.UserscriptPP;
    // 1. 带 nonce 的内联 script(运行在页面上下文,兼容 CSP)
    try {
        if (ns && document.documentElement) {
            const bag = ns[COMPILED] || (Object.defineProperty(ns, COMPILED, { value: Object.create(null) }), ns[COMPILED]);
            const key = "m" + String(id).replace(/[^\w]/g, "_");
            delete bag[key];
            const el = document.createElement("script");
            const nonce = getNonce();
            if (nonce) el.nonce = nonce;
            el.textContent = `window.UserscriptPP[Symbol.for("uspp.compiled")][${JSON.stringify(key)}]=(${code}\n);${sourceURL}`;
            (document.head || document.documentElement).appendChild(el);
            el.remove();
            const fn = bag[key];
            delete bag[key];
            if (typeof fn === "function") return fn;
        }
    } catch (e) {
        logger.debug("内联 script 编译失败,改用 Function", e);
    }
    // 2. 退回 new Function
    const F = W.Function || Function;
    return new F(`return (${code}\n);${sourceURL}`)();
}

// ---------- 包装 ----------
function captureRuntime(ctx) {
    if (runtime.registry || !ctx || typeof ctx !== "object") return;
    try {
        const proto = Object.getPrototypeOf(ctx);
        const reg = proto && proto.M;
        const cache = proto && proto.c;
        if (!(reg instanceof W.Map || reg instanceof Map) || !cache || typeof cache !== "object") return;
        runtime.registry = reg;
        runtime.cache = cache;
        runtime.ctx = ctx;
        hookRegistry(reg);
        rescanRuntimeCache();
    } catch (e) {
        logger.error("获取运行时注册表失败", e);
    }
}

function hookRegistry(reg) {
    const prevSet = reg.set;
    // 已注册但未执行的工厂补上包装
    for (const [id, f] of reg) {
        if (typeof f !== "function" || wrappers.has(f)) continue;
        if (runtime.cache && runtime.cache[id]) { if (!factories.has(id)) factories.set(id, f); continue; }
        try { prevSet.call(reg, id, wrapFactory(id, f)); } catch { /* 忽略 */ }
    }
    // 之后注册的工厂也包装(保留他人可能已挂上的 set)
    reg.set = function (id, f) {
        if (typeof f === "function" && !wrappers.has(f)) f = wrapFactory(id, f);
        return prevSet.call(this, id, f);
    };
}

export function wrapFactory(id, original) {
    if (wrappers.has(original)) return original;
    const existing = wrapperOf.get(original);
    if (existing) return existing;
    if (!factories.has(id)) factories.set(id, original);

    // 别人的包装通常用自有 toString 暴露原文,补丁匹配要看原文
    const foreign = isForeignWrapper(original);
    let source = null;
    try { source = foreign ? String(original.toString()) : fnToString.call(original); } catch { /* 原生函数等 */ }

    const meta = { id, original, patched: false, plugins: [], results: [], code: null, compiled: null, compileFailed: false, deferred: false, ranPatched: false, executing: false };
    if (source) {
        const res = applyPatches(id, source, patches, patchStats);
        if (res.results.length) patchResults.push(...res.results);
        if (res.mismatches.length) checkOnlyMismatches.push(...res.mismatches);
        if (res.code !== source) {
            meta.patched = true;
            meta.results = res.results;
            meta.plugins = res.applied;
            meta.code = res.code;
            patchStats.patchedModules.add(id);
            // 内层已是别人的包装:不替换执行,保住对方的补丁
            meta.deferred = foreign;
        }
    }

    const wrapper = function (ctx, mod, exp) {
        captureRuntime(ctx);
        let fn = original;
        if (meta.patched && meta.deferred) {
            markLost(id, "内层是其他脚本的包装");
        } else if (meta.patched && !meta.compileFailed) {
            if (!meta.compiled) {
                try {
                    meta.compiled = compile(id, meta.code);
                } catch (e) {
                    meta.compileFailed = true;
                    patchStats.errors++;
                    logger.error(`模块 ${id} 补丁后编译失败,改用原始代码(${meta.plugins.join(", ")})`, e);
                }
            }
            if (meta.compiled) fn = meta.compiled;
            else markLost(id, "编译失败");
        }
        let ret;
        meta.executing = true;
        try {
            ret = fn.apply(this, arguments);
            if (fn !== original) markRan(meta);
        } catch (e) {
            if (fn === original) throw e;
            meta.ranPatched = false;
            markLost(id, "运行出错");
            patchStats.runtimeFallbacks++;
            logger.error(`模块 ${id} 补丁后运行出错,改用原始代码重新执行(${meta.plugins.join(", ")})`, e);
            ret = runOriginalFresh(this, original, ctx, mod, exp, arguments);
        } finally {
            meta.executing = false;
        }
        try { registerExports(id, mod && mod.exports); } catch (e) { logger.error(e); }
        return ret;
    };
    Object.defineProperty(wrapper, "toString", { value: () => (source != null ? source : fnToString.call(original)), configurable: true, writable: true });
    Object.defineProperty(wrapper, "name", { value: original.name, configurable: true });
    Object.defineProperty(wrapper, META, { value: meta });
    wrappers.add(wrapper);
    wrapperOf.set(original, wrapper);
    if (!metaById.has(id)) metaById.set(id, meta);
    return wrapper;
}

function runOriginalFresh(self, original, ctx, mod, exp, args) {
    try {
        if (mod && ctx && typeof ctx === "object") {
            const fresh = {};
            mod.exports = fresh;
            mod.namespaceObject = undefined;
            mod.error = undefined;
            const Ctor = Object.getPrototypeOf(ctx).constructor;
            const freshCtx = new Ctor(mod, fresh);
            return original.call(self, freshCtx, mod, fresh);
        }
    } catch (e) {
        if (!(e instanceof TypeError)) throw e;
    }
    return original.apply(self, args);
}

export function getPatchedCode(id) {
    const meta = metaById.get(id) ?? metaById.get(+id) ?? metaById.get(String(id));
    return meta && meta.patched ? meta.code : null;
}
export const getFactoryMeta = id => metaById.get(id) ?? metaById.get(+id) ?? null;

// ---------- 分块推入 ----------
function chunkName(head) {
    try {
        if (typeof head === "string") return head;
        if (head && typeof head.getAttribute === "function") return head.getAttribute("src") || "";
        if (head && typeof head.src === "string") return head.src;
    } catch { /* 忽略 */ }
    return "";
}

function handleChunk(chunk) {
    if (!Array.isArray(chunk) || chunk.$$usppSeen) return;
    try { Object.defineProperty(chunk, "$$usppSeen", { value: true }); } catch { /* 冻结数组 */ }
    const name = chunkName(chunk[0]);
    if (name) chunkPaths.add(name);
    let ids = [];
    for (let i = 1; i < chunk.length; i++) {
        const v = chunk[i];
        if (typeof v === "function") {
            if (ids.length) {
                try { chunk[i] = wrapFactory(ids[0], v); } catch (e) { logger.error("包装工厂失败", e); }
            }
            ids = [];
        } else if (typeof v === "number" || typeof v === "string") {
            ids.push(v);
        } else {
            ids = [];
        }
    }
}

const instrumented = new WeakSet();
function instrument(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function") || instrumented.has(value)) return value;
    if (Array.isArray(value)) {
        for (const c of value) handleChunk(c);
    }
    const origPush = value.push;
    if (typeof origPush === "function") {
        try {
            value.push = function (...chunks) {
                for (const c of chunks) {
                    try { handleChunk(c); } catch (e) { logger.error("处理分块失败", e); }
                }
                return origPush.apply(this, chunks);
            };
        } catch (e) {
            logger.warn("无法包装 TURBOPACK.push", e);
        }
    }
    instrumented.add(value);
    return value;
}

let installed = false;
export function installInterceptor() {
    if (installed) return;
    installed = true;
    const desc = Object.getOwnPropertyDescriptor(W, "TURBOPACK");
    let current;
    let chainGet = null, chainSet = null;
    if (desc && ("get" in desc || "set" in desc)) {
        // 已被他人定义成访问器:串联,不覆盖其行为
        chainGet = desc.get;
        chainSet = desc.set;
        try { instrument(chainGet ? chainGet.call(W) : undefined); } catch (e) { logger.warn(e); }
    } else if (desc) {
        current = instrument(desc.value);
    }
    if (desc && !desc.configurable) {
        logger.warn("TURBOPACK 不可配置,只能包装其 push");
        try { instrument(W.TURBOPACK); } catch { /* 忽略 */ }
        return;
    }
    Object.defineProperty(W, "TURBOPACK", {
        configurable: true,
        enumerable: desc ? desc.enumerable : true,
        get() {
            if (chainGet) {
                const v = chainGet.call(this);
                return instrument(v);
            }
            return current;
        },
        set(v) {
            v = instrument(v);
            if (chainSet) chainSet.call(this, v);
            else if (!chainGet) current = v;
        },
    });
    logger.debug("已安装打包器拦截");
}

// ---------- 报告 ----------
export function findInRegistry(test) {
    const out = [];
    const seen = new Set();
    const consider = (id, f) => {
        if (seen.has(id) || typeof f !== "function") return;
        seen.add(id);
        let src;
        try { const o = f[META]?.original ?? f; src = isForeignWrapper(o) ? String(o.toString()) : fnToString.call(o); } catch { return; }
        if (test(src, id)) out.push([id, f]);
    };
    if (runtime.registry) for (const [id, f] of runtime.registry) consider(id, f);
    for (const [id, f] of factories) consider(id, f);
    return out;
}

export function buildReport() {
    const orphaned = [], pending = [];
    for (const p of patches) {
        if (p.consumed || p.all || p.checkOnly) continue;
        const pend = findInRegistry(src => { try { return matchesFind(src, p.find); } catch { return false; } });
        const entry = `${p.plugin}: ${describeFind(p.rawFind)}`;
        if (pend.length) pending.push(entry);
        else if (!p.noWarn) orphaned.push(entry);
    }
    return { orphaned, pending };
}

export function patchReport() {
    const { orphaned, pending } = buildReport();
    return {
        stats: { ...patchStats, patchedModules: [...patchStats.patchedModules], injectionFallbacks: [...patchStats.injectionFallbacks] },
        results: patchResults.slice(),
        orphaned,
        pending,
    };
}

export function logHealthReport() {
    const { orphaned } = buildReport();
    if (orphaned.length) logger.warn(`以下补丁找不到对应模块(孤儿):\n${orphaned.join("\n")}`);
    const noEffect = patchResults.some(r => r.replacements.some(s => s.status === "noEffect"));
    if (patchStats.applied === 0 && (orphaned.length || noEffect)) logger.warn("本次没有任何补丁生效,站点构建很可能已变化");
    if (IS_DEV && checkOnlyMismatches.length) {
        logger.warn("已禁用插件中失配的补丁:", checkOnlyMismatches);
    }
    logger.info(`补丁统计:applied ${patchStats.applied},bypassed ${patchStats.bypassed},noEffect ${patchStats.noEffect},errors ${patchStats.errors},运行时回退 ${patchStats.runtimeFallbacks},被补丁模块 ${patchStats.patchedModules.size}`);
}

// ---------- 守护 ----------
let lostCheckTimer = 0;
onModuleLoad(() => {
    if (lostCheckTimer) return;
    lostCheckTimer = setTimeout(() => { lostCheckTimer = 0; checkLostPatches(); }, 300);
});

/** 别人在本系统之后重定义了 TURBOPACK 且没有串联时,重新包装当前值的 push */
export function watchInstrumentation(durationMs = 20000) {
    const until = Date.now() + durationMs;
    const tick = () => {
        try {
            const v = W.TURBOPACK;
            if (v && !instrumented.has(v)) {
                logger.warn("TURBOPACK 被其他脚本替换,重新挂接");
                instrument(v);
            }
        } catch { /* 忽略 */ }
        if (Date.now() < until) setTimeout(tick, 50);
    };
    tick();
}
