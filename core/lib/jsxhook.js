// 渲染层拦截(仅用于补丁被绕过时的运行时兜底,见规格 5.8)
// 替换 react/jsx-runtime 这个 CommonJS 模块导出对象上的 jsx/jsxs,命名空间的 getter 会读到新函数
import { Logger } from "./logger.js";
import { runtime, moduleCache, onModuleLoad } from "./turbopack.js";

const logger = new Logger("RenderHook", "#fca5a5");
const hooks = new Map();   // type -> Set<fn(props, key) => element | undefined>
const stringHooks = new Map();
let installed = false;
let target = null;

function isWritableJsx(exp) {
    try {
        if (!exp || typeof exp !== "object") return false;
        const d = Object.getOwnPropertyDescriptor(exp, "jsx");
        const d2 = Object.getOwnPropertyDescriptor(exp, "jsxs");
        return !!(d && d2 && "value" in d && d.writable && typeof d.value === "function" && typeof d2.value === "function" && exp.Fragment);
    } catch { return false; }
}

function locate() {
    const c = runtime.cache;
    if (c) for (const id of Object.keys(c)) {
        const exp = c[id]?.exports;
        if (isWritableJsx(exp)) return exp;
    }
    for (const exp of moduleCache.values()) if (isWritableJsx(exp)) return exp;
    return null;
}

let busy = false;
function wrap(orig) {
    const wrapped = function (type, props, key) {
        const set = typeof type === "string" ? stringHooks.get(type) : hooks.get(type);
        if (!set || busy || !props) return orig.apply(this, arguments);
        busy = true;
        try {
            for (const fn of set) {
                try {
                    const out = fn(props, key, (p = props) => orig.call(this, type, p, key));
                    if (out !== undefined) return out;
                } catch (e) { logger.error("渲染兜底钩子出错", e); }
            }
        } finally { busy = false; }
        return orig.apply(this, arguments);
    };
    wrapped.$$usppOriginal = orig;
    return wrapped;
}

function install() {
    if (installed) return true;
    target = locate();
    if (!target) return false;
    try {
        target.jsx = wrap(target.jsx);
        target.jsxs = wrap(target.jsxs);
        installed = true;
        logger.debug("已挂接 jsx 运行时");
        return true;
    } catch (e) {
        logger.warn("挂接 jsx 运行时失败", e);
        return false;
    }
}

let waiting = false;
function ensureInstalled() {
    if (install() || waiting) return;
    waiting = true;
    const off = onModuleLoad(() => { if (install()) { off(); waiting = false; } });
}

/**
 * 给某个组件类型(或 "div" 这样的标签)加渲染钩子。
 * fn(props, key, render) 返回元素表示替换;返回 undefined 表示不处理。render(p) 用原始 jsx 生成元素。
 */
export function addRenderHook(type, fn) {
    if (!type) return () => { };
    const map = typeof type === "string" ? stringHooks : hooks;
    let set = map.get(type);
    if (!set) map.set(type, set = new Set());
    set.add(fn);
    ensureInstalled();
    return () => set.delete(fn);
}

export const getOriginalJsx = () => target ? { jsx: target.jsx.$$usppOriginal ?? target.jsx, jsxs: target.jsxs.$$usppOriginal ?? target.jsxs, Fragment: target.Fragment } : null;

// ---------- 元素树小工具 ----------
export const asArray = c => c == null ? [] : Array.isArray(c) ? c : [c];

/** 深度查找子树(只看 props.children,不展开组件)里是否含有满足条件的元素 */
export function treeHas(node, test, depth = 6) {
    if (node == null || depth < 0) return false;
    if (Array.isArray(node)) return node.some(n => treeHas(n, test, depth));
    if (typeof node !== "object") return false;
    if (test(node)) return true;
    return treeHas(node.props?.children, test, depth - 1);
}
