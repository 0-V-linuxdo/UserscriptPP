// webpack 驱动:接管站点的分块全局(webpack 5 的 self.webpackChunk<名字>,或 webpack 4 的 webpackJsonp),
// 分块交给运行时之前把其中的模块工厂换成本系统的包装(补丁、导出登记和 Turbopack 驱动共用一套)。
// 守"串联、不独占":分块全局已经是别人装的访问器时让给对方;push 只包一层,运行时之后换上的 push 照样经过本层再交给它
import { W } from "../env.js";
import { Logger } from "./logger.js";
import { trace } from "./diag.js";
import { wrapFactory, runtime, chunkPaths, rescanRuntimeCache, seenModule, yieldDriver } from "./turbopack.js";

const logger = /* @__PURE__ */ new Logger("Webpack", "#86efac");

/** 第一次执行模块时从第三个参数(__webpack_require__)上取工厂表 .m 和模块缓存 .c */
function captureRequire(req) {
    if (typeof req !== "function") return;
    if (runtime.require) {
        // 运行时在模块执行前就拿到了(见 hookRuntimeAssignment),这时 .c 才有
        if (runtime.require === req && !runtime.cache && req.c && typeof req.c === "object") { runtime.cache = req.c; rescanRuntimeCache(); }
        return;
    }
    runtime.require = req;
    const m = req.m, c = req.c;
    if (!m || typeof m !== "object") { trace("webpack.runtime", { modules: null }); return; }
    runtime.registry = m;
    if (c && typeof c === "object") runtime.cache = c;
    trace("webpack.runtime", { modules: Object.keys(m).length, cache: !!c });
    // 已登记、还没执行、本系统又没见过的工厂补上包装(注入较晚时)
    for (const id of Object.keys(m)) {
        const key = isNaN(+id) ? id : +id;
        const f = m[id];
        if (typeof f !== "function" || seenModule(key) || (c && c[id])) continue;
        try { m[id] = wrapFactory(key, f, ADAPTER); } catch { /* 忽略 */ }
    }
    if (runtime.cache) rescanRuntimeCache();
}

// 方法简写的工厂(123(e,t,n){...})单独编译时不是合法表达式,补上 function
const METHOD_RE = /^(?!function\b|async\b|class\b)[\w$]+\s*\(/;
const ADAPTER = {
    kind: "webpack",
    capture: a => captureRequire(a[2]),
    exportsOf: a => a[0] && a[0].exports,
    normalize: src => (METHOD_RE.test(src) ? `function ${src.replace(/^[\w$]+/, "")}` : src),
    fresh: (self, original, a) => {
        const mod = a[0];
        if (mod && typeof mod === "object") {
            mod.exports = {};
            return original.call(self, mod, mod.exports, a[2]);
        }
        return original.apply(self, a);
    },
};

const seen = new WeakSet();
/** 分块:[分块 ID 列表, 模块表(对象或数组), 运行时函数?] */
function handleChunk(chunk) {
    if (!Array.isArray(chunk) || seen.has(chunk)) return;
    seen.add(chunk);
    const mods = chunk[1];
    if (!mods || typeof mods !== "object") return;
    try { for (const id of chunk[0] || []) chunkPaths.add(String(id)); } catch { /* 忽略 */ }
    for (const id of Object.keys(mods)) {
        const f = mods[id];
        if (typeof f !== "function") continue;
        const key = isNaN(+id) ? id : +id;
        try { mods[id] = wrapFactory(key, f, ADAPTER); } catch (e) { logger.error("包装工厂失败", e); }
    }
    trace("webpack.chunk", { ids: chunk[0], modules: Object.keys(mods).length });
}

const instrumented = new WeakSet();
/** 在分块数组上装 push 访问器:取到的是本层,运行时赋的新 push 存为下一层 */
function instrument(arr) {
    if (!Array.isArray(arr) || instrumented.has(arr)) return arr;
    instrumented.add(arr);
    for (const c of arr) handleChunk(c);
    const own = Object.getOwnPropertyDescriptor(arr, "push");
    if (own && ("get" in own || "set" in own)) {
        logger.info("分块数组的 push 已是别的脚本装的访问器,只处理已有分块");
        return arr;
    }
    // 每一层 push 各配一个本层包装:运行时会先取 push 绑成"上一层"再赋新 push,
    // 取到的必须是包着当时那层的包装,否则新 push 调上一层时又回到自己,无限递归
    let inner = own ? own.value : arr.push;
    const wrapOf = new WeakMap();
    const wrapped = fn => {
        if (typeof fn !== "function") return fn;
        let w = wrapOf.get(fn);
        if (!w) {
            w = function (...chunks) {
                for (const c of chunks) handleChunk(c);
                return fn.apply(this, chunks);
            };
            wrapOf.set(fn, w);
        }
        return w;
    };
    try {
        Object.defineProperty(arr, "push", {
            configurable: true,
            enumerable: false,
            get: () => wrapped(inner),
            set: v => { inner = v; trace("webpack.push.set"); },
        });
    } catch (e) { logger.warn("无法在分块数组上挂接 push", e); }
    return arr;
}

// ---------- 在任何模块执行之前拿到运行时 ----------
// webpack 5 的运行时启动时执行 __webpack_require__.m = __webpack_modules__;入口块里的模块就在这个对象里,不经过分块数组的 push。
// 在 Function.prototype 上临时装一个 m 的 setter:赋值那一刻还没有模块执行过,把整张表包装好,
// 并把 .m 换成一个代理(之后经 __webpack_require__.m[id] = f 登记的分块模块也会被包装)。拿到一次就撤掉。
const fnToString = Function.prototype.toString;
let protoHooked = false;
function looksLikeModules(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    // 运行时单独成块时模块表一开始是空的,模块随后经 .m[id] = f 登记
    return Object.keys(v).every(k => typeof v[k] === "function");
}
function looksLikeRequire(fn) {
    try { const src = fnToString.call(fn); return src.length < 4000 && src.includes("exports") && src.includes(".call("); } catch { return false; }
}
function modulesProxy(mods) {
    return new Proxy(mods, {
        set(target, id, f) {
            if (typeof f === "function" && typeof id === "string") {
                const key = isNaN(+id) ? id : +id;
                try { f = wrapFactory(key, f, ADAPTER); } catch (e) { logger.error("包装工厂失败", e); }
            }
            target[id] = f;
            return true;
        },
    });
}
function adoptRuntime(req, mods) {
    for (const id of Object.keys(mods)) {
        const key = isNaN(+id) ? id : +id;
        const f = mods[id];
        if (typeof f !== "function") continue;
        try { mods[id] = wrapFactory(key, f, ADAPTER); } catch (e) { logger.error("包装工厂失败", e); }
    }
    runtime.require = req;
    runtime.registry = mods;
    trace("webpack.runtime.early", { modules: Object.keys(mods).length });
    return modulesProxy(mods);
}
function hookRuntimeAssignment() {
    const FP = (W.Function || Function).prototype;
    if (protoHooked || Object.getOwnPropertyDescriptor(FP, "m")) return;
    protoHooked = true;
    const unhook = () => {
        const d = Object.getOwnPropertyDescriptor(FP, "m");
        if (d && d.set === setter) { try { delete FP.m; } catch { /* 忽略 */ } }
    };
    function setter(v) {
        // 不是 webpack 运行时的赋值:照常变成这个函数自己的属性
        let value = v;
        if (this !== FP && typeof this === "function" && !runtime.require && looksLikeModules(v) && looksLikeRequire(this)) {
            value = adoptRuntime(this, v);
            unhook();
        }
        Object.defineProperty(this, "m", { value, writable: true, configurable: true, enumerable: true });
    }
    try {
        Object.defineProperty(FP, "m", { configurable: true, enumerable: false, get: undefined, set: setter });
    } catch (e) { logger.debug("无法在 Function.prototype 上挂接", e); protoHooked = false; return; }
    // 页面加载完还没等到运行时(例如注入太晚,运行时已经跑过):撤掉,改由第一次执行模块时取运行时
    const later = () => setTimeout(unhook, 0);
    if (document.readyState === "complete") later(); else W.addEventListener("load", later, { once: true });
}

let installed = false;
let yielded = null;
export const webpackYielded = () => yielded;

/** global:分块全局的名字(webpackChunk<项目名>,或 webpack 4 的 webpackJsonp);不写时只靠运行时挂接 */
export function installWebpack({ global: name } = {}) {
    if (installed) return;
    installed = true;
    if (name) {
        const desc = Object.getOwnPropertyDescriptor(W, name);
        if (desc && ("get" in desc || "set" in desc)) {
            yielded = `${name} 已是别的脚本装的访问器`;
            logger.info(`${yielded},本脚本不再挂接;依赖补丁的功能按被绕过处理`);
            yieldDriver(yielded);
            return;
        }
        hookRuntimeAssignment();
        let current = desc ? instrument(desc.value) : undefined;
        if (desc && !desc.configurable) return;
        Object.defineProperty(W, name, {
            configurable: true,
            enumerable: desc ? desc.enumerable : true,
            get: () => current,
            set: v => { current = instrument(v); },
        });
        trace("webpack.install", { name, existing: !!desc });
        logger.debug(`已挂接 ${name}`);
        return;
    }
    hookRuntimeAssignment();
    trace("webpack.install", { name: null });
}
