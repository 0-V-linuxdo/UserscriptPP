// 设置页登记表(不含界面代码):站点和插件可以往框架设置面板里加页,显示在内置页之后
const pages = new Map(); // key -> def
const listeners = new Set();
const emit = () => { for (const l of [...listeners]) { try { l(); } catch { /* 忽略 */ } } };
export const subscribeSettingsPages = fn => { listeners.add(fn); return () => listeners.delete(fn); };

/** def:{ id, label, icon?, component, order? };返回撤销函数 */
export function registerSettingsPage(def) {
    if (!def?.id || !def.component) throw new Error("registerSettingsPage 需要 id 和 component");
    const key = String(def.id);
    const entry = { order: 0, ...def, key, id: `uspp_page_${key.replace(/[^\w-]/g, "_")}`, label: def.label || key, custom: true };
    pages.set(key, entry);
    emit();
    return () => { if (pages.get(key) === entry) { pages.delete(key); emit(); } };
}
export const getRegisteredPages = () => [...pages.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
