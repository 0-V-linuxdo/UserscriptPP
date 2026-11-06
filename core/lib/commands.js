// 命令:插件和核心登记的可执行动作。功能搜索栏里能搜到,用户可以在 Keybinds 页给任意命令绑快捷键
import { W } from "../env.js";
import { Logger } from "./logger.js";
import { Settings, PlainSettings } from "./settings.js";

const logger = new Logger("Commands", "#bef264");
const commands = new Map(); // id -> def
const listeners = new Set();
const emit = () => { for (const l of [...listeners]) { try { l(); } catch { /* 忽略 */ } } };
export const subscribeCommands = fn => { listeners.add(fn); return () => listeners.delete(fn); };

/** def:{ id, name, description?, keywords?, run(), defaultKey?, plugin?, when?() } */
export function registerCommand(def) {
    if (!def?.id || typeof def.run !== "function") throw new Error("registerCommand 需要 id 和 run");
    const id = String(def.id);
    commands.set(id, { ...def, id, name: def.name || id });
    emit();
    return () => { if (commands.get(id)?.run === def.run) { commands.delete(id); emit(); } };
}
export const getCommands = () => [...commands.values()].filter(c => { try { return c.when ? !!c.when() : true; } catch { return false; } });
export const getCommand = id => commands.get(id) ?? null;

const sys = () => PlainSettings.plugins.Settings ??= {};
/** 用户改过的按键(空串表示用户清掉了缺省键) */
export const userKeybinds = () => (sys().keybinds && typeof sys().keybinds === "object" ? sys().keybinds : {});
export function keyFor(id) {
    const u = userKeybinds();
    if (Object.prototype.hasOwnProperty.call(u, id)) return u[id] || "";
    return normalizeCombo(commands.get(id)?.defaultKey || "");
}
export function setKeybind(id, combo) {
    Settings.plugins.Settings.keybinds = { ...userKeybinds(), [id]: normalizeCombo(combo || "") };
}
export function resetKeybind(id) {
    const next = { ...userKeybinds() };
    delete next[id];
    Settings.plugins.Settings.keybinds = next;
}
/** 和 id 用同一个按键的其他命令 */
export function conflictsOf(id) {
    const k = keyFor(id);
    if (!k) return [];
    return getCommands().filter(c => c.id !== id && keyFor(c.id) === k).map(c => c.id);
}

export async function runCommand(id) {
    const c = commands.get(id);
    if (!c) return false;
    try {
        await c.run();
        const usage = { ...(sys().commandUsage || {}) };
        usage[id] = (usage[id] || 0) + 1;
        Settings.plugins.Settings.commandUsage = usage;
        return true;
    } catch (e) { logger.error(`命令 ${c.name} 出错`, e); return false; }
}
export const usageOf = id => sys().commandUsage?.[id] || 0;

// ---------- 按键 ----------
const MODS = ["Ctrl", "Alt", "Shift", "Meta"];
const keyName = k => (k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k);
/** "shift+alt+p" -> "Alt+Shift+P" */
export function normalizeCombo(s) {
    if (!s) return "";
    const parts = String(s).split("+").map(x => x.trim()).filter(Boolean);
    const mods = MODS.filter(m => parts.some(p => p.toLowerCase() === m.toLowerCase() || (m === "Meta" && /^(cmd|command)$/i.test(p)) || (m === "Ctrl" && /^control$/i.test(p))));
    const key = parts.find(p => !MODS.some(m => m.toLowerCase() === p.toLowerCase()) && !/^(cmd|command|control)$/i.test(p));
    return key ? [...mods, keyName(key)].join("+") : "";
}
/** 键盘事件 -> 组合键;只按了修饰键时返回空串 */
export function comboOf(e) {
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return "";
    // Alt / Option 组合在 macOS 上会改变 e.key,优先用物理键位
    let key = e.code?.startsWith("Key") ? e.code.slice(3) : e.code?.startsWith("Digit") ? e.code.slice(5) : e.key;
    if (!key) return "";
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
    return [...mods, keyName(key)].join("+");
}
const isEditable = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

let installed = false;
let recording = null;
/** Keybinds 页录制按键时把下一次按键交给它 */
export function recordNextKey(cb) { recording = cb; return () => { if (recording === cb) recording = null; }; }

export function installKeybinds() {
    if (installed) return;
    installed = true;
    W.document.addEventListener("keydown", e => {
        const combo = comboOf(e);
        if (!combo) return;
        if (recording) {
            const cb = recording;
            recording = null;
            e.preventDefault();
            e.stopPropagation();
            cb(combo === "Escape" ? null : combo);
            return;
        }
        // 在输入框里时,不带 Ctrl / Alt / Meta 的按键不触发
        const hasMod = e.ctrlKey || e.altKey || e.metaKey;
        if (!hasMod && isEditable(e.composedPath?.()[0] || e.target)) return;
        const hit = getCommands().find(c => keyFor(c.id) === combo);
        if (!hit) return;
        e.preventDefault();
        e.stopPropagation();
        runCommand(hit.id);
    }, true);
}
