// 提示:站点提供了原生提示函数(components.toast)时用它,否则用核心自带的;另有常驻提示条
import { h, useSubscription } from "./react.js";
import { getSite } from "../lib/sites.js";
import { Logger } from "../lib/logger.js";
import { addLayer, ensureRoot } from "./root.js";
import { InfoIcon, WarningIcon, CheckIcon, CloseIcon } from "./icons.js";

const logger = new Logger("Toast", "#fbcfe8");

export const ToastType = Object.freeze({
    MESSAGE: "MESSAGE", SUCCESS: "SUCCESS", ERROR: "ERROR", INFO: "INFO", WARNING: "WARNING", LOADING: "LOADING",
});

export function showToast(message, type = ToastType.MESSAGE, options = {}) {
    const toast = siteToast();
    // 站点原生提示不可用时退回核心实现
    if (!toast) return fallbackToast(message, type, options);
    try {
        const fn = {
            SUCCESS: toast.success, ERROR: toast.error, INFO: toast.info, WARNING: toast.warning, LOADING: toast.loading, MESSAGE: toast.message,
        }[String(type).toUpperCase()] || toast;
        return fn.call(toast, message, options);
    } catch (e) {
        logger.warn("显示 toast 失败", e);
        return -1;
    }
}

export function dismissToast(id) {
    if (id && typeof id === "object" && typeof id.remove === "function") { id.remove(); return; }
    try { siteToast()?.dismiss?.(id); } catch { /* 忽略 */ }
}

function siteToast() {
    const c = getSite().components;
    try { return (typeof c === "function" ? c("toast") : c?.toast) ?? null; } catch { return null; }
}

// ---------- 常驻提示条 ----------
let notice = null;
const listeners = new Set();
const emit = () => { for (const l of [...listeners]) l(); };
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
let timer = 0;

export function showNotice({ message, type = "INFO", action, duration } = {}) {
    clearTimeout(timer);
    notice = { message, type: String(type).toUpperCase(), action, id: Date.now() };
    ensureRoot();
    emit();
    if (duration > 0) timer = setTimeout(closeNotice, duration);
}

export function closeNotice() {
    clearTimeout(timer);
    if (!notice) return;
    notice = null;
    emit();
}

const ICONS = { ERROR: WarningIcon, WARNING: WarningIcon, SUCCESS: CheckIcon };

function NoticeHost() {
    useSubscription(subscribe);
    if (!notice) return null;
    const Icon = ICONS[notice.type] || InfoIcon;
    const { action } = notice;
    return h("div", { className: "uspp-notice", "data-type": notice.type, role: "status" },
        h(Icon, { size: 4.5 }),
        h("div", { className: "uspp-notice-msg" }, notice.message),
        action && h("button", { type: "button", className: "uspp-btn uspp-btn-sm", onClick: () => { try { action.onClick?.(); } finally { if (action.close !== false) closeNotice(); } } }, action.label),
        h("button", { type: "button", className: "uspp-btn uspp-btn-icon", "aria-label": "Close", onClick: closeNotice }, h(CloseIcon, { size: 4 })));
}

addLayer("notice", NoticeHost);

// ---------- 核心自带提示(不依赖渲染器,放在独立 shadow root 里避开页面样式) ----------
let toastHost = null;
function fallbackToast(message, type = "MESSAGE", { duration = 3500 } = {}) {
    if (!document.body && !document.documentElement) return -1;
    if (!toastHost || !toastHost.isConnected) {
        toastHost = document.createElement("uspp-toasts");
        const r = toastHost.attachShadow({ mode: "open" });
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(`:host{all:initial}.list{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;font:13px/1.4 system-ui,sans-serif}
.t{background:#222;color:#fff;padding:9px 14px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:360px}.t[data-type=ERROR]{background:#b3261e}.t[data-type=SUCCESS]{background:#1b5e20}`);
            r.adoptedStyleSheets = [sheet];
        } catch { /* 无样式也能用 */ }
        const list = document.createElement("div");
        list.className = "list";
        r.append(list);
        (document.body || document.documentElement).appendChild(toastHost);
    }
    const t = document.createElement("div");
    t.className = "t";
    t.dataset.type = String(type).toUpperCase();
    t.setAttribute("role", "status");
    t.textContent = String(message);
    toastHost.shadowRoot.querySelector(".list").append(t);
    setTimeout(() => t.remove(), duration);
    return t;
}
