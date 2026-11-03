// 插件效果预览:插件卡片上的"预览"按钮打开插件对话框,对话框顶部显示预览
//
// 插件用 preview 字段声明(可写数组,多项时左右翻页):
//   preview: "https://…/shot.png"              图片地址或 data: URI
//   preview: "<svg …>…</svg>"                   内联 SVG 文本
//   preview: { src, alt, caption }              带说明的图片
//   preview: { before, after, caption }         前后对比(两张图并排)
//   preview: ({ plugin, settings, enabled }) => 节点   实时演示组件,改设置时跟着重画
//   preview: { component, caption }             同上,带说明
//   preview: false                              不显示预览(也不显示自动生成的)
// 没写 preview 时,按插件的 slots 自动列出它会加到页面上的按钮和菜单项。
import { h, useState, ErrorBoundary } from "../ui/react.js";
import { Settings } from "../lib/settings.js";
import { pluginSlots, isPluginEnabled } from "../lib/plugins.js";
import { humanizeKey } from "../lib/utils.js";
import { ChevronRightIcon } from "../ui/icons.js";

const SLOT_LABELS = {
    toolbar: "Toolbar button", menuCommand: "Script menu command", floating: "Floating button",
    chatBar: "Composer button", conversationMenu: "Conversation menu item", messageMenu: "Message menu item",
    userMenu: "Avatar menu item", "settings.pluginActions": "Plugin card button",
};

const toSrc = s => typeof s === "string" && /^\s*<svg[\s>]/i.test(s) ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.trim()) : s;

function normalize(v) {
    if (v == null || v === false) return [];
    if (Array.isArray(v)) return v.flatMap(normalize);
    if (typeof v === "function") return [{ component: v }];
    if (typeof v === "string") return v.trim() ? [{ src: v }] : [];
    if (typeof v === "object" && (v.component || v.src || v.before || v.after)) return [v];
    return [];
}

/** 插件自己声明的预览 */
export const declaredPreviews = p => {
    try { return normalize(p.preview); } catch { return []; }
};

/** 从 slots 推出的"会加什么":[{ slot, label, icon }] */
export function slotSummary(p) {
    let slots = {};
    try { slots = pluginSlots(p); } catch { slots = p.slots || {}; }
    const out = [];
    for (const [slot, v] of Object.entries(slots || {})) {
        for (const def of [].concat(v)) {
            if (!def || typeof def !== "object") continue;
            const label = typeof def.label === "string" ? def.label
                : typeof def.tooltip === "string" ? def.tooltip
                : typeof def["aria-label"] === "string" ? def["aria-label"] : def.id ?? p.name;
            out.push({ slot, label, icon: def.icon });
        }
    }
    return out;
}

export function hasPreview(p) {
    if (p.preview === false) return false;
    return declaredPreviews(p).length > 0 || slotSummary(p).length > 0;
}

// 节点要在渲染时再建:模块加载时渲染器(站点 React / 内置 Preact)还没定
const failed = () => h("div", { className: "uspp-muted uspp-small uspp-preview-empty" }, "Preview failed to render.");

function Img({ src, alt }) {
    const [bad, setBad] = useState(false);
    if (bad) return h("div", { className: "uspp-muted uspp-small uspp-preview-empty" }, "Image could not be loaded.");
    return h("img", { className: "uspp-preview-img", src: toSrc(src), alt: alt || "", loading: "lazy", draggable: false, onError: () => setBad(true) });
}

function Frame({ item, plugin }) {
    if (item.component) {
        const ctx = { plugin, settings: Settings.plugins[plugin.name], enabled: isPluginEnabled(plugin.name) };
        return h("div", { className: "uspp-preview-live" }, h(ErrorBoundary, { fallback: failed(), label: `preview:${plugin.name}` }, h(item.component, ctx)));
    }
    if (item.before || item.after) {
        return h("div", { className: "uspp-preview-compare" }, [["Before", item.before], ["After", item.after]].filter(([, s]) => s).map(([label, s]) =>
            h("figure", { key: label }, h(Img, { src: s, alt: `${plugin.name} ${label.toLowerCase()}` }), h("figcaption", null, label))));
    }
    return h(Img, { src: item.src, alt: item.alt || plugin.name });
}

function SlotSummary({ items }) {
    return h("div", { className: "uspp-preview-live uspp-preview-slots" },
        h("div", { className: "uspp-muted uspp-small" }, "Adds to the page:"),
        items.map((it, i) => h("div", { key: i, className: "uspp-preview-slot" },
            h("span", { className: "uspp-preview-chip" },
                typeof it.icon === "function" ? h(ErrorBoundary, { fallback: null }, h(it.icon, { size: 4 })) : null,
                String(it.label)),
            h("span", { className: "uspp-muted uspp-small" }, SLOT_LABELS[it.slot] ?? humanizeKey(it.slot)))));
}

export function PluginPreview({ plugin }) {
    const [idx, setIdx] = useState(0);
    if (plugin.preview === false) return null;
    const items = declaredPreviews(plugin);
    const summary = items.length ? [] : slotSummary(plugin);
    if (!items.length && !summary.length) return null;
    const n = items.length;
    const i = n ? Math.min(idx, n - 1) : 0;
    const item = items[i];
    return h("section", { className: "uspp-preview", "data-uspp-preview": plugin.name, "aria-label": "Preview" },
        h("div", { className: "uspp-preview-head" },
            h("span", { className: "uspp-preview-title" }, "Preview"),
            n > 1 && h("div", { className: "uspp-preview-nav" },
                h("button", { type: "button", className: "uspp-btn uspp-btn-icon", "aria-label": "Previous preview", onClick: () => setIdx((i - 1 + n) % n) },
                    h(ChevronRightIcon, { size: 4, style: { transform: "rotate(180deg)" } })),
                h("span", { className: "uspp-muted uspp-small" }, `${i + 1} / ${n}`),
                h("button", { type: "button", className: "uspp-btn uspp-btn-icon", "aria-label": "Next preview", onClick: () => setIdx((i + 1) % n) },
                    h(ChevronRightIcon, { size: 4 })))),
        item ? h(Frame, { key: i, item, plugin }) : h(SlotSummary, { items: summary }),
        item?.caption && h("div", { className: "uspp-muted uspp-small uspp-preview-caption" }, item.caption));
}
