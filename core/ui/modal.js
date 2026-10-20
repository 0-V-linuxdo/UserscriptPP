// 弹窗:openModal / closeModal / closeAllModals
import { h, useEffect, useSubscription, Fragment, getRenderer } from "./react.js";
import { ErrorBoundary } from "./react.js";
import { addLayer, ensureRoot } from "./root.js";
import { CloseIcon } from "./icons.js";
import { Logger } from "../lib/logger.js";

const logger = new Logger("Modal", "#fbcfe8");
let modals = []; // { key, render, container }
const listeners = new Set();
const emit = () => { for (const l of [...listeners]) l(); };
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
let seq = 0;

/** 站点已打开的模态对话框里最上层的那个;弹窗放进去才不会被它的焦点陷阱和外部点击判定干扰 */
function topHostDialog() {
    const list = [...document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')]
        .filter(el => !el.closest("uspp-root") && !el.closest(".uspp-overlay"));
    return list[list.length - 1] || null;
}

export function openModal(render, { modalKey } = {}) {
    const key = modalKey ?? `uspp-modal-${++seq}`;
    modals = modals.filter(m => m.key !== key);
    modals.push({ key, render, container: topHostDialog() });
    if (!ensureRoot()) logger.warn("界面根尚未就绪,弹窗会在就绪后显示");
    emit();
    return key;
}

export function closeModal(key) {
    const before = modals.length;
    modals = modals.filter(m => m.key !== key);
    if (modals.length !== before) emit();
}

export function closeAllModals() {
    if (!modals.length) return;
    modals = [];
    emit();
}

export const getOpenModals = () => modals.map(m => m.key);

function ModalFrame({ entry, isTop }) {
    const onClose = () => closeModal(entry.key);
    useEffect(() => {
        if (!isTop) return;
        const onKey = e => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            e.preventDefault();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [isTop]);

    let content;
    try { content = entry.render({ onClose, modalKey: entry.key }); } catch (e) { logger.error("弹窗渲染出错", e); content = null; }
    const overlay = h("div", {
        className: "uspp-overlay",
        style: entry.container ? { position: "fixed", zIndex: 2147483000 } : undefined,
        onMouseDown: e => { if (e.target === e.currentTarget) e.currentTarget.dataset.down = "1"; },
        onClick: e => { if (e.target === e.currentTarget && e.currentTarget.dataset.down === "1") onClose(); e.currentTarget.dataset.down = ""; },
        onKeyDown: e => e.stopPropagation(),
    }, h(ErrorBoundary, { fallback: null, label: "modal" }, content));
    const R = getRenderer();
    if (entry.container && entry.container.isConnected && R?.createPortal) return R.createPortal(overlay, entry.container);
    return overlay;
}

function ModalHost() {
    useSubscription(subscribe);
    return h(Fragment, null, modals.map((m, i) => h(ModalFrame, { key: m.key, entry: m, isTop: i === modals.length - 1 })));
}

addLayer("modals", ModalHost);

// ---------- 标准弹窗外观 ----------
export function ModalCard({ title, subtitle, children, footer, onClose, width }) {
    return h("div", { className: "uspp-modal", role: "dialog", "aria-modal": "true", style: width ? { width: `min(${width}px, 100%)` } : undefined, onClick: e => e.stopPropagation() },
        h("button", { type: "button", className: "uspp-btn uspp-btn-icon uspp-modal-close", "aria-label": "Close", onClick: onClose }, h(CloseIcon, { size: 4 })),
        (title || subtitle) && h("div", { className: "uspp-modal-header" },
            title && h("h2", { className: "uspp-modal-title" }, title),
            subtitle && h("div", { className: "uspp-modal-subtitle" }, subtitle)),
        h("div", { className: "uspp-modal-body" }, children),
        footer && h("div", { className: "uspp-modal-footer" }, footer));
}

/** 确认框:返回 Promise<boolean> */
export function confirmDialog({ title, body, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
    return new Promise(resolve => {
        let done = false;
        const finish = v => { if (!done) { done = true; resolve(v); } };
        const key = openModal(({ onClose }) => h(ModalCard, {
            title, width: 420,
            onClose: () => { finish(false); onClose(); },
            footer: [
                h("button", { key: "c", type: "button", className: "uspp-btn", onClick: () => { finish(false); onClose(); } }, cancelText),
                h("button", { key: "o", type: "button", className: `uspp-btn ${danger ? "uspp-btn-danger" : "uspp-btn-primary"}`, onClick: () => { finish(true); onClose(); } }, confirmText),
            ],
        }, h("div", { className: "uspp-muted" }, body)));
        // 被其他途径关闭时视为取消
        const off = subscribe(() => { if (!modals.some(m => m.key === key)) { off(); finish(false); } });
    });
}
