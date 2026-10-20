// 注入点 menuCommand:脚本管理器菜单里的命令
import { GM } from "../env.js";
import { Logger } from "./logger.js";
import { getSlotItems, onSlotChange } from "./slots.js";

const logger = new Logger("Menu", "#fcd34d");
const registered = new Map(); // id -> { handle, label }

function sync() {
    if (!GM.menu) return;
    const items = getSlotItems("menuCommand");
    const ids = new Set(items.map(d => d.id));
    for (const [id, r] of registered) {
        if (ids.has(id)) continue;
        try { GM.unmenu?.(r.handle); } catch { /* 旧版管理器不能取消 */ }
        registered.delete(id);
    }
    for (const d of items) {
        const label = String(d.label ?? d.id);
        const r = registered.get(d.id);
        if (r && r.label === label) { r.def = d; continue; }
        if (r) { try { GM.unmenu?.(r.handle); } catch { /* 忽略 */ } }
        const entry = { label, def: d, handle: null };
        try {
            entry.handle = GM.menu(label, () => {
                try { (entry.def.onSelect || entry.def.onClick)?.({}); } catch (e) { logger.error(`菜单命令 ${label} 出错`, e); }
            });
        } catch (e) { logger.debug("注册菜单命令失败", e); }
        registered.set(d.id, entry);
    }
}

let installed = false;
export function installMenuCommands() {
    if (installed) return;
    installed = true;
    onSlotChange("menuCommand", sync);
    sync();
}
