// 布局和排版小组件(自绘,跟随 --uspp-* 配色变量):插件设置页、弹窗、站点适配的界面都可以用
import { h, useState, useEffect, useReducer, useMemo, useRef } from "./react.js";
import { classes } from "../lib/utils.js";

const gap = v => (typeof v === "number" ? `${v}px` : v);

/** 弹性布局:direction("row" | "column")、gap、align、justify、wrap */
export function Flex({ direction = "row", gap: g = 8, align, justify, wrap, className, style, children, ...rest }) {
    return h("div", {
        ...rest,
        className: classes("uspp-flex", className),
        style: { display: "flex", flexDirection: direction, gap: gap(g), alignItems: align, justifyContent: justify, flexWrap: wrap ? "wrap" : undefined, ...style },
    }, children);
}

/** 网格:columns 为数字(等宽列)或 CSS 模板;minWidth 给了时按最小列宽自动换行 */
export function Grid({ columns = 2, minWidth, gap: g = 12, className, style, children, ...rest }) {
    const tpl = minWidth ? `repeat(auto-fill, minmax(${gap(minWidth)}, 1fr))` : typeof columns === "number" ? `repeat(${columns}, minmax(0, 1fr))` : columns;
    return h("div", { ...rest, className: classes("uspp-grid", className), style: { display: "grid", gridTemplateColumns: tpl, gap: gap(g), ...style } }, children);
}

const SIZES = { xs: 11, sm: 12, md: 14, lg: 16, xl: 20 };
const WEIGHTS = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const COLORS = { primary: "var(--uspp-fg-primary)", secondary: "var(--uspp-fg-secondary)", tertiary: "var(--uspp-fg-tertiary)", danger: "var(--uspp-fg-danger)" };

/** 文字:size(xs/sm/md/lg/xl)、weight(normal/medium/semibold/bold)、color(primary/secondary/tertiary/danger 或任意 CSS 颜色)、as(标签名) */
export function Text({ as = "span", size = "md", weight = "normal", color = "primary", mono, className, style, children, ...rest }) {
    return h(as, {
        ...rest,
        className: classes("uspp-text", className),
        style: { fontSize: SIZES[size] ?? size, fontWeight: WEIGHTS[weight] ?? weight, color: COLORS[color] ?? color, fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : undefined, ...style },
    }, children);
}

/** 段落:次要颜色、适合说明文字 */
export function Paragraph({ size = "sm", color = "secondary", children, ...rest }) {
    return h(Text, { as: "p", size, color, style: { margin: 0, lineHeight: 1.5 }, ...rest }, children);
}

/** 分节标题:title + 可选 description,右侧可放 action */
export function SectionHeader({ title, description, action, className }) {
    return h("div", { className: classes("uspp-section-header", className) },
        h("div", { className: "uspp-row-text" },
            h(Text, { as: "h3", size: "lg", weight: "semibold", style: { margin: 0 } }, title),
            description && h(Paragraph, null, description)),
        action || null);
}

/** 提示框:type 为 info / warn / danger / success */
export function InfoHint({ type = "info", title, children, className }) {
    return h("div", { className: classes("uspp-hint", className), "data-type": type, role: type === "danger" ? "alert" : "note" },
        title && h("div", { className: "uspp-hint-title" }, title),
        children && h("div", null, children));
}

/** 错误卡片:显示一条出错信息,可选"重试"和展开查看详情 */
export function ErrorCard({ title = "Something went wrong", error, onRetry, className }) {
    const [open, setOpen] = useState(false);
    const detail = error == null ? "" : error instanceof Error ? (error.stack || String(error)) : String(error);
    return h("div", { className: classes("uspp-hint", "uspp-error-card", className), "data-type": "danger", role: "alert" },
        h("div", { className: "uspp-hint-title" }, title),
        error != null && h("div", { className: "uspp-small" }, error instanceof Error ? error.message : String(error).split("\n")[0]),
        h("div", { style: { display: "flex", gap: 8, marginTop: 6 } },
            onRetry && h("button", { type: "button", className: "uspp-btn uspp-btn-sm", onClick: onRetry }, "Retry"),
            detail && h("button", { type: "button", className: "uspp-btn uspp-btn-sm uspp-btn-ghost", onClick: () => setOpen(!open) }, open ? "Hide details" : "Details")),
        open && h("pre", { className: "uspp-error-detail" }, detail));
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** 颜色设置行:色块 + 十六进制输入;value 是 "#rrggbb",清空时 onChange(null) */
export function ColorSettingRow({ title, description, value, onChange, allowClear = true }) {
    const [text, setText] = useState(value || "");
    useEffect(() => { setText(value || ""); }, [value]);
    const commit = v => {
        const t = String(v).trim();
        if (!t && allowClear) return onChange?.(null);
        if (HEX.test(t)) onChange?.(t.length === 4 ? `#${[...t.slice(1)].map(c => c + c).join("")}`.toLowerCase() : t.toLowerCase());
        else setText(value || "");
    };
    return h("div", { className: "uspp-row" },
        h("div", { className: "uspp-row-text" }, h("div", { className: "uspp-row-title" }, title), description && h("div", { className: "uspp-muted uspp-small" }, description)),
        h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            h("input", { type: "color", className: "uspp-color-swatch", "aria-label": title, value: HEX.test(value || "") ? value : "#000000", onChange: e => { setText(e.target.value); onChange?.(e.target.value); } }),
            h("input", { type: "text", className: "uspp-input", style: { width: 96 }, value: text, placeholder: allowClear ? "default" : "#000000", "aria-label": `${title} hex`, onChange: e => setText(e.target.value), onBlur: e => commit(e.target.value), onKeyDown: e => { if (e.key === "Enter") commit(e.target.value); } })));
}

/** 跟着外部状态(createExternalStore / createSelectionStore)刷新 */
export function useExternalStore(store) {
    const [, force] = useReducer(x => x + 1, 0);
    useEffect(() => store.subscribe(() => force()), [store]);
    return store;
}

/** 批量选择的勾选框 */
export function SelectionCheckbox({ selection, id, label }) {
    useExternalStore(selection);
    return h("input", { type: "checkbox", className: "uspp-checkbox", "aria-label": label || "Select", checked: selection.has(id), onChange: () => selection.toggle(id), onClick: e => e.stopPropagation() });
}

/** 批量选择的操作栏:有勾选时出现,显示数量、全选 / 清空和删除等动作;actions: [{ label, onClick(ids), danger }] */
export function SelectionActionBar({ selection, noun = "item", allIds, actions = [], onDelete }) {
    useExternalStore(selection);
    const n = selection.size;
    if (!n) return null;
    const list = [...actions, ...(onDelete ? [{ label: "Delete", danger: true, onClick: onDelete }] : [])];
    return h("div", { className: "uspp-selection-bar", role: "toolbar" },
        h("span", { className: "uspp-small" }, `${n} ${noun}${n === 1 ? "" : "s"} selected`),
        h("div", { style: { display: "flex", gap: 8, marginInlineStart: "auto" } },
            allIds && n < allIds.length && h("button", { type: "button", className: "uspp-btn uspp-btn-sm uspp-btn-ghost", onClick: () => selection.setAll(allIds) }, "Select all"),
            h("button", { type: "button", className: "uspp-btn uspp-btn-sm uspp-btn-ghost", onClick: () => selection.clear() }, "Clear"),
            list.map((a, i) => h("button", { key: i, type: "button", className: classes("uspp-btn", "uspp-btn-sm", a.danger && "uspp-btn-danger"), onClick: () => a.onClick(selection.values()) }, a.label))));
}

/** 按关键字过滤列表(不区分大小写,空格分开的每个词都要出现) */
export function useFiltered(list, search, getKey = String) {
    return useMemo(() => {
        const words = String(search || "").toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return list;
        return list.filter(item => { const k = String(getKey(item)).toLowerCase(); return words.every(w => k.includes(w)); });
    }, [list, search]);
}

/** 带忙状态的异步动作:返回 [busy, run];运行中再点不会重复执行 */
export function useAsyncAction(fn) {
    const [busy, setBusy] = useState(false);
    const ref = useRef(false);
    const run = async (...args) => {
        if (ref.current) return;
        ref.current = true; setBusy(true);
        try { await fn(...args); } finally { ref.current = false; setBusy(false); }
    };
    return [busy, run];
}
