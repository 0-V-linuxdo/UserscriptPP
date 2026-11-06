// 通知:带标题、正文、图标和点击动作的卡片,可同时发系统通知;最近 50 条留在通知历史里(只在本次页面)
import { W, GM, SCRIPT_NAME } from "../env.js";
import { h, useSubscription } from "./react.js";
import { addLayer, ensureRoot } from "./root.js";
import { CloseIcon } from "./icons.js";
import { Logger } from "../lib/logger.js";

const logger = new Logger("Notify", "#fbcfe8");
const MAX_HISTORY = 50, MAX_SHOWN = 4;
let shown = [];
const history = [];
const listeners = new Set();
const emit = () => { for (const l of [...listeners]) l(); };
export const subscribeNotifications = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getNotificationHistory = () => history.slice();
export function clearNotificationHistory() { history.length = 0; emit(); }

let seq = 0;
/** notify({ title, body, icon, onClick, duration = 5000, system, type }) 返回关闭函数 */
export function notify(opts = {}) {
    const n = { id: ++seq, at: Date.now(), type: String(opts.type || "INFO").toUpperCase(), title: opts.title ?? SCRIPT_NAME, body: opts.body ?? "", icon: opts.icon, onClick: opts.onClick, plugin: opts.plugin };
    history.unshift(n);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    shown = [n, ...shown].slice(0, MAX_SHOWN);
    ensureRoot();
    emit();
    const close = () => { if (!shown.includes(n)) return; shown = shown.filter(x => x !== n); emit(); };
    const duration = opts.duration ?? 5000;
    if (duration > 0) setTimeout(close, duration);
    if (opts.system) sendSystem(n);
    return close;
}

function sendSystem(n) {
    const text = typeof n.body === "string" ? n.body : "";
    try {
        if (GM.notification) { GM.notification({ title: String(n.title), text: text || " ", onclick: () => { try { n.onClick?.(); } catch (e) { logger.error(e); } } }); return; }
        const N = W.Notification;
        if (N?.permission === "granted") { const x = new N(String(n.title), { body: text }); x.onclick = () => n.onClick?.(); }
    } catch (e) { logger.debug("系统通知失败", e); }
}

function NotifyHost() {
    useSubscription(subscribeNotifications);
    if (!shown.length) return null;
    return h("div", { className: "uspp-notify-stack" }, shown.map(n => h("div", {
        key: n.id, className: "uspp-notify", "data-type": n.type, role: "status", "data-clickable": n.onClick ? "" : undefined,
        onClick: () => { if (!n.onClick) return; try { n.onClick(); } catch (e) { logger.error("通知点击处理出错", e); } shown = shown.filter(x => x !== n); emit(); },
    },
    n.icon && h("div", { className: "uspp-notify-icon" }, typeof n.icon === "function" ? h(n.icon, { size: 5 }) : n.icon),
    h("div", { className: "uspp-notify-text" },
        h("div", { className: "uspp-notify-title" }, n.title),
        n.body && h("div", { className: "uspp-notify-body" }, n.body)),
    h("button", { type: "button", className: "uspp-btn uspp-btn-icon", "aria-label": "Close", onClick: e => { e.stopPropagation(); shown = shown.filter(x => x !== n); emit(); } }, h(CloseIcon, { size: 4 })))));
}

addLayer("notify", NotifyHost);
