// Keybinds 页:列出所有命令,用户可以给任意命令绑或改按键;同一按键被多个命令用时提示
import { h, useState, useEffect, useSubscription } from "../ui/react.js";
import { Button } from "../ui/components.js";
import { SettingsStore } from "../lib/settings.js";
import { getCommands, subscribeCommands, keyFor, setKeybind, resetKeybind, conflictsOf, recordNextKey, getCommand, userKeybinds } from "../lib/commands.js";

const subKeybinds = fn => {
    const offs = [subscribeCommands(fn)];
    const l = () => fn();
    SettingsStore.addPrefixChangeListener("plugins.Settings.keybinds", l);
    offs.push(() => SettingsStore.removePrefixChangeListener("plugins.Settings.keybinds", l));
    return () => offs.forEach(o => o());
};

function KeyCell({ id }) {
    const [rec, setRec] = useState(false);
    useEffect(() => {
        if (!rec) return undefined;
        return recordNextKey(combo => { setRec(false); if (combo) setKeybind(id, combo); });
    }, [rec]);
    const k = keyFor(id);
    const conflicts = conflictsOf(id);
    const custom = Object.prototype.hasOwnProperty.call(userKeybinds(), id);
    return h("div", { className: "uspp-keybind" },
        h("kbd", { className: "uspp-kbd", "data-empty": k ? undefined : "" }, rec ? "Press keys…" : k || "None"),
        h(Button, { size: "sm", variant: "outline", onClick: () => setRec(!rec) }, rec ? "Cancel" : "Change"),
        k && h(Button, { size: "sm", variant: "ghost", onClick: () => setKeybind(id, "") }, "Clear"),
        custom && h(Button, { size: "sm", variant: "ghost", onClick: () => resetKeybind(id) }, "Reset"),
        conflicts.length > 0 && h("div", { className: "uspp-setting-error" }, `Also used by: ${conflicts.map(c => getCommand(c)?.name ?? c).join(", ")}`));
}

export function KeybindsTab() {
    useSubscription(subKeybinds);
    const list = getCommands().sort((a, b) => (a.plugin ? 1 : 0) - (b.plugin ? 1 : 0) || a.name.localeCompare(b.name));
    return h("div", { className: "uspp-page", "data-uspp-page": "keybinds" },
        h("div", { className: "uspp-muted uspp-small", style: { marginBottom: 12 } }, "Click Change, then press the keys. Esc cancels. Shortcuts without Ctrl, Alt or Meta don't fire while you're typing in a text field."),
        list.length ? h("div", { className: "uspp-section" }, list.map(c => h("div", { key: c.id, className: "uspp-row", "data-uspp-command": c.id },
            h("div", { className: "uspp-row-text" },
                h("div", { className: "uspp-row-title" }, c.name),
                h("div", { className: "uspp-muted uspp-small" }, c.description || (c.plugin ? `From ${c.plugin}` : "Built in"))),
            h(KeyCell, { id: c.id })))) : h("div", { className: "uspp-empty" }, "No commands."));
}
