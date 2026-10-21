// 渲染器:当前站点提供了自己的 React 时用站点的(界面可以混用站点原生组件),否则用内置的 Preact(兼容层)
import * as Compat from "preact/compat";
import { diag } from "../lib/diag.js";
import { getSite } from "../lib/sites.js";

const bundled = Object.freeze({
    name: "preact",
    site: false,
    React: Compat,
    createRoot: container => ({ render: v => Compat.render(v, container), unmount: () => Compat.render(null, container) }),
    createPortal: Compat.createPortal,
    flushSync: Compat.flushSync ?? (fn => fn()),
});

let locked = null;
let siteReadyFlag = false;
export function markSiteReady() { siteReadyFlag = true; }

/**
 * 站点的 renderer() 返回 { React, createRoot, createPortal?, flushSync? } 或 null(还没加载)。
 * 一旦取到就固定下来,同一页面不混用两套渲染器;站点就绪后仍取不到时退回内置渲染器。
 */
export function getRenderer() {
    if (locked) return locked;
    const site = getSite();
    if (typeof site.renderer === "function") {
        let r = null;
        try { r = site.renderer(); } catch { r = null; }
        if (r && r.React && typeof r.createRoot === "function") return (locked = Object.freeze({ name: "site", site: true, flushSync: fn => fn(), ...r }));
        if (!siteReadyFlag) return null;
    }
    return (locked = bundled);
}
export const getReact = () => getRenderer()?.React ?? null;
/** 当前渲染器是不是站点自己的(只有这时才能用站点原生组件) */
export const usingSiteRenderer = () => !!getRenderer()?.site;

/** 站点原生组件(站点 components 里提供的);当前不是站点渲染器或没有时为 null */
export function siteComponent(name) {
    if (!usingSiteRenderer() || diag.noSiteComponents) return null;
    const c = getSite().components;
    try { return (typeof c === "function" ? c(name) : c?.[name]) ?? null; } catch { return null; }
}

export const Fragment = Symbol.for("react.fragment");

export function h(type, props, ...children) {
    const R = getReact();
    if (!R) throw new Error("Userscript++: 渲染器尚未就绪");
    if (type === Fragment) type = R.Fragment;
    return R.createElement(type, props, ...children);
}

const hook = name => (...args) => getReact()[name](...args);
export const useState = hook("useState");
export const useEffect = hook("useEffect");
export const useLayoutEffect = hook("useLayoutEffect");
export const useMemo = hook("useMemo");
export const useRef = hook("useRef");
export const useCallback = hook("useCallback");
export const useReducer = hook("useReducer");
export const useContext = hook("useContext");
export const useId = hook("useId");
export const useSyncExternalStore = hook("useSyncExternalStore");

export function useForceUpdate() {
    const [, f] = useReducer(x => x + 1, 0);
    return f;
}

/** 订阅一个 subscribe(fn)=>unsub 风格的来源,变化时重渲染 */
export function useSubscription(subscribe) {
    const force = useForceUpdate();
    useEffect(() => subscribe(() => force()), []);
}

// ---------- ErrorBoundary ----------
const EBs = new WeakMap(); // React 实现 -> ErrorBoundary 类
export function getErrorBoundary() {
    const R = getReact();
    if (!R) return null;
    if (EBs.has(R)) return EBs.get(R);
    class ErrorBoundary extends R.Component {
        constructor(props) {
            super(props);
            this.state = { error: null };
        }
        static getDerivedStateFromError(error) { return { error }; }
        componentDidCatch(error, info) {
            console.error("[Userscript++] 组件渲染出错", this.props.label || "", error, info?.componentStack);
            this.props.onError?.(error);
        }
        render() {
            if (this.state.error) {
                const fb = this.props.fallback;
                return typeof fb === "function" ? fb(this.state.error) : (fb ?? null);
            }
            return this.props.children ?? null;
        }
    }
    EBs.set(R, ErrorBoundary);
    return ErrorBoundary;
}

/** 可在 React 就绪前引用的 ErrorBoundary 组件 */
export function ErrorBoundary(props) {
    const C = getErrorBoundary();
    return C ? h(C, props) : props.children;
}
ErrorBoundary.wrap = (Component, fallback = null) => {
    const Wrapped = props => h(ErrorBoundary, { fallback, label: Component.displayName || Component.name }, h(Component, props));
    Wrapped.displayName = `UsppBoundary(${Component.displayName || Component.name || "Component"})`;
    return Wrapped;
};
