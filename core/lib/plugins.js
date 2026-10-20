// 插件模型:定义、启用判定、启动/停止、开关、运行时注册
import { isChromium, IS_DEV } from "../env.js";
import { Logger } from "./logger.js";
import { Settings, PlainSettings, SettingsStore, setDefaultResolver } from "./settings.js";
import { addPatch } from "./turbopack.js";
import { enableStyle, disableStyle } from "./styles.js";
import { subscribe as subscribeEvent, dispatch, Events } from "./events.js";
import { addSlotItem, removeSlotItem } from "./slots.js";
import { findStore, waitFor, filters } from "./finders.js";
import { getReact } from "../ui/react.js";
import { getSite } from "./sites.js";

const logger = new Logger("PluginManager", "#a5b4fc");

export const StartAt = Object.freeze({
    Init: "Init",
    DOMContentLoaded: "DOMContentLoaded",
    SiteReady: "SiteReady",
    // 旧名:Turbopack 站点上"模块稳定"就是站点就绪
    TurbopackReady: "SiteReady",
});

export const OptionType = Object.freeze({
    STRING: 0,
    NUMBER: 1,
    BIGINT: 2,
    BOOLEAN: 3,
    SELECT: 4,
    SLIDER: 5,
    COMPONENT: 6,
    CUSTOM: 7,
});

export const plugins = {};
const depEnabled = new Set();      // 作为依赖被拉起的插件
const runtimeRegistered = new Set();
const otherSites = new Set();      // 已定义、但不适用于当前网站的插件(设置要保留)
const cleanup = new Map();         // name -> 函数数组

export const definePlugin = def => def;

// ---------- 设置定义 ----------
export function definePluginSettings(def, checks) {
    const ds = {
        def,
        checks: checks ?? {},
        pluginName: null,
        get store() {
            if (!this.pluginName) throw new Error("插件注册前不能访问 settings.store");
            return Settings.plugins[this.pluginName];
        },
        get plain() {
            if (!this.pluginName) throw new Error("插件注册前不能访问 settings.plain");
            return PlainSettings.plugins[this.pluginName] ??= {};
        },
        use(keys) {
            const React = getReact();
            const [, force] = React.useReducer(x => x + 1, 0);
            const name = this.pluginName;
            React.useEffect(() => {
                const prefix = `plugins.${name}.`;
                const fn = (_, path) => {
                    const key = path.slice(prefix.length).split(".")[0];
                    if (!keys || keys.includes(key)) force();
                };
                SettingsStore.addPrefixChangeListener(prefix, fn);
                return () => SettingsStore.removePrefixChangeListener(prefix, fn);
            }, [name]);
            return this.store;
        },
        withPrivateSettings() { return this; },
    };
    return ds;
}

export function getSettingDefault(setting) {
    if (!setting) return undefined;
    if (setting.type === OptionType.SELECT) return setting.options?.find(o => o.default)?.value;
    return setting.default;
}

setDefaultResolver((pluginName, key) => {
    if (key === "enabled") return undefined;
    const s = plugins[pluginName]?.settings?.def?.[key];
    return getSettingDefault(s);
});

// ---------- 判定 ----------
export function isPluginEnabled(name) {
    const p = plugins[name];
    if (!p) return false;
    if (p.chromiumOnly && !isChromium()) return false;
    if (p.required || depEnabled.has(name)) return true;
    const stored = PlainSettings.plugins[name]?.enabled;
    if (typeof stored === "boolean") return stored;
    return !!p.enabledByDefault;
}

export const isEnabledAsDependency = name => depEnabled.has(name);

export const pluginHasPatches = p => Array.isArray(p.patches) && p.patches.length > 0;
export const needsRestart = p => (pluginHasPatches(p) && !!getSite().driver) || !!p.requiresRestart;

// ---------- 注册 ----------
function bindMethods(p) {
    for (const k of Object.keys(p)) {
        if (k === "start" || k === "stop") continue;
        const v = p[k];
        if (typeof v === "function" && !v.$$usppBound && !(v.prototype && v.prototype.isReactComponent) && k !== "icon") {
            const bound = v.bind(p);
            Object.defineProperty(bound, "$$usppBound", { value: true });
            p[k] = bound;
        }
    }
}

export function addPlugin(def, { runtime = false } = {}) {
    if (!def || !def.name) throw new Error("插件必须有 name");
    if (plugins[def.name]) return false;
    if (def.dev && !IS_DEV) return false;
    // site:"*" 为通用插件;运行时注册且没写时属于当前站点
    if (def.site == null) def.site = runtime ? getSite().id : "*";
    if (def.site !== "*" && def.site !== getSite().id) {
        otherSites.add(def.name);
        if (runtime) logger.warn(`${def.name} 属于站点 ${def.site},不是当前站点,未注册`);
        return false;
    }
    const p = def;
    p.started = false;
    if (p.settings) p.settings.pluginName = p.name;
    bindMethods(p);
    PlainSettings.plugins[p.name] ??= {};
    plugins[p.name] = p;
    if (runtime) runtimeRegistered.add(p.name);
    return true;
}

/** 当前站点没有打包器驱动时声明了补丁的插件(补丁记为"不适用",其余部分照常启动) */
export const patchesNotApplicable = new Set();
const siteHasDriver = () => !!getSite().driver;

/** 为已启用插件登记补丁(幂等);开发构建下已禁用插件以只校验方式登记 */
export function registerPatches() {
    for (const p of Object.values(plugins)) {
        if (!pluginHasPatches(p) || runtimeRegistered.has(p.name)) continue;
        if (!siteHasDriver()) { patchesNotApplicable.add(p.name); continue; }
        const enabled = isPluginEnabled(p.name);
        if (!enabled && !IS_DEV) continue;
        p.patches.forEach((patch, i) => {
            try {
                addPatch(patch, p.name, { checkOnly: !enabled, key: `${p.name}#${i}` });
            } catch (e) {
                logger.error(`登记 ${p.name} 的第 ${i} 条补丁失败`, e);
            }
        });
    }
}

// ---------- 注入点 ----------
/** 插件的 slots,加上当前站点为旧字段声明的别名(例如把某个旧字段映射到站点的注入点) */
export function pluginSlots(p) {
    const out = { ...(p.slots || {}) };
    const aliases = getSite().pluginAliases || {};
    for (const [field, map] of Object.entries(aliases)) {
        if (p[field] == null || typeof map !== "function") continue;
        let extra = null;
        try { extra = map(p[field], p); } catch (e) { logger.error(`${p.name}.${field} 转换失败`, e); }
        for (const [slot, v] of Object.entries(extra || {})) {
            if (v == null) continue;
            out[slot] = out[slot] ? [].concat(out[slot], v) : v;
        }
    }
    return out;
}

// ---------- 启动 / 停止 ----------
function track(name, fn) {
    let list = cleanup.get(name);
    if (!list) cleanup.set(name, list = []);
    list.push(fn);
}

function runCleanup(name) {
    const list = cleanup.get(name) || [];
    cleanup.delete(name);
    for (const fn of list.reverse()) {
        try { fn(); } catch (e) { logger.error(`${name} 清理出错`, e); }
    }
}

function subscribeZustand(p) {
    for (const [storeName, conf] of Object.entries(p.zustand || {})) {
        let unsub = null, cancelled = false;
        const attach = store => {
            if (cancelled) return;
            const handler = (cur, prev) => {
                try { conf.handler.call(p, cur, prev); } catch (e) { logger.error(`${p.name} 的 ${storeName} 处理函数出错`, e); }
            };
            if (conf.selector) {
                if (store.subscribe.length >= 2) {
                    try {
                        unsub = store.subscribe(conf.selector, handler);
                        if (typeof unsub === "function") return;
                    } catch { /* 退化 */ }
                }
                let last = conf.selector(store.getState());
                unsub = store.subscribe(state => {
                    const next = conf.selector(state);
                    if (Object.is(next, last)) return;
                    const prev = last;
                    last = next;
                    handler(next, prev);
                });
            } else {
                unsub = store.subscribe(handler);
            }
        };
        const store = findStore(storeName);
        let cancelWait = null;
        if (store) attach(store);
        else cancelWait = waitFor(filters.byStoreName(storeName), m => {
            const key = "use" + storeName.replace(/^use/, "").replace(/Store$/, "") + "Store";
            attach(m[key]);
        });
        track(p.name, () => { cancelled = true; cancelWait?.(); if (typeof unsub === "function") unsub(); });
    }
}

export function startPlugin(p, stack = []) {
    if (typeof p === "string") p = plugins[p];
    if (!p) return false;
    if (p.started) return true;
    if (stack.includes(p.name)) {
        logger.error(`发现循环依赖:${[...stack, p.name].join(" -> ")}`);
        return false;
    }
    for (const dep of p.dependencies || []) {
        const d = plugins[dep];
        if (!d) { logger.warn(`${p.name} 依赖的插件 ${dep} 不存在`); return false; }
        if (!d.started) {
            if (!isPluginEnabled(dep)) {
                depEnabled.add(dep);
                Settings.plugins[dep].enabled = true;
            }
            if (!startPlugin(d, [...stack, p.name])) return false;
        }
    }

    try {
        if (p.managedStyle) {
            enableStyle(p.managedStyle);
            if (!pluginHasPatches(p)) track(p.name, () => disableStyle(p.managedStyle));
        }
        p.start?.();
        for (const [slot, value] of Object.entries(pluginSlots(p))) {
            const list = Array.isArray(value) ? value : [value];
            list.forEach((item, i) => {
                if (!item) return;
                const id = list.length > 1 ? `${p.name}:${i}` : p.name;
                addSlotItem(slot, id, item);
                track(p.name, () => removeSlotItem(slot, id));
            });
        }
        for (const [ev, handler] of Object.entries(p.events || {})) {
            const off = subscribeEvent(ev, data => handler.call(p, data));
            track(p.name, off);
        }
        if (p.zustand) subscribeZustand(p);
        if (typeof p.onSettingsChange === "function") {
            const prefix = `plugins.${p.name}.`;
            const fn = (v, path) => {
                if (path === `${prefix}enabled`) return;
                try { p.onSettingsChange(v, path); } catch (e) { logger.error(`${p.name}.onSettingsChange 出错`, e); }
            };
            SettingsStore.addPrefixChangeListener(prefix, fn);
            track(p.name, () => SettingsStore.removePrefixChangeListener(prefix, fn));
        }
        p.started = true;
        logger.debug(`已启动 ${p.name}`);
        return true;
    } catch (e) {
        logger.error(`启动 ${p.name} 失败`, e);
        runCleanup(p.name);
        if (p.managedStyle && !pluginHasPatches(p)) disableStyle(p.managedStyle);
        p.started = false;
        return false;
    }
}

export function stopPlugin(p) {
    if (typeof p === "string") p = plugins[p];
    if (!p) return false;
    if (!p.started) return true;
    try { p.stop?.(); } catch (e) { logger.error(`${p.name}.stop 出错`, e); }
    runCleanup(p.name);
    if (p.managedStyle && !pluginHasPatches(p)) {
        try { disableStyle(p.managedStyle); } catch (e) { logger.error(e); }
    }
    for (const sel of p.cleanupSelectors || []) {
        try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) { logger.error(`${p.name} 清理选择器 ${sel} 出错`, e); }
    }
    p.started = false;
    logger.debug(`已停止 ${p.name}`);
    return true;
}

// 公共 API 的启停:同时记下开关状态,Plugins 页的开关和实际运行状态一致
function syncEnabled(p, enabled) {
    if (p.required || depEnabled.has(p.name) || isPluginEnabled(p.name) === enabled) return;
    Settings.plugins[p.name].enabled = enabled;
    dispatch(Events.PLUGIN_TOGGLE, { name: p.name, enabled });
}
export function startPluginApi(p) {
    if (typeof p === "string") p = plugins[p];
    const ok = startPlugin(p);
    if (ok) syncEnabled(p, true);
    return ok;
}
export function stopPluginApi(p) {
    if (typeof p === "string") p = plugins[p];
    const ok = stopPlugin(p);
    if (ok && p) syncEnabled(p, false);
    return ok;
}

/** 返回 true 表示需要刷新页面 */
export function togglePlugin(name) {
    const p = plugins[name];
    if (!p) return false;
    if (p.required || depEnabled.has(name)) return false;
    const next = !isPluginEnabled(name);
    Settings.plugins[name].enabled = next;
    if (next) startPlugin(p); else stopPlugin(p);
    dispatch(Events.PLUGIN_TOGGLE, { name, enabled: next });
    return needsRestart(p);
}

export function registerPlugin(def) {
    if (!addPlugin(def, { runtime: true })) return false;
    // 首次见到也计入 knownPlugins
    const known = Settings.plugins.Settings?.knownPlugins;
    if (known && known[def.name] == null) known[def.name] = Date.now();
    return true;
}

// ---------- 初始化辅助 ----------
export function cleanStaleSettings() {
    for (const name of Object.keys(PlainSettings.plugins)) {
        if (!plugins[name] && !otherSites.has(name)) delete Settings.plugins[name];
    }
}

export function recordKnownPlugins() {
    const s = Settings.plugins.Settings;
    if (!s) return;
    if (!PlainSettings.plugins.Settings.knownPlugins || typeof PlainSettings.plugins.Settings.knownPlugins !== "object") s.knownPlugins = {};
    const known = s.knownPlugins;
    const now = Date.now();
    for (const name of Object.keys(plugins)) if (known[name] == null) known[name] = now;
}

/** 已启用插件的依赖一并启用;依赖只能指向同站点或通用插件 */
export function enforceDependencies() {
    for (const p of Object.values(plugins)) {
        if (!isPluginEnabled(p.name)) continue;
        for (const d of p.dependencies || []) {
            const dep = plugins[d];
            if (!dep) { logger.warn(`${p.name} 依赖的插件 ${d} 不在当前站点`); continue; }
            if (!isPluginEnabled(d)) {
                depEnabled.add(d);
                Settings.plugins[d].enabled = true;
            }
        }
    }
    // Settings.enabled 读到 false 时强制改回 true
    if (PlainSettings.plugins.Settings && PlainSettings.plugins.Settings.enabled === false) Settings.plugins.Settings.enabled = true;
}

export function startAllAt(stage) {
    const failed = [];
    for (const p of Object.values(plugins)) {
        if ((p.startAt ?? StartAt.Init) !== stage) continue;
        if (!isPluginEnabled(p.name) || p.started) continue;
        if (!startPlugin(p)) failed.push(p);
    }
    return failed;
}

/** 导出备份时要去掉的设置项(定义上标了 sensitive) */
export function sensitiveKeys(name) {
    const def = plugins[name]?.settings?.def;
    return def ? Object.keys(def).filter(k => def[k]?.sensitive) : [];
}

export function getVisibleSettings(p) {
    const def = p?.settings?.def;
    if (!def) return [];
    return Object.entries(def).filter(([, s]) => s && !s.hidden && s.type !== OptionType.CUSTOM);
}

/** 插件改名时把旧数据搬过来(目标已存在则不动) */
export function migratePluginSettings(name, ...oldNames) {
    const all = PlainSettings.plugins;
    const cur = all[name];
    if (cur && Object.keys(cur).length) return false;
    for (const old of oldNames) {
        if (old !== name && all[old] && typeof all[old] === "object") {
            Settings.plugins[name] = { ...all[old] };
            delete Settings.plugins[old];
            logger.info(`已把插件设置 ${old} 迁移到 ${name}`);
            return true;
        }
    }
    return false;
}

/** 插件改键时把旧键的值搬过来(新键已存在则不动) */
export function migratePluginSetting(pluginName, newKey, oldKey) {
    const s = PlainSettings.plugins[pluginName];
    if (!s || !(oldKey in s) || newKey in s) return false;
    Settings.plugins[pluginName][newKey] = s[oldKey];
    delete Settings.plugins[pluginName][oldKey];
    return true;
}
