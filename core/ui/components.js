// 抽象控件:当前站点提供了原生实现时用原生的,找不到或渲染出错时用核心自绘版
import { h, Fragment, ErrorBoundary, siteComponent } from "./react.js";
import { classes } from "../lib/utils.js";

function withFallback(nativeRender, fallbackRender, label) {
    return props => {
        const fb = fallbackRender(props);
        let g = null;
        try { g = nativeRender(props); } catch { g = null; }
        if (!g) return fb;
        return h(ErrorBoundary, { fallback: fb, label }, g);
    };
}

export const Button = withFallback(
    ({ variant = "outline", size = "md", onClick, disabled, children, title, className, type = "button" }) => {
        const B = siteComponent("Button");
        if (!B) return null;
        const v = variant === "danger" ? "danger" : variant;
        return h(B, { variant: v, size, shape: "pill", onClick, disabled, title, className, type }, children);
    },
    ({ variant = "outline", size, onClick, disabled, children, title, className, type = "button" }) => h("button", {
        type, onClick, disabled, title,
        className: classes("uspp-btn", variant === "primary" && "uspp-btn-primary", variant === "danger" && "uspp-btn-danger", variant === "ghost" && "uspp-btn-ghost", size === "sm" && "uspp-btn-sm", className),
    }, children),
    "Button",
);

export function IconButton({ icon: Icon, label, onClick, active, disabled, className, size = 4 }) {
    return h("button", {
        type: "button", "aria-label": label, title: label, onClick, disabled,
        className: classes("uspp-btn", "uspp-btn-icon", active && "uspp-active", className),
    }, h(Icon, { size }));
}

export const Switch = withFallback(
    ({ checked, onChange, disabled, label }) => {
        const S = siteComponent("Switch");
        if (!S) return null;
        return h(S, { checked: !!checked, onCheckedChange: v => onChange?.(!!v), disabled: !!disabled, "aria-label": label });
    },
    ({ checked, onChange, disabled, label }) => h("button", {
        type: "button", role: "switch", "aria-checked": !!checked, "aria-label": label, "data-checked": String(!!checked),
        className: "uspp-switch", disabled: !!disabled, onClick: () => onChange?.(!checked),
    }),
    "Switch",
);

/** options: [{ label, value }];value 可以是任意类型 */
export const Select = withFallback(
    ({ value, options, onChange, label }) => {
        const [S, SelectTrigger, SelectValue, SelectContent, SelectItem] = ["Select", "SelectTrigger", "SelectValue", "SelectContent", "SelectItem"].map(siteComponent);
        if (!S || !SelectTrigger || !SelectValue || !SelectContent || !SelectItem) return null;
        const idx = options.findIndex(o => Object.is(o.value, value));
        return h(S, { value: idx >= 0 ? String(idx) : undefined, onValueChange: v => onChange?.(options[+v]?.value) },
            h(SelectTrigger, { "aria-label": label, style: { minWidth: 140 } }, h(SelectValue, null)),
            h(SelectContent, null, options.map((o, i) => h(SelectItem, { key: i, value: String(i) }, o.label))));
    },
    ({ value, options, onChange, label }) => {
        const idx = options.findIndex(o => Object.is(o.value, value));
        return h("select", { className: "uspp-select", "aria-label": label, value: idx >= 0 ? String(idx) : "", onChange: e => onChange?.(options[+e.target.value]?.value) },
            idx < 0 && h("option", { value: "" }, ""),
            options.map((o, i) => h("option", { key: i, value: String(i) }, o.label)));
    },
    "Select",
);

export function Input(props) {
    const { className, onEnter, ...rest } = props;
    return h("input", {
        ...rest,
        className: classes("uspp-input", className),
        onKeyDown: e => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(e); } rest.onKeyDown?.(e); },
    });
}

export function CodeEditor({ value, onChange, placeholder, readOnly, minHeight = 240 }) {
    return h("textarea", {
        className: "uspp-textarea", value, placeholder, readOnly: !!readOnly, spellCheck: false,
        style: { minHeight },
        onChange: e => onChange?.(e.target.value),
        onKeyDown: e => {
            if (e.key === "Tab" && !readOnly) {
                e.preventDefault();
                const t = e.target, s = t.selectionStart, en = t.selectionEnd;
                const next = t.value.slice(0, s) + "    " + t.value.slice(en);
                onChange?.(next);
                requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 4; });
            }
        },
    });
}

export const Tooltip = withFallback(
    ({ content, children }) => {
        const [T, TooltipTrigger, TooltipContent] = ["Tooltip", "TooltipTrigger", "TooltipContent"].map(siteComponent);
        if (!T || !TooltipTrigger || !TooltipContent || !content) return null;
        return h(T, null, h(TooltipTrigger, { asChild: true }, children), h(TooltipContent, null, content));
    },
    ({ content, children }) => h("span", { title: typeof content === "string" ? content : undefined, style: { display: "inline-flex" } }, children),
    "Tooltip",
);

export function Row({ title, description, children }) {
    return h("div", { className: "uspp-row" },
        h("div", { className: "uspp-row-text" },
            h("div", { className: "uspp-row-title" }, title),
            description && h("div", { className: "uspp-muted uspp-small" }, description)),
        children);
}

export { Fragment };
