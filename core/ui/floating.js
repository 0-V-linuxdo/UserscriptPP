// 注入点 floating:页面角落的悬浮按钮区(位置在 Settings 里调)
import { h, useSubscription, ErrorBoundary } from "./react.js";
import { addLayer, ensureRoot } from "./root.js";
import { getSlotItems, onSlotChange, slotValue } from "../lib/slots.js";
import { PlainSettings, SettingsStore } from "../lib/settings.js";

const subscribe = fn => {
    const off = onSlotChange("floating", fn);
    SettingsStore.addChangeListener("plugins.Settings.floatingPosition", fn);
    return () => { off(); SettingsStore.removeChangeListener("plugins.Settings.floatingPosition", fn); };
};

function FloatingHost() {
    useSubscription(subscribe);
    const items = getSlotItems("floating");
    if (!items.length) return null;
    const pos = String(PlainSettings.plugins.Settings?.floatingPosition || "bottom-right");
    return h("div", { className: "uspp-floating", "data-pos": pos, "data-uspp-floating": "" }, items.map(d => {
        const ctx = {};
        return h(ErrorBoundary, { key: d.id, fallback: null, label: `floating:${d.id}` },
            d.render ? h(d.render, ctx) : h("button", {
                type: "button", className: "uspp-floating-btn " + (d.className || ""), title: d.tooltip ?? d.label, "aria-label": d.label ?? d.id,
                disabled: slotValue(d.disabled, ctx), "data-active": String(slotValue(d.active, ctx)), "data-uspp-floating-item": d.id,
                onClick: () => { try { (d.onSelect || d.onClick)?.(ctx); } catch (e) { console.error("[Userscript++] 悬浮按钮出错", e); } },
            }, typeof d.icon === "function" ? h(d.icon, { size: 4 }) : d.icon, d.icon != null && d.label ? " " : null, d.icon == null || d.showLabel ? d.label : null));
    }));
}

let installed = false;
export function installFloating() {
    if (installed) return;
    installed = true;
    addLayer("floating", FloatingHost);
    // 有内容时才挂界面根
    const tryMount = () => { if (getSlotItems("floating").length && !ensureRoot()) setTimeout(tryMount, 500); };
    onSlotChange("floating", tryMount);
    tryMount();
}
