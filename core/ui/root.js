// 本系统自己的界面根:承载弹窗、常驻提示、悬浮按钮,挂在 <body> 上,任何站点都可用
import { Logger } from "../lib/logger.js";
import { h, useSubscription, Fragment, getRenderer, wantUi } from "./react.js";
import { ErrorBoundary } from "./react.js";
import { installThemeWatcher } from "./theme.js";
import { attachShadowStyles } from "../lib/styles.js";
import { getSite } from "../lib/sites.js";

const logger = new Logger("UI", "#fbcfe8");
let root = null, host = null, shadow = null, retry = 0;
const layers = new Map(); // key -> Component
const listeners = new Set();
const emit = () => { for (const l of [...listeners]) l(); };
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

/** 在根里登记一层 UI(弹窗宿主、提示宿主) */
export function addLayer(key, Component) {
    layers.set(key, Component);
    emit();
}

function Root() {
    useSubscription(subscribe);
    return h(Fragment, null, [...layers].map(([key, C]) => h(ErrorBoundary, { key, label: key }, h(C, null))));
}

// 阻止事件冒泡到 document,避免站点已打开的对话框把点击当成"外部点击"而关闭
const STOP = ["pointerdown", "mousedown", "touchstart", "focusin", "focusout", "wheel"];

/** interactive:用户主动打开的界面,站点渲染器迟迟不来时不必等到站点就绪(见 react.js 的 INTERACTIVE_WAIT_MS) */
export function ensureRoot({ interactive = false } = {}) {
    if (interactive) wantUi();
    if (root) {
        if (host && !host.isConnected && document.body) document.body.appendChild(host);
        return true;
    }
    const R = getRenderer();
    if (!R || !document.body) {
        // 渲染器或 <body> 还没好:稍后自动再试,已登记的弹窗届时显示
        if (!retry) retry = setTimeout(() => { retry = 0; ensureRoot(); }, 300);
        return false;
    }
    installThemeWatcher();
    try {
        host = document.createElement("uspp-root");
        for (const t of STOP) host.addEventListener(t, e => e.stopPropagation());
        document.body.appendChild(host);
        // 界面放进 Shadow DOM:站点的 button {}、* {} 这类宽泛规则进不来;本系统的样式由 styles.js 同步进去。
        // 站点写 uiShadow: false 时不用(例如要让站点样式作用到框架界面上)
        let mount = host;
        if (getSite()?.uiShadow !== false && typeof host.attachShadow === "function") {
            shadow = host.attachShadow({ mode: "open" });
            mount = document.createElement("div");
            mount.className = "uspp-shadow-mount";
            shadow.appendChild(mount);
            attachShadowStyles(shadow);
        }
        root = R.createRoot(mount);
        root.render(h(Root, null));
        return true;
    } catch (e) {
        logger.error("创建界面根失败", e);
        host?.remove();
        root = null;
        host = null;
        shadow = null;
        return false;
    }
}

export function unmountRoot() {
    try { root?.unmount(); } catch { /* 忽略 */ }
    host?.remove();
    root = null;
    host = null;
    shadow = null;
}

export const getRootHost = () => host;
/** 界面所在的根:Shadow DOM 里时是 shadow root,否则是 document */
export const getUiRoot = () => shadow || document;
/** 在框架界面里找元素:先找 Shadow DOM 里,再找页面上(嵌进站点设置界面的页面在页面 DOM 里) */
export const queryUi = sel => (shadow && shadow.querySelector(sel)) || document.querySelector(sel);
/** 当前获得焦点的元素,穿过本系统的 shadow root */
export function activeElement() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
}
