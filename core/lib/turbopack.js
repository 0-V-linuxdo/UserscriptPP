// Turbopack 拦截:包装模块工厂、应用补丁、维护模块缓存
import { W, IS_DEV, INSTANCE_KEY, INSTANCE_EXPR } from "../env.js";
import { Logger } from "./logger.js";
import { diag, trace, count } from "./diag.js";
import { applyPatches, canonicalizePatch, canonicalizeFind, describeFind, matchesFind, runPredicate } from "./patches.js";

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
// 已有模块的导出变了(重新执行、注入导出、撤销注入)时递增;只增加新模块时不变。懒查找器据此决定只扫新模块还是全部重扫
let resetVersion = 0;
export const getResetVersion = () => resetVersion;

export const runtime = { registry: null, cache: null, ctx: null };

// ---------- 与其他包装者共存 ----------
// 别人的包装函数会把 toString 改成返回原文;用原生 toString 能看出差别
const hasOwnToString = f => { try { return Object.prototype.hasOwnProperty.call(f, "toString"); } catch { return false; } };
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
    if (diag.noFallback) { trace("fallback.suppressed", String(id)); return; }
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
    trace("patch.lost", { id, why, plugins: meta ? meta.plugins : [] });
    for (const cb of [...lostListeners]) safeLost(cb, id);
}
export const isPatchLost = id => lostModules.has(id);

/** 内置插件启用运行时兜底时登记(进入 patchReport().stats.injectionFallbacks) */
export function registerInjectionFallback(pluginName, detail) {
    if (patchStats.injectionFallbacks.has(pluginName)) return;
    patchStats.injectionFallbacks.add(pluginName);
    trace("fallback.enabled", { plugin: pluginName, detail });
    logger.info(`${pluginName} 的补丁被绕过,已启用运行时兜底${detail ? `(${detail})` : ""}`);
}

/** 补丁过的模块已在运行时缓存里、却没经过本系统的补丁代码执行 => 被外层包装绕过 */
export function checkLostPatches() {
    const c = runtime.cache;
    if (!c) return;
    for (const [id, meta] of metaById) {
        if (meta.ranPatched || lostModules.has(id)) continue;
        const m0 = c[id];
        if (!(m0 && m0.exports != null)) continue;
        meta.resolve?.();
        if (!meta.patched) continue;
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
    // TURBOPACK 已被接管或让给了先装的脚本:之后登记的补丁也用不上,直接记为 bypassed
    if (replacedByOther || yieldedTo) queueMicrotask(bypassPending);
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
    applyInjections(id, exports);
    if (moduleCache.has(id)) resetVersion++;
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
            applyInjections(key, m.exports);
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

// ---------- 导出注入 ----------
// 给源码匹配 find 的模块追加导出(取值函数,收到模块原有的导出对象)。只在本脚本见到的导出对象上加属性,
// 不改运行时的公共方法;已有同名导出时不覆盖。模块已执行过的立即补上,之后执行的在执行完时补上。
const injections = [];
/** 模块工厂的原文(不经别人的 toString,不触发副作用) */
function sourceOf(id) {
    const f = factories.get(id) ?? factories.get(+id) ?? runtime.registry?.get?.(id) ?? runtime.registry?.get?.(+id);
    if (typeof f !== "function") return null;
    try { const o = f[META]?.original ?? f; return isForeignWrapper(o) ? String(o.toString()) : fnToString.call(o); } catch { return null; }
}
function applyInjection(inj, id, exports) {
    if (inj.removed || inj.targets.has(exports)) return false;
    let added = false;
    for (const [name, get] of Object.entries(inj.exports)) {
        if (name in exports) { if (!inj.warned) { inj.warned = true; logger.warn(`injectExports:模块 ${id} 已有导出 ${name},不覆盖`); } continue; }
        try {
            Object.defineProperty(exports, name, { get: () => get(exports), enumerable: true, configurable: true });
            inj.added.push([exports, name]);
            added = true;
        } catch (e) {
            logger.warn(`injectExports:模块 ${id} 的导出对象不能追加属性`, e);
        }
    }
    inj.targets.add(exports);
    if (added) inj.modules.add(id);
    return added;
}
function applyInjections(id, exports) {
    if (!injections.length || exports == null || (typeof exports !== "object" && typeof exports !== "function")) return;
    let src;
    for (const inj of injections) {
        if (inj.removed) continue;
        src ??= sourceOf(id) ?? "";
        if (src && matchesFind(src, inj.find)) applyInjection(inj, id, exports);
    }
}
/**
 * @param find 字符串 / 正则 / 数组(全部命中),同补丁的 find(支持 \i)
 * @param exports { 导出名: 原导出对象 => 值 }
 * @returns 撤销函数(删掉加上的导出)
 */
export function injectExports(find, exports) {
    const inj = { find: canonicalizeFind(find), exports: exports || {}, targets: new WeakSet(), added: [], modules: new Set(), removed: false, warned: false };
    injections.push(inj);
    let changed = false;
    for (const [id] of findInRegistry(src => matchesFind(src, inj.find))) {
        const ex = moduleCache.get(id) ?? (runtime.cache && runtime.cache[id] && !runtime.cache[id].error ? runtime.cache[id].exports : null);
        if (ex != null && applyInjection(inj, id, ex)) changed = true;
    }
    if (changed) { cacheVersion++; resetVersion++; }
    const undo = () => {
        if (inj.removed) return;
        inj.removed = true;
        for (const [ex, name] of inj.added) { try { delete ex[name]; } catch { /* 忽略 */ } }
        injections.splice(injections.indexOf(inj), 1);
        cacheVersion++;
        resetVersion++;
    };
    undo.modules = inj.modules;
    return undo;
}

// ---------- 编译 ----------
const COMPILED = Symbol.for("uspp.compiled");
function getNonce() {
    const s = document.querySelector("script[nonce]");
    return s ? (s.nonce || s.getAttribute("nonce") || "") : "";
}

export function compile(id, code, kind = "turbopack") {
    const sourceURL = `\n//# sourceURL=uspp:///${kind}/module-${String(id).replace(/[^\w.-]/g, "_")}.js`;
    const ns = W[INSTANCE_KEY];
    // 1. 带 nonce 的内联 script(运行在页面上下文,兼容 CSP)
    try {
        if (ns && document.documentElement) {
            const bag = ns[COMPILED]; // 页面桥上预先建好的编译槽
            if (!bag) throw new Error("页面桥上没有编译槽");
            const key = "m" + String(id).replace(/[^\w]/g, "_");
            delete bag[key];
            const el = document.createElement("script");
            const nonce = getNonce();
            if (nonce) el.nonce = nonce;
            el.textContent = `${INSTANCE_EXPR}[Symbol.for("uspp.compiled")][${JSON.stringify(key)}]=(${code}\n);${sourceURL}`;
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
        trace("runtime.captured", { registry: reg.size, cache: Object.keys(cache).length });
        if (diag.noRegistry) trace("registry.skipped");
        else hookRegistry(reg);
        rescanRuntimeCache();
    } catch (e) {
        logger.error("获取运行时注册表失败", e);
    }
}

const nativeMapSet = Map.prototype.set;
/** 这个模块本脚本已经从分块里见过并包装过(外面可能又套了别人的包装) */
export const seenModule = id => metaById.has(id) || metaById.has(String(id)) || metaById.has(+id);
function hookRegistry(reg) {
    const prevSet = reg.set;
    // 已注册但未执行、本脚本又没见过的工厂补上包装。
    // 用原生 Map.set 写回:别的脚本挂在注册表 set 上的处理已经在注册时跑过,不能让它们因为本脚本再跑一遍
    for (const [id, f] of reg) {
        if (typeof f !== "function" || wrappers.has(f) || seenModule(id)) continue;
        if (runtime.cache && runtime.cache[id]) { if (!factories.has(id)) factories.set(id, f); continue; }
        try { nativeMapSet.call(reg, id, wrapFactory(id, f)); trace("registry.rewrap", id); } catch { /* 忽略 */ }
    }
    trace("registry.hooked", { size: reg.size });
    // 之后注册的工厂也包装(保留他人可能已挂上的 set);本脚本已在分块里包装过的模块不再套一层
    reg.set = function (id, f) {
        count("registry.set");
        if (typeof f === "function" && !wrappers.has(f) && !seenModule(id)) { f = wrapFactory(id, f); trace("registry.wrapOnSet", id); }
        return prevSet.call(this, id, f);
    };
}

// 不同打包器的工厂参数不同:适配器告诉包装怎样取运行时、取模块导出、出错后怎样用原始代码重新执行
const TURBOPACK_ADAPTER = {
    kind: "turbopack",
    capture: a => captureRuntime(a[0]),
    exportsOf: a => a[1] && a[1].exports,
    fresh: (self, original, a) => runOriginalFresh(self, original, a[0], a[1], a[2], a),
};

export function wrapFactory(id, original, adapter = TURBOPACK_ADAPTER) {
    if (wrappers.has(original)) return original;
    const existing = wrapperOf.get(original);
    if (existing) return existing;
    if (!factories.has(id)) factories.set(id, original);

    // 别人的包装通常用自有 toString 暴露原文,补丁匹配要看原文。
    // 但别人的 toString 是对方的代码,调用它可能有副作用(例如对方借此生成补丁后的源码并计数):
    // 带自有 toString 的工厂不在包装时调用,等模块真正执行(已注册之后)或有人要看源码时才取
    const lazy = hasOwnToString(original);
    let foreign = false;
    let source = null;
    let resolved = false;

    trace("factory.wrap", { id, lazy });
    const meta = { id, original, patched: false, plugins: [], results: [], code: null, compiled: null, compileFailed: false, deferred: false, ranPatched: false, executing: false };
    const resolve = () => {
        if (resolved) return;
        resolved = true;
        try {
            if (lazy) { const own = String(original.toString()); foreign = own !== fnToString.call(original); source = own; }
            else source = fnToString.call(original);
        } catch { /* 原生函数等 */ }
        if (!source) return;
        if (adapter.normalize) source = adapter.normalize(source);
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
    };
    meta.resolve = resolve;
    if (!lazy) resolve();

    // eslint-disable-next-line no-unused-vars
    const wrapper = function (a0, a1, a2) {
        adapter.capture(arguments);
        resolve();
        trace("factory.run", { id, patched: meta.patched, deferred: meta.deferred });
        let fn = original;
        if (meta.patched && meta.deferred) {
            markLost(id, "内层是其他脚本的包装");
        } else if (meta.patched && !meta.compileFailed) {
            if (!meta.compiled) {
                try {
                    meta.compiled = compile(id, meta.code, adapter.kind);
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
            ret = adapter.fresh(this, original, arguments);
        } finally {
            meta.executing = false;
        }
        try { registerExports(id, adapter.exportsOf(arguments)); } catch (e) { logger.error(e); }
        return ret;
    };
    Object.defineProperty(wrapper, "toString", { value: () => { resolve(); return source != null ? source : fnToString.call(original); }, configurable: true, writable: true });
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
    meta?.resolve?.();
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

const seenChunks = new WeakSet();
function handleChunk(chunk) {
    // 见过的分块记在本脚本自己的 WeakSet 里,不往页面的分块对象上加属性
    if (!Array.isArray(chunk) || seenChunks.has(chunk)) return;
    seenChunks.add(chunk);
    const name = chunkName(chunk[0]);
    if (name) chunkPaths.add(name);
    trace("chunk", { name, length: chunk.length });
    let ids = [];
    for (let i = 1; i < chunk.length; i++) {
        const v = chunk[i];
        if (typeof v === "function") {
            if (ids.length) {
                if (diag.noOwnWrap || (diag.noForeignWrap && hasOwnToString(v))) {
                    // 诊断:别人已包装的工厂原样留下,只记下来
                    if (!factories.has(ids[0])) factories.set(ids[0], v);
                    trace("factory.foreignLeft", ids[0]);
                } else {
                    try { chunk[i] = wrapFactory(ids[0], v); } catch (e) { logger.error("包装工厂失败", e); }
                }
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
const pushWrapperOf = new WeakMap();      // TURBOPACK 值 -> 本脚本装上的 push
const chainedPushOf = new WeakMap();      // TURBOPACK 值 -> 调用过本脚本 push 的外层 push(对方串联的证据)
let pushCalls = 0;                        // 本脚本的 push 包装被调用的次数(判断别人是否串联)
// 脚本可能和页面不在同一个执行环境里(脚本管理器的沙箱):两边的原生 push 都算原生
const isNativePush = f => { try { return f === Array.prototype.push || f === W.Array?.prototype?.push; } catch { return false; } };
let probed = 0;
/**
 * existing:这个值不是经本脚本的 setter 交来的,而是安装时(或从别人的访问器)已经在页面上的。
 * 运行时上来之前 TURBOPACK 是个数组;数组上的 push 不是原生的,说明先装的脚本已经挂了自己的处理。
 * 这时本脚本的 push 包在对方外面,要先把分块交给对方(保持"先装的先处理"),再看分块;
 * 否则先装的脚本看到的就是本脚本包装过的工厂,它的行为会因本脚本在场而改变。
 */
function instrument(value, { existing = false } = {}) {
    if (!value || (typeof value !== "object" && typeof value !== "function") || instrumented.has(value)) return value;
    const origPush = value.push;
    const after = diag.pushAfter || (existing && Array.isArray(value) && typeof origPush === "function" && !isNativePush(origPush));
    if (after) trace("push.after", { existing, array: Array.isArray(value) });
    if (Array.isArray(value)) {
        for (const c of value) handleChunk(c);
    }
    if (typeof origPush === "function") {
        const mine = function (...chunks) {
            pushCalls++;
            count("push");
            // 外层已换成别人的 push 却仍调到这里:对方串联了
            try { const outer = value.push; if (outer !== mine) chainedPushOf.set(value, outer); } catch { /* 忽略 */ }
            if (diag.noRead) return origPush.apply(this, chunks);
            if (diag.probeChunks && probed < 5) {
                probed++;
                const desc = c => { try { return [0, 1, 2].map(i => { const d = Object.getOwnPropertyDescriptor(c, i); return d ? ("get" in d ? "get" : typeof d.value) : "none"; }); } catch (e) { return "err:" + e.message; } };
                trace("chunk.probe", { phase: Array.isArray(value) ? "array" : "runtime", after, n: chunks.length, isArray: chunks.map(c => Array.isArray(c)), desc: chunks.map(desc), protoNative: chunks.map(c => { try { return Object.getPrototypeOf(c) === Array.prototype; } catch { return null; } }) });
            }
            if (after) {
                // 先交给原来的 push(先装的脚本先处理),再看分块
                const r = origPush.apply(this, chunks);
                for (const c of chunks) {
                    try { handleChunk(c); } catch (e) { logger.error("处理分块失败", e); }
                }
                return r;
            }
            for (const c of chunks) {
                try { handleChunk(c); } catch (e) { logger.error("处理分块失败", e); }
            }
            return origPush.apply(this, chunks);
        };
        // 普通赋值,和别人的写法一致:不改 push 的属性形态,免得别的脚本认不出自己装过的处理而重复挂接
        try { value.push = mine; } catch (e) { logger.warn("无法包装 TURBOPACK.push", e); }
        if (value.push === mine) pushWrapperOf.set(value, mine);
    }
    instrumented.add(value);
    return value;
}

let installed = false;
let ourGetter = null;
let yieldedTo = null;       // 让给先装脚本的原因;非空时本脚本没有挂接 TURBOPACK
export const yieldedReason = () => yieldedTo;
/** 其他驱动(webpack)发现分块全局已被别的脚本挂接时调用:和 TURBOPACK 让给先装的脚本一样处理 */
export function yieldDriver(reason) {
    if (yieldedTo) return;
    yieldedTo = reason;
    trace("driver.yield", reason);
    setTimeout(() => { bypassPending(); notifyInactive(); }, 0);
}
export function installInterceptor() {
    if (installed) return;
    installed = true;
    const desc = Object.getOwnPropertyDescriptor(W, "TURBOPACK");
    // 先装的脚本已经挂接了 TURBOPACK(装了访问器,或换了早期数组的 push):本脚本不再挂接。
    // 在对方的处理链上再包一层(哪怕只是在分块交给运行时之前读一遍)都会改变对方的行为,违背"不影响其他脚本";
    // 依赖补丁的功能按"被绕过"处理,框架本身照常
    const pre = desc && ("get" in desc || "set" in desc) ? "TURBOPACK 已是别的脚本装的访问器"
        : desc && Array.isArray(desc.value) && typeof desc.value.push === "function" && !isNativePush(desc.value.push) ? "TURBOPACK.push 已被别的脚本换过" : null;
    if (pre && !diag.coexistActive) {
        yieldedTo = pre;
        trace("turbopack.yield", pre);
        logger.info(`${pre},本脚本不再挂接,以免改变对方的行为;依赖补丁的功能改用渲染兜底或停用`);
        // 等插件登记完补丁再统一记为 bypassed
        setTimeout(() => { bypassPending(); notifyInactive(); }, 0);
        return;
    }
    let current;
    let chainGet = null, chainSet = null;
    if (desc && ("get" in desc || "set" in desc)) {
        // 已被他人定义成访问器:串联,不覆盖其行为
        chainGet = desc.get;
        chainSet = desc.set;
        try { instrument(chainGet ? chainGet.call(W) : undefined, { existing: true }); } catch (e) { logger.warn(e); }
    } else if (desc) {
        current = instrument(desc.value, { existing: true });
    }
    if (diag.noSet) {
        // 诊断:不重定义 window.TURBOPACK,只在现有值上挂 push
        try { instrument(W.TURBOPACK, { existing: true }); } catch { /* 忽略 */ }
        trace("turbopack.install", { existing: desc ? ("get" in desc || "set" in desc ? "accessor" : "value") : "none", noSet: true });
        return;
    }
    if (desc && !desc.configurable) {
        logger.warn("TURBOPACK 不可配置,只能包装其 push");
        try { instrument(W.TURBOPACK, { existing: true }); } catch { /* 忽略 */ }
        return;
    }
    Object.defineProperty(W, "TURBOPACK", {
        configurable: true,
        enumerable: desc ? desc.enumerable : true,
        get: ourGetter = function () {
            count("turbopack.get");
            if (chainGet) {
                const v = chainGet.call(this);
                return instrument(v, { existing: true });
            }
            return current;
        },
        set: function (v) {
            trace("turbopack.set", Array.isArray(v) ? "array" : typeof v);
            v = instrument(v);
            if (chainSet) chainSet.call(this, v);
            else if (!chainGet) current = v;
        },
    });
    logger.debug("已安装打包器拦截");
    trace("turbopack.install", { existing: desc ? ("get" in desc || "set" in desc ? "accessor" : "value") : "none" });
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
    const reg = runtime.registry;
    if (reg instanceof Map || reg instanceof W.Map) for (const [id, f] of reg) consider(id, f);
    else if (reg && typeof reg === "object") for (const id of Object.keys(reg)) consider(isNaN(+id) ? id : +id, reg[id]);
    for (const [id, f] of factories) consider(id, f);
    return out;
}

export function buildReport() {
    const orphaned = [], pending = [];
    for (const p of patches) {
        // TURBOPACK 被接管后没见到的模块不算孤儿(补丁已记为 bypassed)
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
        stats: { ...patchStats, patchedModules: [...patchStats.patchedModules], injectionFallbacks: [...patchStats.injectionFallbacks], takenOver: replacedByOther, yielded: !!yieldedTo },
        results: patchResults.slice(),
        orphaned,
        pending,
        // 已停用插件的补丁只校验不应用(开发构建):find 命中了但 match 失配的
        validateMisses: checkOnlyMismatches.slice(),
        ...(IS_DEV ? { timings: patchTimings() } : {}),
    };
}

/** 每条补丁 find 的累计耗时(开发构建),从慢到快 */
export function patchTimings() {
    return patches.filter(p => p.ms != null).map(p => ({ plugin: p.plugin, find: describeFind(p.rawFind), ms: Math.round(p.ms * 100) / 100 })).sort((a, b) => b.ms - a.ms);
}

/**
 * 在隔离的作用域里执行一个分块文件的文本,只收集它交给 TURBOPACK.push 的参数,不注册、不执行任何模块(补丁检查器用)。
 * 和补丁后的模块一样经 compile 编译,兼容严格 CSP。
 */
export function evaluateChunk(text) {
    const pushes = [];
    const sink = { push: (...cs) => { pushes.push(...cs); return pushes.length; } };
    const fake = new Proxy({ TURBOPACK: sink }, {
        get: (t, k) => (k in t ? t[k] : undefined),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const fn = compile("check-chunk", `function(globalThis,self,window,document,TURBOPACK){${text}\n}`);
    fn.call(fake, fake, fake, fake, { currentScript: null }, sink);
    if (Array.isArray(fake.TURBOPACK)) pushes.push(...fake.TURBOPACK);
    return pushes;
}

export function logHealthReport() {
    const { orphaned } = buildReport();
    if (replacedByOther || yieldedTo) { logger.info(`补丁统计:${yieldedTo ? "TURBOPACK 让给了先装的脚本" : "TURBOPACK 已被其他脚本接管"},${patchStats.bypassed} 条补丁记为 bypassed,依赖它的功能改用渲染兜底或停用`); return; }
    if (orphaned.length) logger.warn(`以下补丁找不到对应模块(孤儿):\n${orphaned.join("\n")}`);
    const noEffect = patchResults.some(r => r.replacements.some(s => s.status === "noEffect"));
    if (patchStats.applied === 0 && (orphaned.length || noEffect)) logger.warn("本次没有任何补丁生效,站点构建很可能已变化");
    if (IS_DEV && checkOnlyMismatches.length) {
        logger.warn("已禁用插件中失配的补丁:", checkOnlyMismatches);
    }
    if (IS_DEV) {
        const slow = patchTimings().filter(t => t.ms >= 5).slice(0, 5);
        if (slow.length) logger.debug(`最慢的 find:${slow.map(t => `${t.plugin} ${t.ms}ms`).join(",")}`);
    }
    logger.info(`补丁统计:applied ${patchStats.applied},bypassed ${patchStats.bypassed},noEffect ${patchStats.noEffect},errors ${patchStats.errors},运行时回退 ${patchStats.runtimeFallbacks},被补丁模块 ${patchStats.patchedModules.size}`);
}

// ---------- 守护 ----------
let lostCheckTimer = 0;
onModuleLoad(() => {
    if (lostCheckTimer) return;
    lostCheckTimer = setTimeout(() => { lostCheckTimer = 0; checkLostPatches(); }, 300);
});

/**
 * 别人在本系统之后接管 TURBOPACK:重定义了属性(含改成 getter)、换了值,或换掉了值上的 push。
 * 对方串联了本脚本的处理(之后的分块仍经过本脚本的 push,或取到的仍是本系统处理过的值且 push 没换)的,照常工作;
 * 没有串联的:记 warn,把还没用上的补丁记为 bypassed 并通知插件改用渲染兜底;不重新挂接、不跟对方争。
 */
let replacedByOther = false;
export const isReplacedByOther = () => replacedByOther;
const takeoverListeners = new Set();
/** TURBOPACK 被接管(且没有串联)时回调;已接管时立即回调 */
export function onTakeover(cb) {
    if (replacedByOther || (yieldedTo && inactiveNotified)) { try { cb(); } catch (e) { logger.error(e); } return () => { }; }
    takeoverListeners.add(cb);
    return () => takeoverListeners.delete(cb);
}
const TAKEOVER_GRACE_MS = 1000;
let suspect = null;     // { why, since, calls }:疑似接管,观察之后的分块是否仍经过本脚本
let chainedValue = null; // 确认串联过的(别人的)TURBOPACK 值,不再怀疑

/** 现在的 TURBOPACK 是否还经过本脚本:不是则返回原因 */
function takeoverReason() {
    const d = Object.getOwnPropertyDescriptor(W, "TURBOPACK");
    if (!d) return null;
    const v = "value" in d ? d.value : (() => { try { return W.TURBOPACK; } catch { return undefined; } })();
    if (v == null) return null;
    if (!instrumented.has(v)) {
        if (v === chainedValue) return null;
        return d.get && d.get !== ourGetter ? "属性被重定义成别人的访问器,取到的值没经过本脚本" : "值被换掉,没经过本脚本";
    }
    const mine = pushWrapperOf.get(v);
    if (!mine) return null;
    const push = v.push;
    if (push === mine || chainedPushOf.get(v) === push) return null;
    return "push 被换掉";
}

function declareTakeover(why) {
    replacedByOther = true;
    trace("takeover", why);
    logger.warn(`TURBOPACK 被其他脚本接管且没有串联本脚本的处理(${why}),不再争夺;之后加载的模块不打补丁,依赖补丁的功能改用渲染兜底或停用`);
    bypassPending();
    notifyInactive();
}
let inactiveNotified = false;
function notifyInactive() {
    inactiveNotified = true;
    for (const cb of [...takeoverListeners]) { try { cb(); } catch (e) { logger.error(e); } }
    if (!runtime.registry) (yieldedTo ? logger.info : logger.warn).call(logger, "没取到打包器的运行时,依赖站点模块的界面入口(渲染兜底等)无法启用;框架设置从脚本管理器菜单打开");
}

/** 还没用上的补丁记为 bypassed,通知 onPatchBypassed 的监听者 */
let takeoverSeq = 0;
function bypassPending() {
    const results = [];
    for (const p of patches) {
        if (p.consumed || p.checkOnly || p.all) continue;
        p.consumed = true;
        const replacements = p.replacement.map(r => ({ match: String(r.match), status: "bypassed", reason: yieldedTo ? "TURBOPACK 让给先装的脚本" : "TURBOPACK 被接管" }));
        patchStats.bypassed += replacements.length;
        results.push({ plugin: p.plugin, find: describeFind(p.rawFind), moduleId: null, replacements });
    }
    patchResults.push(...results);
    if (!results.length) return;
    const id = `(${yieldedTo ? "TURBOPACK 让给先装的脚本" : "TURBOPACK 被接管"} #${++takeoverSeq})`;
    metaById.set(id, { id, patched: true, plugins: [...new Set(results.map(r => r.plugin))], results, ranPatched: false });
    lostModules.add(id);
    for (const cb of [...lostListeners]) safeLost(cb, id);
}

export function watchInstrumentation(durationMs = 20000) {
    if (!installed || yieldedTo) return;
    const until = Date.now() + durationMs;
    const tick = () => {
        if (replacedByOther) return;
        try {
            const why = takeoverReason();
            if (!why) suspect = null;
            else if (!suspect) suspect = { why, since: Date.now(), calls: pushCalls };
            else if (pushCalls > suspect.calls) {
                // 之后的分块仍经过本脚本:对方串联了
                if (why !== "push 被换掉") { try { chainedValue = W.TURBOPACK; } catch { /* 忽略 */ } }
                suspect = null;
            } else if (Date.now() - suspect.since >= TAKEOVER_GRACE_MS) { declareTakeover(why); return; }
        } catch { /* 忽略 */ }
        // 观察期结束时还有疑似接管的,看完宽限期再定
        if (Date.now() < until || suspect) setTimeout(tick, 50);
    };
    tick();
}
