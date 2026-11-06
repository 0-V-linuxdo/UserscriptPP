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

/** 注入点的内容(按 order 排序);只有 patch 的项(菜单补丁)缺省不列出,{ all: true } 时也列出 */
export function getSlotItems(slot, { all = false } = {}) {
    const list = [...(slots.get(slot)?.values() ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return all ? list : list.filter(d => !isPatchOnly(d));
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

/**
 * 菜单补丁:站点把一个菜单的原生项整理成描述数组 items,交给注入点里每个带 patch(items, ctx) 的项依次处理(可增、删、改、排序)。
 * patch 可以直接改数组,也可以返回新数组;单个出错时跳过它。返回处理后的数组(不含注入点里普通的追加项,站点照常另外追加)
 */
export function applyMenuPatches(slot, items, ctx) {
    let cur = Array.isArray(items) ? items.slice() : [];
    for (const def of getSlotItems(slot, { all: true })) {
        if (typeof def.patch !== "function") continue;
        try {
            const r = def.patch(cur, ctx);
            if (Array.isArray(r)) cur = r;
        } catch (e) { logger.error(`菜单补丁 ${def.id} 出错,已跳过`, e); }
    }
    return cur;
}

/** 注入点里只用于补丁、不作为追加项显示的(只有 patch,没有 label / render) */
export const isPatchOnly = def => typeof def.patch === "function" && def.label == null && def.render == null;
