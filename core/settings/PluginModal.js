// 插件设置对话框(规格 8.4)
import { h, useEffect, useState, useRef, useForceUpdate, ErrorBoundary } from "../ui/react.js";
import { ModalCard, confirmDialog } from "../ui/modal.js";
import { Switch, Select, Input, Button } from "../ui/components.js";
import { OptionType, getVisibleSettings } from "../lib/plugins.js";
import { Settings, SettingsStore, PlainSettings } from "../lib/settings.js";
import { humanizeKey } from "../lib/utils.js";

function usePluginSettings(name) {
    const force = useForceUpdate();
    useEffect(() => {
        const prefix = `plugins.${name}.`;
        const fn = () => force();
        SettingsStore.addPrefixChangeListener(prefix, fn);
        return () => SettingsStore.removePrefixChangeListener(prefix, fn);
    }, [name]);
}

function NumberInput({ value, onCommit, bigint }) {
    const shown = value == null ? "" : String(value);
    const [text, setText] = useState(shown);
    const focused = useRef(false);
    useEffect(() => { if (!focused.current) setText(shown); }, [shown]);
    return h(Input, {
        type: "text", inputMode: bigint ? "numeric" : "decimal", value: text,
        onFocus: () => { focused.current = true; },
        onBlur: () => { focused.current = false; setText(shown); },
        onChange: e => {
            const raw = e.target.value;
            setText(raw);
            const t = raw.trim();
            if (bigint) {
                if (t === "") return onCommit(0n);
                try { onCommit(BigInt(t)); } catch { /* 无法解析不写入 */ }
            } else if (t !== "" && !isNaN(Number(t))) {
                onCommit(Number(t));
            }
        },
    });
}

function SettingControl({ plugin, keyName, setting, onRestartChange }) {
    const store = Settings.plugins[plugin.name];
    const value = store[keyName];
    const set = v => {
        const before = PlainSettings.plugins[plugin.name]?.[keyName];
        store[keyName] = v;
        try { setting.onChange?.(v); } catch (e) { console.error("[Userscript++] 设置 onChange 出错", e); }
        if (setting.restartNeeded) onRestartChange?.(plugin.name, keyName, before, v);
    };
    const title = humanizeKey(keyName);
    const desc = setting.description && h("div", { className: "uspp-muted uspp-small" }, setting.description);
    const inline = control => h("div", { className: "uspp-setting" },
        h("div", { className: "uspp-row" }, h("div", { className: "uspp-row-text" }, h("div", { className: "uspp-row-title" }, title), desc), control));
    const stacked = control => h("div", { className: "uspp-setting" },
        h("div", { className: "uspp-row-text" }, h("div", { className: "uspp-row-title" }, title), desc), control);

    switch (setting.type) {
        case OptionType.BOOLEAN:
            return inline(h(Switch, { checked: !!value, onChange: set, label: title }));
        case OptionType.SELECT:
            return inline(h(Select, { value, options: setting.options || [], onChange: set, label: title }));
        case OptionType.SLIDER: {
            const min = setting.min ?? 0, max = setting.max ?? 100;
            return stacked(h("div", { className: "uspp-slider-row" },
                h("input", { type: "range", min, max, step: 1, value: Number(value ?? min), onChange: e => set(Number(e.target.value)), "aria-label": title }),
                h("span", { className: "uspp-muted", style: { minWidth: 36, textAlign: "right" } }, String(value ?? min))));
        }
        case OptionType.NUMBER:
            return stacked(h(NumberInput, { value, onCommit: set }));
        case OptionType.BIGINT:
            return stacked(h(NumberInput, { value, onCommit: set, bigint: true }));
        case OptionType.STRING:
            return stacked(h(Input, { type: "text", value: value ?? "", placeholder: setting.placeholder, onChange: e => set(e.target.value) }));
        case OptionType.COMPONENT: {
            const C = setting.component;
            if (!C) return null;
            return stacked(h(ErrorBoundary, { fallback: null }, h(C, { setValue: set, setting, option: setting, value })));
        }
        default:
            return null;
    }
}

export function PluginModal({ plugin, onClose, onRestartChange }) {
    usePluginSettings(plugin.name);
    const visible = getVisibleSettings(plugin);
    const reset = async () => {
        const ok = await confirmDialog({ title: "Reset settings", body: "Reset this plugin's settings to defaults? This cannot be undone.", confirmText: "Reset", danger: true });
        if (!ok) return;
        const store = Settings.plugins[plugin.name];
        for (const [key, s] of visible) {
            const before = PlainSettings.plugins[plugin.name]?.[key];
            delete store[key];
            const after = store[key]; // 读回默认值
            try { s.onChange?.(after); } catch { /* 忽略 */ }
            if (s.restartNeeded) onRestartChange?.(plugin.name, key, before, after);
        }
    };
    return h(ModalCard, {
        title: plugin.name, subtitle: plugin.description, onClose,
        footer: visible.length ? h(Button, { variant: "danger", onClick: reset }, "Reset") : null,
    },
    h("div", { className: "uspp-muted uspp-small", style: { marginBottom: 8 } }, "Authors: ", (plugin.authors || []).join(", ") || "Unknown"),
    visible.length
        ? visible.map(([key, s]) => h(ErrorBoundary, { key, fallback: null }, h(SettingControl, { plugin, keyName: key, setting: s, onRestartChange })))
        : h("div", { className: "uspp-empty" }, "No configurable settings."));
}
