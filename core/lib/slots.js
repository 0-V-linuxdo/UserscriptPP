// 界面注入点登记表:插件往注入点加内容,站点适配(或核心)负责渲染
import { Logger } from "./logger.js";

const logger = new Logger("Slots", "#fdba74");
const slots = new Map();      // slot -> Map<id, def>
const listeners = new Map();  // slot -> Set<fn>
const anyListeners = new Set();
let version = 0;

function emit(slot) {
    version++;
    for (const fn of [...(listeners.get(slot) || []), ...anyListeners]) {
        try { fn(slot); } catch (e) { logger.error("注入点监听者出错", e); }
    }
}

/** 同 ID 再加视为更新 */
export function addSlotItem(slot, id, def) {
    if (!slot || id == null) throw new Error("addSlotItem 需要注入点名和 ID");
    let m = slots.get(slot);
    if (!m) slots.set(slot, m = new Map());
    m.set(String(id), { ...def, id: String(id) });
    emit(slot);
}

export function removeSlotItem(slot, id) {
    if (slots.get(slot)?.delete(String(id))) emit(slot);
}

export function getSlotItems(slot) {
    return [...(slots.get(slot)?.values() ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 注入点内容变化时通知;slot 为 "*" 时任何注入点变化都通知 */
export function onSlotChange(slot, fn) {
    const set = slot === "*" ? anyListeners : (listeners.get(slot) || (listeners.set(slot, new Set()), listeners.get(slot)));
    set.add(fn);
    return () => set.delete(fn);
}

export const getSlotVersion = () => version;
export const getSlotNames = () => [...slots.keys()];

/** 取 disabled / active 这类"布尔或函数"的值 */
export const slotValue = (v, ctx) => (typeof v === "function" ? !!v(ctx) : !!v);
