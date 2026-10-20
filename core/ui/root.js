// 本系统自己的界面根:承载弹窗、常驻提示、悬浮按钮,挂在 <body> 上,任何站点都可用
import { Logger } from "../lib/logger.js";
import { h, useSubscription, Fragment, getRenderer } from "./react.js";
import { ErrorBoundary } from "./react.js";
import { installThemeWatcher } from "./theme.js";

const logger = new Logger("UI", "#fbcfe8");
let root = null, host = null, retry = 0;
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

export function ensureRoot() {
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
        root = R.createRoot(host);
        root.render(h(Root, null));
        return true;
    } catch (e) {
        logger.error("创建界面根失败", e);
        host?.remove();
        root = null;
        host = null;
        return false;
    }
}

export function unmountRoot() {
    try { root?.unmount(); } catch { /* 忽略 */ }
    host?.remove();
    root = null;
    host = null;
}

export const getRootHost = () => host;
