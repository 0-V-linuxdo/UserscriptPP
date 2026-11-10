// 插件模型:定义、启用判定、启动/停止、开关、运行时注册
/* global __USPP_DEV__ */
import { isChromium } from "../env.js";
import { fetchExternalFor } from "./net.js";
import { Logger } from "./logger.js";
import { diag, trace } from "./diag.js";
import { Settings, PlainSettings, SettingsStore, setDefaultResolver, setPluginRegistry } from "./settings.js";
import { addPatch } from "./turbopack.js";
import { enableStyle, disableStyle } from "./styles.js";
import { subscribe as subscribeEvent, dispatch, Events } from "./events.js";
import { addSlotItem, removeSlotItem } from "./slots.js";
import { findStore, waitFor, filters } from "./finders.js";
import { getReact } from "../ui/react.js";
import { getSite } from "./sites.js";
import { openScope, closeScope, getScope, runAs } from "./scope.js";
import { guard, reportPluginError, setBreaker, resetBreaker } from "./plugin-errors.js";
import { registerCommand } from "./commands.js";
import { addInterceptor } from "./interceptors.js";
import { registerSettingsPage } from "./settings-pages.js";
import { isSafeMode, noteStarting, noteFailed } from "./safemode.js";

const perfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
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
// 插件状态分三层:意图(设置里的 enabled,只由用户操作、导入、跨标签页同步改)、
// 期望(每次从意图推导:依赖、安全模式、启动阶段、熔断)、实际(started / startError / tripped)。
// 只有 reconcile 按"期望"去启停插件;各处改了意图或条件后调用它,不自己直接启停
const reachedStages = new Set();   // 已经到过的启动阶段
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

setPluginRegistry(name => !!plugins[name]);
setDefaultResolver((pluginName, key) => {
    if (key === "enabled") return undefined;
    const s = plugins[pluginName]?.settings?.def?.[key];
    return getSettingDefault(s);
});

// ---------- 判定 ----------
const supported = p => !(p.chromiumOnly && !isChromium());

/** 用户意图:必需插件、设置里的开关,没设过时用 enabledByDefault */
function intentOn(name) {
    const p = plugins[name];
    if (!p || !supported(p)) return false;
    if (p.required) return true;
    const stored = PlainSettings.plugins[name]?.enabled;
    if (typeof stored === "boolean") return stored;
    return !!p.enabledByDefault;
}

/** 被意图开启的插件(直接或间接)依赖、因而要一起运行的插件;每次从当前设置推导,不写设置 */
export function dependencyClosure() {
    const need = new Set();
    const visit = name => {
        for (const d of plugins[name]?.dependencies || []) {
            if (!plugins[d] || need.has(d)) continue;
            need.add(d);
            visit(d);
        }
    };
    for (const name of Object.keys(plugins)) if (intentOn(name)) visit(name);
    return need;
}

export function isPluginEnabled(name) {
    const p = plugins[name];
    if (!p || !supported(p)) return false;
    return intentOn(name) || dependencyClosure().has(name);
}

/** 只因为被别的插件依赖才运行(自己没开):界面上锁住开关,显示"由谁需要" */
export const isEnabledAsDependency = name => !!plugins[name] && supported(plugins[name]) && !intentOn(name) && dependencyClosure().has(name);

/** 直接或间接依赖 name、并且正在启用的插件 */
export function dependentsOf(name) {
    const out = [];
    for (const p of Object.values(plugins)) {
        if (p.name === name || !isPluginEnabled(p.name)) continue;
        if (allDependencies(p).has(name)) out.push(p.name);
    }
    return out;
}

function allDependencies(p, seen = new Set()) {
    for (const d of p.dependencies || []) {
        if (seen.has(d) || !plugins[d]) continue;
        seen.add(d);
        allDependencies(plugins[d], seen);
    }
    return seen;
}

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
    if (def.dev && !__USPP_DEV__) return false;
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

/** 按当前设置,本页要打补丁的插件:{ 插件名: true(生效)| false(开发构建只校验) } */
export function patchPlan() {
    const plan = {};
    if (!siteHasDriver()) return plan;
    for (const p of Object.values(plugins)) {
        if (!pluginHasPatches(p) || runtimeRegistered.has(p.name)) continue;
        const on = isPluginEnabled(p.name) && (!isSafeMode() || !!p.required);
        if (on || __USPP_DEV__) plan[p.name] = on;
    }
    return plan;
}

/** 启动时定下的补丁计划:补丁只在模块第一次加载时生效,所以本页只登记这一次,之后不再改 */
let bootPlan = null;
export const getBootPlan = () => bootPlan;
/** 补丁计划和当前设置不一致、要重新加载才生效的插件 */
export const pendingReload = new Set();

/** 按启动时的设置一次登记补丁(已依赖推导;再次调用不做事);开发构建下已禁用插件以只校验方式登记 */
export function registerPatches() {
    if (bootPlan) return;
    for (const p of Object.values(plugins)) {
        if (pluginHasPatches(p) && !runtimeRegistered.has(p.name) && !siteHasDriver()) patchesNotApplicable.add(p.name);
    }
    bootPlan = patchPlan();
    for (const [name, enabled] of Object.entries(bootPlan)) {
        const p = plugins[name];
        p.patches.forEach((patch, i) => {
            try {
                addPatch(patch, p.name, { checkOnly: !enabled, key: `${p.name}#${i}` });
            } catch (e) {
                logger.error(`登记 ${p.name} 的第 ${i} 条补丁失败`, e);
            }
        });
    }
}

/**
 * 完整设置读完后核对补丁计划:和启动时不一样的插件(例如别的副本里开关不同)不补打补丁,记为"重新加载后生效"。
 * 返回这次新发现的插件名
 */
export function checkPatchPlan() {
    if (!bootPlan) return [];
    const now = patchPlan();
    const changed = [];
    for (const name of new Set([...Object.keys(bootPlan), ...Object.keys(now)])) {
        if (!!bootPlan[name] === !!now[name]) { pendingReload.delete(name); continue; }
        if (!pendingReload.has(name)) changed.push(name);
        pendingReload.add(name);
    }
    if (changed.length) logger.info(`补丁要重新加载页面才生效:${changed.join(", ")}`);
    return changed;
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
                try { conf.handler.call(p, cur, prev); } catch (e) { reportPluginError(p.name, `zustand:${storeName}`, e); }
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
    if (diag.disablePlugins.includes(p.name)) { trace("plugin.start.skipped", p.name); return false; }
    trace("plugin.start", p.name);
    if (stack.includes(p.name)) {
        logger.error(`发现循环依赖:${[...stack, p.name].join(" -> ")}`);
        return false;
    }
    for (const dep of p.dependencies || []) {
        const d = plugins[dep];
        if (!d) { logger.warn(`${p.name} 依赖的插件 ${dep} 不存在`); return false; }
        if (!d.started) {
            // 出错太多被停掉的依赖不在这里悄悄重启
            if (d.tripped) { logger.warn(`${p.name} 依赖的插件 ${dep} 因出错太多已停用,本页不启动 ${p.name}`); return false; }
            if (!startPlugin(d, [...stack, p.name])) return false;
        }
    }

    noteStarting(p.name);
    p.startError = null;
    resetBreaker(p.name); // 重新启动后熔断重新计
    const t0 = perfNow();
    const ctx = openScope(p.name);
    // 插件声明了 connect 时,ctx.fetchExternal 只能访问这些主机
    ctx.fetchExternal = fetchExternalFor(p.name, p.connect);
    try {
        if (p.managedStyle) {
            enableStyle(p.managedStyle);
            if (!pluginHasPatches(p)) track(p.name, () => disableStyle(p.managedStyle));
        }
        const started = runAs(p.name, () => p.start?.(ctx));
        // async start():await 之后的出错不算启动失败(插件已在运行),记为运行期错误
        if (started && typeof started.then === "function") started.then(undefined, e => reportPluginError(p.name, "start (async)", e));
        for (const c of p.commands || []) {
            if (!c) continue;
            track(p.name, registerCommand({ ...c, run: guard(p.name, `command:${c.id ?? c.name}`, c.run, true), id: String(c.id ?? c.name).includes(".") ? String(c.id ?? c.name) : `${p.name}.${c.id ?? c.name}`, plugin: p.name }));
        }
        for (const [name, fn] of Object.entries(p.interceptors || {})) {
            if (typeof fn === "function") track(p.name, addInterceptor(name, guard(p.name, `interceptor:${name}`, fn.bind(p), true), { id: p.name }));
        }
        for (const page of p.settingsPages || []) {
            if (page) track(p.name, registerSettingsPage({ ...page, plugin: p.name }));
        }
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
            const off = subscribeEvent(ev, guard(p.name, `event:${ev}`, data => handler.call(p, data)));
            track(p.name, off);
        }
        if (p.zustand) subscribeZustand(p);
        if (typeof p.onSettingsChange === "function") {
            const prefix = `plugins.${p.name}.`;
            const fn = (v, path) => {
                if (path === `${prefix}enabled`) return;
                try { p.onSettingsChange(v, path); } catch (e) { reportPluginError(p.name, "onSettingsChange", e); }
            };
            SettingsStore.addPrefixChangeListener(prefix, fn);
            track(p.name, () => SettingsStore.removePrefixChangeListener(prefix, fn));
        }
        p.started = true;
        p.tripped = false;
        // 启动耗时(含 start()、注入点、命令登记;不含先启动的依赖),Plugins 页和诊断信息里列出慢的插件
        p.startMs = Math.round((perfNow() - t0) * 10) / 10;
        logger.debug(`已启动 ${p.name}(${p.startMs} ms)`);
        return true;
    } catch (e) {
        logger.error(`启动 ${p.name} 失败`, e);
        p.startError = e;
        noteFailed(p.name);
        // 启动到一半失败:让插件有机会撤掉已经做了的事
        try { runAs(p.name, () => p.stop?.(ctx)); } catch (e2) { logger.error(`${p.name}.stop 出错`, e2); }
        runCleanup(p.name);
        closeScope(p.name);
        if (p.managedStyle && !pluginHasPatches(p)) disableStyle(p.managedStyle);
        p.started = false;
        return false;
    }
}

// 熔断:运行期出错太多的插件本页先停掉(不改用户的开关,刷新后照常启动);必需插件不停
setBreaker(name => {
    const p = plugins[name];
    if (!p || p.required || !p.started) return false;
    p.tripped = true;
    // 依赖它的插件也停下(它们离了它多半也不能正常工作),刷新后照常启动
    reconcile([name, ...dependentsOf(name)]);
    return true;
});

/** 已启动插件里启动最慢的几个:[{ name, ms }],从慢到快 */
export function slowestStarts(limit = 5) {
    return Object.values(plugins).filter(p => p.started && typeof p.startMs === "number")
        .sort((a, b) => b.startMs - a.startMs).slice(0, limit).map(p => ({ name: p.name, ms: p.startMs }));
}

export function stopPlugin(p) {
    if (typeof p === "string") p = plugins[p];
    if (!p) return false;
    if (!p.started) return true;
    try { runAs(p.name, () => p.stop?.(getScope(p.name) ?? undefined)); } catch (e) { logger.error(`${p.name}.stop 出错`, e); }
    runCleanup(p.name);
    closeScope(p.name);
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

// ---------- 收敛:让实际运行状态跟上期望 ----------
/** 期望运行:已启用、安全模式允许、启动阶段已到、自己和依赖都没被熔断 */
function shouldRun(p) {
    if (!isPluginEnabled(p.name)) return false;
    if (isSafeMode() && !p.required) return false;
    if (!reachedStages.has(p.startAt ?? StartAt.Init)) return false;
    if (p.tripped) return false;
    for (const d of allDependencies(p)) if (plugins[d]?.tripped) return false;
    return true;
}

/** 插件当前所处状态,界面和诊断都从这里读 */
export function pluginPhase(p) {
    if (typeof p === "string") p = plugins[p];
    if (!p) return "missing";
    if (p.started) return "running";
    if (p.tripped) return "tripped";
    if (p.startError) return "failed";
    if (!isPluginEnabled(p.name)) return "idle";
    if (isSafeMode() && !p.required) return "safeMode";
    if (!reachedStages.has(p.startAt ?? StartAt.Init)) return "waiting";
    if ([...allDependencies(p)].some(d => plugins[d]?.tripped)) return "blocked";
    return "idle";
}

let reconciling = false, reconcileAgain = null;
/**
 * 按期望启停 names 里的插件(缺省为全部):该停的先停(依赖它的先停),该启动的再启动(依赖先启动)。
 * 启动失败过的不自动重试(用户重新打开开关时重试)。返回这次启动失败的插件
 */
export function reconcile(names) {
    const set = new Set(names || Object.keys(plugins));
    if (reconciling) { for (const n of set) (reconcileAgain ??= new Set()).add(n); return []; }
    reconciling = true;
    const failed = [];
    try {
        let todo = set;
        while (todo) {
            reconcileAgain = null;
            const list = [...todo].map(n => plugins[n]).filter(Boolean);
            const toStop = list.filter(p => p.started && !shouldRun(p));
            // 依赖别人的先停:按依赖深度从深到浅
            toStop.sort((a, b) => allDependencies(b).size - allDependencies(a).size);
            for (const p of toStop) stopPlugin(p);
            for (const p of list) {
                if (p.started || p.startError || !shouldRun(p)) continue;
                if (!startPlugin(p)) failed.push(p);
            }
            todo = reconcileAgain;
        }
    } finally { reconciling = false; reconcileAgain = null; }
    return failed;
}

/** 改了 name 的开关时受影响的插件:它自己、它的依赖、依赖它的 */
const affectedBy = name => {
    const p = plugins[name];
    if (!p) return [];
    const out = new Set([name, ...allDependencies(p)]);
    for (const q of Object.values(plugins)) if (allDependencies(q).has(name)) out.add(q.name);
    return [...out];
};

// 开关不管是本页改的、别的标签页同步来的还是导入备份改的,都只经这里收敛
SettingsStore.addPrefixChangeListener("plugins.", (_, path) => {
    const parts = path.split(".");
    if (parts.length !== 3 || parts[2] !== "enabled" || !plugins[parts[1]]) return;
    reconcile(affectedBy(parts[1]));
});

/** 用户重新打开:清掉上次失败、熔断的记录,这次重新试 */
function clearFailure(p) {
    p.startError = null;
    if (p.tripped) { p.tripped = false; resetBreaker(p.name); }
}

function setIntent(p, on) {
    clearFailure(p);
    if (intentOn(p.name) === on) { reconcile(affectedBy(p.name)); return; }
    Settings.plugins[p.name].enabled = on; // 设置变更会触发 reconcile
}

// 公共 API 的启停:改的是用户意图,Plugins 页的开关和实际运行状态一致
export function startPluginApi(p) {
    if (typeof p === "string") p = plugins[p];
    if (!p) return false;
    const was = isPluginEnabled(p.name);
    setIntent(p, true);
    if (!was && isPluginEnabled(p.name)) dispatch(Events.PLUGIN_TOGGLE, { name: p.name, enabled: true });
    return !!p.started;
}
export function stopPluginApi(p) {
    if (typeof p === "string") p = plugins[p];
    if (!p || p.required) return false;
    const was = isPluginEnabled(p.name);
    setIntent(p, false);
    if (was && !isPluginEnabled(p.name)) dispatch(Events.PLUGIN_TOGGLE, { name: p.name, enabled: false });
    return !p.started;
}

/** 返回 true 表示需要刷新页面 */
export function togglePlugin(name) {
    const p = plugins[name];
    if (!p) return false;
    if (p.required || isEnabledAsDependency(name)) return false;
    // 出错太多被停掉的插件:开关显示为关,点一下是重新启动,不改用户的开关
    if (p.tripped && intentOn(name)) {
        clearFailure(p);
        reconcile(affectedBy(name));
        dispatch(Events.PLUGIN_TOGGLE, { name, enabled: true });
        return false;
    }
    const next = !intentOn(name);
    setIntent(p, next);
    dispatch(Events.PLUGIN_TOGGLE, { name, enabled: isPluginEnabled(name) });
    return needsRestart(p);
}

/**
 * 热重载:用新定义替换同名插件。原来在运行就先停(经 ctx 登记的都会撤掉),换上新定义后再启动;开关状态和设置不变。
 * 声明了打包器补丁的插件不能原地替换(补丁只在模块加载时生效),返回 { ok: false, reason: "patches" }。
 */
export function replacePlugin(def) {
    if (!def?.name) return { ok: false, reason: "invalid" };
    const old = plugins[def.name];
    if (!old) return { ok: false, reason: "missing" };
    if (siteHasDriver() && (pluginHasPatches(old) || pluginHasPatches(def))) return { ok: false, reason: "patches" };
    const wasStarted = !!old.started;
    if (wasStarted) stopPlugin(old);
    def.site ??= old.site;
    def.started = false;
    if (def.settings) def.settings.pluginName = def.name;
    bindMethods(def);
    plugins[def.name] = def;
    const started = wasStarted ? startPlugin(def) : false;
    dispatch(Events.PLUGIN_TOGGLE, { name: def.name, enabled: isPluginEnabled(def.name), replaced: true });
    return { ok: !wasStarted || started, started, error: def.startError ?? null };
}

export function registerPlugin(def) {
    if (!addPlugin(def, { runtime: true })) return false;
    // 首次见到也计入 knownPlugins
    const known = Settings.plugins.Settings?.knownPlugins;
    if (known && known[def.name] == null) known[def.name] = Date.now();
    return true;
}

// ---------- 初始化辅助 ----------
/**
 * 本次构建里没有的插件:设置和插件数据不立即删(插件可能只是暂时拿掉、改了名、或用户回退了版本),
 * 记下最后见到它的时间,超过 STALE_MS 没再出现才删。返回还要保留数据的插件名(给 pruneData)。
 */
export const STALE_MS = 90 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export function cleanStaleSettings(now = Date.now()) {
    const sys = Settings.plugins.Settings;
    if (!PlainSettings.plugins.Settings?.pluginsLastSeen || typeof PlainSettings.plugins.Settings.pluginsLastSeen !== "object") sys.pluginsLastSeen = {};
    const seen = sys.pluginsLastSeen;
    const plain = PlainSettings.plugins.Settings.pluginsLastSeen;
    const present = name => !!plugins[name] || otherSites.has(name);
    // 在场的插件:最后见到的时间按天更新,避免每次启动都写设置;记的是当天零点(UTC),
    // 恢复会话时几个标签页同时启动,写出的内容相同,不会互相冲突
    const today = now - (now % DAY_MS);
    for (const name of Object.keys(plugins)) if (!(now - (plain[name] || 0) < DAY_MS)) seen[name] = today;
    const keep = new Set([...Object.keys(plugins), ...otherSites]);
    for (const name of Object.keys(PlainSettings.plugins)) {
        if (present(name)) continue;
        const at = plain[name];
        if (!at) { seen[name] = today; keep.add(name); continue; }
        if (now - at < STALE_MS) { keep.add(name); continue; }
        delete Settings.plugins[name];
        delete seen[name];
        logger.info(`插件 ${name} 已 ${Math.round((now - at) / DAY_MS)} 天没出现,删除它的设置和数据`);
    }
    // 只有数据、没有设置的插件(数据库里的名字)也按最后见到的时间保留
    for (const name of Object.keys(plain)) if (!present(name) && now - plain[name] < STALE_MS) keep.add(name);
    return [...keep];
}

export function recordKnownPlugins() {
    const s = Settings.plugins.Settings;
    if (!s) return;
    if (!PlainSettings.plugins.Settings.knownPlugins || typeof PlainSettings.plugins.Settings.knownPlugins !== "object") s.knownPlugins = {};
    const known = s.knownPlugins;
    const now = Date.now();
    const today = now - (now % DAY_MS);
    for (const name of Object.keys(plugins)) if (known[name] == null) known[name] = today;
}

/** 检查依赖是否都在(依赖只能指向同站点或通用插件);依赖的启用由 dependencyClosure 推导,不写进设置 */
export function enforceDependencies() {
    for (const p of Object.values(plugins)) {
        if (!isPluginEnabled(p.name)) continue;
        for (const d of p.dependencies || []) if (!plugins[d]) logger.warn(`${p.name} 依赖的插件 ${d} 不在当前站点`);
    }
    // Settings.enabled 读到 false 时强制改回 true
    if (PlainSettings.plugins.Settings && PlainSettings.plugins.Settings.enabled === false) Settings.plugins.Settings.enabled = true;
}

/** 启动阶段到了:这个阶段的插件按期望启动;返回启动失败的 */
export function startAllAt(stage) {
    reachedStages.add(stage);
    return reconcile(Object.values(plugins).filter(p => (p.startAt ?? StartAt.Init) === stage).map(p => p.name));
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
