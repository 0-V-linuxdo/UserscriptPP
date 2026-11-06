// 功能搜索栏:一个输入框同时搜命令、插件和设置项;上下键选择,回车执行,Esc 关闭
import { h, useState, useEffect, useRef, useMemo } from "../ui/react.js";
import { openModal, closeModal } from "../ui/modal.js";
import { getCommands, runCommand, usageOf, keyFor } from "../lib/commands.js";
import { plugins, isPluginEnabled, getVisibleSettings } from "../lib/plugins.js";
import { isChromium } from "../env.js";
import { humanizeKey } from "../lib/utils.js";

export const PALETTE_KEY = "uspp-palette";
let openPluginFn = () => { };
/** 由入口注入:打开某插件的设置(可带要定位的设置项) */
export function setPaletteOpener(fn) { openPluginFn = fn; }

/** 子序列匹配打分:连续、词首命中得分高;不匹配返回 -1 */
export function fuzzyScore(query, text) {
    const q = query.toLowerCase().trim(), t = String(text || "").toLowerCase();
    if (!q) return 0;
    if (t.includes(q)) return 100 - t.indexOf(q) + (t.startsWith(q) ? 50 : 0);
    let ti = 0, score = 0, streak = 0;
    for (const ch of q) {
        if (ch === " ") continue;
        const i = t.indexOf(ch, ti);
        if (i < 0) return -1;
        streak = i === ti ? streak + 1 : 0;
        score += 1 + streak + (i === 0 || /[\s._-]/.test(t[i - 1]) ? 3 : 0);
        ti = i + 1;
    }
    return score;
}

function entries() {
    const out = [];
    for (const c of getCommands()) out.push({ kind: "Command", id: `cmd:${c.id}`, title: c.name, sub: c.description || c.plugin || "", key: keyFor(c.id), words: [c.name, ...(c.keywords || []), c.plugin || ""].join(" "), usage: usageOf(c.id), run: () => runCommand(c.id) });
    for (const p of Object.values(plugins)) {
        if (p.hidden || (p.chromiumOnly && !isChromium())) continue;
        out.push({ kind: "Plugin", id: `plugin:${p.name}`, title: p.name, sub: `${isPluginEnabled(p.name) ? "Enabled" : "Disabled"} · ${p.description || ""}`, words: [p.name, p.description, ...(p.tags || [])].join(" "), usage: 0, run: () => openPluginFn(p.name) });
        for (const [key, s] of getVisibleSettings(p)) {
            out.push({ kind: "Setting", id: `setting:${p.name}.${key}`, title: humanizeKey(key), sub: `${p.name}${s.description ? ` · ${s.description}` : ""}`, words: [key, humanizeKey(key), s.description, p.name].join(" "), usage: 0, run: () => openPluginFn(p.name, key) });
        }
    }
    return out;
}

function Palette({ onClose }) {
    const [q, setQ] = useState("");
    const [sel, setSel] = useState(0);
    const input = useRef(null);
    const all = useMemo(entries, []);
    const list = useMemo(() => {
        if (!q.trim()) return all.filter(e => e.kind === "Command").sort((a, b) => b.usage - a.usage || a.title.localeCompare(b.title)).slice(0, 30);
        return all.map(e => ({ e, s: Math.max(fuzzyScore(q, e.title) * 2, fuzzyScore(q, e.words)) }))
            .filter(x => x.s >= 0).sort((a, b) => b.s - a.s || b.e.usage - a.e.usage).slice(0, 30).map(x => x.e);
    }, [q, all]);
    useEffect(() => { input.current?.focus(); }, []);
    useEffect(() => { setSel(0); }, [q]);
    const pick = e => { if (!e) return; onClose(); setTimeout(() => e.run(), 0); };
    const onKeyDown = ev => {
        if (ev.key === "ArrowDown") { ev.preventDefault(); setSel(i => Math.min(i + 1, list.length - 1)); }
        else if (ev.key === "ArrowUp") { ev.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
        else if (ev.key === "Enter") { ev.preventDefault(); pick(list[sel]); }
        else if (ev.key === "Escape") { ev.preventDefault(); onClose(); }
    };
    return h("div", { className: "uspp-palette", role: "dialog", "aria-label": "Search", "data-uspp-palette": "" },
        h("input", { ref: input, className: "uspp-input uspp-palette-input", placeholder: "Search commands, plugins and settings…", value: q, onInput: e => setQ(e.target.value), onChange: e => setQ(e.target.value), onKeyDown }),
        h("div", { className: "uspp-palette-list", role: "listbox" }, list.length ? list.map((e, i) => h("div", {
            key: e.id, role: "option", "aria-selected": String(i === sel), className: "uspp-palette-item", "data-uspp-palette-item": e.id,
            onMouseEnter: () => setSel(i), onClick: () => pick(e),
        },
        h("span", { className: "uspp-palette-kind" }, e.kind),
        h("span", { className: "uspp-palette-text" }, h("span", { className: "uspp-palette-title" }, e.title), e.sub && h("span", { className: "uspp-muted uspp-small" }, e.sub)),
        e.key && h("kbd", { className: "uspp-kbd" }, e.key))) : h("div", { className: "uspp-empty" }, "No results.")));
}

export function openPalette() {
    openModal(({ onClose }) => h(Palette, { onClose }), { modalKey: PALETTE_KEY });
}
export const closePalette = () => closeModal(PALETTE_KEY);
