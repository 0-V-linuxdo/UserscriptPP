// 渲染型注入点:插件的注入点内容可以带 render(ctx) 组件,站点在目标位置渲染。
// React 站点在自己的元素树里放 <SlotOutlet slot ctx />;其他站点用 renderSlot(注入点, 容器, ctx) 挂到一个 DOM 容器上
import { h, Fragment, useSubscription, getRenderer, ErrorBoundary } from "./react.js";
import { getSlotItems, onSlotChange, slotValue } from "../lib/slots.js";
import { Logger } from "../lib/logger.js";

const logger = new Logger("SlotRender", "#fdba74");

function DefaultButton({ def, ctx }) {
    const Icon = def.icon;
    return h("button", {
        type: "button", className: "uspp-btn uspp-btn-ghost uspp-btn-sm uspp-slot-button", title: def.tooltip ?? def.label, "data-uspp-slot-item": def.id,
        disabled: slotValue(def.disabled, ctx),
        onClick: e => { try { (def.onClick ?? def.onSelect)?.(e, ctx); } catch (err) { logger.error(`注入点项 ${def.id} 出错`, err); } },
    }, Icon != null && (typeof Icon === "function" ? h(Icon, { size: 4 }) : Icon), def.label != null && h("span", null, def.label));
}

/** 渲染一个注入点的全部内容;每项包一层 ErrorBoundary,单项出错不影响其他项 */
export function SlotOutlet({ slot, ctx = {}, filter }) {
    useSubscription(fn => onSlotChange(slot, fn));
    const items = getSlotItems(slot).filter(d => {
        if (filter && !filter(d)) return false;
        try { return d.when ? !!d.when(ctx) : true; } catch { return false; }
    });
    if (!items.length) return null;
    return h(Fragment, null, items.map(def => h(ErrorBoundary, { key: def.id, fallback: null, label: `slot:${slot}:${def.id}` },
        def.render ? h(def.render, ctx) : h(DefaultButton, { def, ctx }))));
}

// ---------- DOM 容器 ----------
const hosts = new Set(); // { container, root, ctx, slot }
let mo = null;
function watchDetach() {
    if (mo || typeof MutationObserver === "undefined") return;
    let queued = false;
    mo = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        setTimeout(() => {
            queued = false;
            for (const x of [...hosts]) if (!x.container.isConnected) x.unmount();
            if (!hosts.size) { mo?.disconnect(); mo = null; }
        }, 100);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
}

/**
 * 在容器里渲染注入点内容。返回 { update(ctx), unmount() };容器离开页面后自动卸载。
 * 渲染器还没就绪时稍后再试。
 */
export function renderSlot(slot, container, ctx = {}) {
    const x = { slot, container, ctx, root: null, dead: false };
    const draw = () => {
        if (x.dead) return;
        const R = getRenderer();
        if (!R) { setTimeout(draw, 200); return; }
        try {
            x.root ??= R.createRoot(container);
            x.root.render(h(SlotOutlet, { slot, ctx: x.ctx }));
        } catch (e) { logger.error(`渲染注入点 ${slot} 失败`, e); }
    };
    x.update = next => { x.ctx = next ?? x.ctx; draw(); };
    x.unmount = () => {
        if (x.dead) return;
        x.dead = true;
        hosts.delete(x);
        try { x.root?.unmount(); } catch { /* 忽略 */ }
    };
    hosts.add(x);
    watchDetach();
    draw();
    return { update: x.update, unmount: x.unmount };
}
