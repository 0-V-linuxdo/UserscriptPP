// 站点脚本的入口:一份站点无关的核心 + 本脚本带的站点适配。同一页面上可以有多条基于框架的脚本,各自独立
import { W, VERSION, BUILD_TYPE, IS_DEV, isChromium, SCRIPT_ID, SCRIPT_NAME, GLOBAL_NAME, INSTANCE_KEY, INSTANCE_EXPR, API_VERSION } from "./env.js";
import builtinSites from "uspp:sites";
import builtinPlugins from "uspp:plugins";
import { Logger } from "./lib/logger.js";
import { diag, diagOn, trace, diagReport, setDiagExtra, DIAG_KEY } from "./lib/diag.js";
import * as utils from "./lib/utils.js";
import { makeLazy, proxyLazy } from "./lib/lazy.js";
import { Settings, PlainSettings, SettingsStore, loadSync, loadAsync, installUnloadSave, installCrossTabSync } from "./lib/settings.js";
import * as Sites from "./lib/sites.js";
import { matchesUrl, matchPattern } from "./lib/match.js";
import { exportSettings, importSettings, parseBackup } from "./lib/backup.js";
import * as P from "./lib/plugins.js";
import * as T from "./lib/turbopack.js";
import * as F from "./lib/finders.js";
import * as themes from "./lib/themes.js";
import * as dom from "./lib/dom.js";
import { onRouteChange, installRouteWatcher, setRouteParser } from "./lib/route.js";
import { onRequest, onResponse, installNetworkHooks } from "./lib/network.js";
import { addSlotItem, removeSlotItem, getSlotItems, onSlotChange, getSlotVersion } from "./lib/slots.js";
import { installMenuCommands } from "./lib/menu.js";
import { registerStyle, enableStyle, disableStyle, unregisterStyle } from "./lib/styles.js";
import { subscribe, dispatch, Events, setSiteEvents } from "./lib/events.js";
import { fetchExternal } from "./lib/net.js";
import { getFiber, getProps, walkFiberUp, findFiberProps } from "./lib/fiber.js";
import { addRenderHook, asArray, treeHas } from "./lib/jsxhook.js";
import * as R from "./ui/react.js";
import * as C from "./ui/components.js";
import * as icons from "./ui/icons.js";
import { openModal, closeModal, closeAllModals, ModalCard, confirmDialog } from "./ui/modal.js";
import { ensureRoot } from "./ui/root.js";
import { showToast, dismissToast, showNotice, closeNotice, ToastType } from "./ui/toast.js";
import { installFloating } from "./ui/floating.js";
import { currentTheme } from "./ui/theme.js";
import { UI_CSS } from "./ui/styles.css.js";
import SettingsPlugin, { setSettingsOpener } from "./settings/index.js";
import { SETTINGS_PAGES } from "./settings/pages.js";
import { openSettingsPanel, closeSettingsPanel } from "./settings/SettingsPanel.js";
import { PluginModal } from "./settings/PluginModal.js";

const logger = new Logger("Core", "#c4b5fd");
const DEFAULT_READY_TIMEOUT = 15000;
const BUILD_SITES = typeof __USPP_SITES__ !== "undefined" ? __USPP_SITES__ : [];

function step(label, fn) {
    try { return fn(); } catch (e) { logger.error(`${label} 失败`, e); }
}

// ---------- 设置入口 ----------
function openPluginSettings(plugin) {
    const p = typeof plugin === "string" ? P.plugins[plugin] : plugin;
    if (!p) return false;
    openModal(({ onClose }) => R.h(PluginModal, { plugin: p, onClose }), { modalKey: `uspp-plugin-${p.name}` });
    return true;
}

/** 站点声明了 settingsHost 且打开成功时用站点自己的设置界面;否则(或嵌入失败)打开框架面板 */
function openSettings(opts = {}) {
    const host = Sites.getSite().settingsHost;
    if (host && typeof host.open === "function" && PlainSettings.plugins.Settings?.showSiteEntry !== false) {
        let ok = false;
        try { ok = !!host.open(opts); } catch (e) { logger.warn("站点设置界面打开失败", e); }
        if (ok) {
            setTimeout(() => {
                const shown = typeof host.isOpen === "function" ? host.isOpen() : !!document.querySelector("[data-uspp-page]");
                if (!shown) openSettingsPanel(opts);
            }, 800);
            return "site";
        }
    }
    openSettingsPanel(opts);
    return "panel";
}

/** 页面空闲时本系统自身产生的 DOM 变更数(真实页面验收用:应为 0) */
function countIdleMutations(ms = 8000) {
    // 只统计本脚本的节点(名字在构建时带上了脚本 ID)
    const ours = n => n && n.nodeType === 1 && (n.tagName.toLowerCase().startsWith("uspp-") || [...n.attributes].some(a => a.name.startsWith("data-uspp")) || [...n.classList].some(c => c.startsWith("uspp-")) || !!n.querySelector?.("[data-uspp],[class*='uspp-'],uspp-root"));
    return new Promise(resolve => {
        let count = 0;
        const samples = [];
        const mo = new MutationObserver(list => {
            for (const m of list) {
                const hit = [...m.addedNodes, ...m.removedNodes].some(ours) || (m.type === "attributes" && (ours(m.target) || m.attributeName?.startsWith("data-uspp")));
                if (hit) { count++; if (samples.length < 10) samples.push(m.target?.nodeName); }
            }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        setTimeout(() => { mo.disconnect(); resolve({ count, samples }); }, ms);
    });
}

// ---------- 站点别名(旧接口名) ----------
/** 所有站点 api 里出现过的名字都挂到全局对象上:当前站点提供时用它的,否则调用只记 debug */
function installAliases(api) {
    const names = new Set();
    for (const s of Sites.getSites()) for (const k of Object.keys(s.api || {})) names.add(k);
    for (const name of names) {
        if (name in api) continue;
        Object.defineProperty(api, name, {
            enumerable: true,
            get() {
                const own = Sites.getSite().api;
                if (own && name in own) return own[name];
                const sample = Sites.getSites().map(s => s.api?.[name]).find(v => v != null);
                if (typeof sample === "function") return (...args) => { logger.debug(`${name} 只在 ${siteNamesWith(name)} 上可用,当前站点忽略`, args[0]); };
                return {};
            },
        });
    }
}
const siteNamesWith = name => Sites.getSites().filter(s => s.api && name in s.api).map(s => s.name).join("、");

/** settingsHost.patches 记在核心 Settings 插件名下,补丁里的 $self 指向本实例的 site.settingsHost */
function registerHostPatches() {
    const host = Sites.getSite().settingsHost;
    (host?.patches || []).forEach((patch, i) => {
        try { T.addPatch(patch, "Settings", { key: `Settings#host${i}`, self: `${INSTANCE_EXPR}.site.settingsHost` }); } catch (e) { logger.error(`登记站点设置入口的第 ${i} 条补丁失败`, e); }
    });
}

// ---------- 站点就绪 ----------
function waitSiteReady(site, cb) {
    let fired = false;
    const r = site.ready;
    const timeoutMs = (r && typeof r === "object" && r.timeout) || site.readyTimeout || DEFAULT_READY_TIMEOUT;
    const offs = [];
    const fire = () => { if (fired) return; fired = true; offs.forEach(o => { try { o(); } catch { /* 忽略 */ } }); clearTimeout(timer); cb(); };
    const timer = setTimeout(fire, r ? timeoutMs : 0);
    if (!r) return;
    if (typeof r === "function") {
        const check = () => { try { if (r()) fire(); } catch { /* 继续等 */ } };
        const iv = setInterval(check, 200);
        offs.push(() => clearInterval(iv), T.onModuleLoad(check));
        check();
        return;
    }
    if (typeof r.module === "function") {
        offs.push(F.waitFor(r.module, () => setTimeout(fire, 0)));
        // TURBOPACK 被别的脚本接管、又没取到运行时:模块等不到了,不再空等到超时
        offs.push(T.onTakeover(() => { if (!T.runtime.registry) fire(); }));
        // 注入前已执行的模块
        step("扫描模块缓存", T.rescanRuntimeCache);
    }
    if (r.element) dom.waitForElement(r.element).then(el => { if (el) fire(); });
}

function checkFingerprint(site) {
    const chunkPath = site.driverOptions?.chunkPath;
    const base = s => { try { return new URL(s, location.href).pathname.split("/").pop(); } catch { return String(s).split("/").pop(); } };
    const names = new Set();
    if (chunkPath) for (const s of document.querySelectorAll(`script[src*="${chunkPath}"]`)) names.add(base(s.src));
    for (const p of T.chunkPaths) names.add(base(p));
    const now = [...names].filter(Boolean).sort();
    if (!now.length) return;
    const prev = Array.isArray(themes.readPartition().chunkFingerprint) ? themes.readPartition().chunkFingerprint : null;
    if (prev && prev.length) {
        const set = new Set(prev);
        const overlap = now.filter(n => set.has(n)).length;
        if (overlap / Math.max(now.length, prev.length) < 0.5) logger.warn(`${site.name} 的构建已变化(分块文件重合不到一半),部分补丁可能失效`);
    }
    if (!prev || prev.join("\n") !== now.join("\n")) themes.writePartition().chunkFingerprint = now;
}

function retryFailed(list) {
    let pending = list.slice();
    const attempt = () => {
        T.rescanRuntimeCache();
        pending = pending.filter(p => P.isPluginEnabled(p.name) && !p.started && !P.startPlugin(p));
    };
    const tick = utils.debounce(() => {
        attempt();
        if (!pending.length) { off(); clearTimeout(last); logger.info("之前启动失败的插件已全部启动"); }
    }, 200);
    const off = T.onModuleLoad(tick);
    const last = setTimeout(() => {
        off(); tick.cancel?.();
        attempt();
        if (pending.length) logger.warn(`以下插件启动失败:${pending.map(p => p.name).join(", ")}`);
        else logger.info("之前启动失败的插件已全部启动");
    }, DEFAULT_READY_TIMEOUT);
}

// ---------- 定义收集 ----------
/** 构建产物里的定义可以是对象,也可以是接收公开接口的工厂函数 U => 定义 */
const materialize = (entry, api) => (typeof entry === "function" ? entry(api) : entry);

function main() {
    // ---------- 守卫 ----------
    if (W.top !== W.self) return;
    // 只防同一条脚本重复运行;别的基于框架的脚本各有自己的实例,互不让位
    if (W[INSTANCE_KEY]) { console.info(`[${SCRIPT_NAME}] 本脚本已在运行,跳过重复注入`); return; }

    let resolveReady;
    const onceReady = new Promise(r => { resolveReady = r; });
    let siteReadyDone = false;

    const api = {
        version: VERSION,
        apiVersion: API_VERSION,
        buildType: BUILD_TYPE,
        scriptId: SCRIPT_ID,
        scriptName: SCRIPT_NAME,
        // 本脚本页面上名字的前缀(类名、元素名、data- 标记都以它开头),站点适配拼名字时用
        prefix: "uspp-",
        buildSites: BUILD_SITES.slice(),
        // 站点
        defineSite: Sites.defineSite,
        // 运行时注册站点只作开发构建里的控制台调试手段
        registerSite: def => {
            if (!IS_DEV) { logger.warn("registerSite 只在开发构建里可用"); return false; }
            return registerSiteRuntime(def);
        },
        get site() { return Sites.getSite(); },
        get sites() { return Object.fromEntries(Sites.getSites().map(s => [s.id, s])); },
        isSite: Sites.isSite,
        siteKey: Sites.siteKey,
        // 插件
        plugins: P.plugins,
        registerPlugin: P.registerPlugin,
        startPlugin: P.startPluginApi,
        stopPlugin: P.stopPluginApi,
        isPluginEnabled: P.isPluginEnabled,
        togglePlugin: P.togglePlugin,
        definePlugin: P.definePlugin,
        definePluginSettings: P.definePluginSettings,
        migratePluginSettings: P.migratePluginSettings,
        migratePluginSetting: P.migratePluginSetting,
        getVisibleSettings: P.getVisibleSettings,
        OptionType: P.OptionType,
        StartAt: P.StartAt,
        // 设置
        Settings, PlainSettings, SettingsStore,
        openSettings, openSettingsPanel, closeSettingsPanel, openPluginSettings,
        settingsPages: SETTINGS_PAGES,
        exportSettings, importSettings, parseBackup,
        // 打包器(只在使用打包器驱动的站点上有内容)
        addPatch: (patch, pluginName) => T.addPatch(patch, pluginName),
        patches: T.patches,
        patchStats: T.patchStats,
        patchResults: T.patchResults,
        patchReport: () => ({ ...T.patchReport(), notApplicable: [...P.patchesNotApplicable] }),
        getPatchedCode: T.getPatchedCode,
        onPatchBypassed: T.onPatchBypassed,
        registerInjectionFallback: T.registerInjectionFallback,
        // 模块查找
        filters: F.filters,
        find: F.find, findAll: F.findAll,
        findByProps: F.findByProps, findByCode: F.findByCode, findByDisplayName: F.findByDisplayName,
        findComponentByCode: F.findComponentByCode, findExportedComponent: F.findExportedComponent, findStore: F.findStore,
        findLazy: F.findLazy, findByPropsLazy: F.findByPropsLazy, findByCodeLazy: F.findByCodeLazy,
        findByDisplayNameLazy: F.findByDisplayNameLazy, findComponentByCodeLazy: F.findComponentByCodeLazy,
        findExportedComponentLazy: F.findExportedComponentLazy, findStoreLazy: F.findStoreLazy,
        findModuleId: F.findModuleId, findModuleFactory: F.findModuleFactory,
        mapMangledModule: F.mapMangledModule, requireModule: F.requireModule, waitFor: F.waitFor,
        search: F.search, onModuleLoad: T.onModuleLoad, onceReady, getAllStores: F.getAllStores,
        isZustandStore: F.isZustandStore, findReact: F.getReact,
        // 被其他脚本包装执行的模块只在运行时缓存里:并入本系统的缓存;版本号在缓存变化时递增
        syncModuleCache: () => { try { T.syncRuntimeCache(); } catch { /* 无打包器 */ } }, moduleCacheVersion: T.getCacheVersion,
        // DOM / fiber / JSX
        waitForElement: dom.waitForElement, observe: dom.observe,
        setAttr: dom.setAttr, setText: dom.setText, toggleClass: dom.toggleClass, setStyle: dom.setStyle, mount: dom.mount, unmount: dom.unmount,
        getFiber, getProps, walkFiberUp, findFiberProps,
        addRenderHook, asArray, treeHas,
        // 路由 / 网络
        onRouteChange, onRequest, onResponse,
        // 注入点
        addSlotItem, removeSlotItem, getSlotItems, onSlotChange, getSlotVersion,
        // 界面
        react: {
            h: R.h, Fragment: R.Fragment, getReact: R.getReact, getRenderer: R.getRenderer, usingSiteRenderer: R.usingSiteRenderer,
            useState: R.useState, useEffect: R.useEffect, useLayoutEffect: R.useLayoutEffect, useMemo: R.useMemo, useRef: R.useRef,
            useCallback: R.useCallback, useReducer: R.useReducer, useContext: R.useContext, useId: R.useId,
            useSyncExternalStore: R.useSyncExternalStore, useForceUpdate: R.useForceUpdate, useSubscription: R.useSubscription,
        },
        components: { ...C, ModalCard, confirmDialog },
        icons,
        openModal, closeModal, closeAllModals, ensureUiRoot: () => (diag.noEarlyUiRoot ? trace("uiRoot.early.skipped") : ensureRoot()),
        showToast, dismissToast, ToastType, showNotice, closeNotice,
        theme: currentTheme,
        // 样式与主题(作用于当前站点分区)
        registerStyle: (name, css) => registerStyle(name, css),
        enableStyle, disableStyle, unregisterStyle,
        classNameFactory: utils.classNameFactory, classes: utils.classes,
        getThemes: themes.getThemes, addTheme: themes.addTheme, addLocalTheme: themes.addLocalTheme,
        updateLocalTheme: themes.updateLocalTheme, removeTheme: themes.removeTheme,
        enableTheme: themes.enableTheme, disableTheme: themes.disableTheme, setThemeAllSites: themes.setThemeAllSites,
        isThemesEnabled: themes.isThemesEnabled, setThemesEnabled: themes.setThemesEnabled,
        isOnlineThemesEnabled: themes.isOnlineThemesEnabled, setOnlineThemesEnabled: themes.setOnlineThemesEnabled,
        getQuickCss: themes.getQuickCss, setQuickCss: themes.setQuickCss,
        // 事件
        subscribe, dispatch, Events,
        // 工具
        Logger, ErrorBoundary: R.ErrorBoundary, makeLazy, proxyLazy, fetchExternal,
        copyToClipboard: utils.copyToClipboard, debounce: utils.debounce, sleep: utils.sleep, onlyOnce: utils.onlyOnce,
        escapeRegExp: utils.escapeRegExp, humanizeKey: utils.humanizeKey,
        matchesUrl, matchPattern, isChromium,
        countIdleMutations,
    };
    if (IS_DEV) {
        // 诊断(开发构建):开关见 core/lib/diag.js
        api.diag = { key: DIAG_KEY, config: diag, report: diagReport, set: c => { W.localStorage.setItem(DIAG_KEY, JSON.stringify(c)); return "已保存,硬刷新后生效"; }, clear: () => { W.localStorage.removeItem(DIAG_KEY); return "已清除,硬刷新后生效"; } };
        setDiagExtra(() => {
            const rep = T.patchReport();
            let cacheIds = null;
            try { cacheIds = T.runtime.cache ? Object.keys(T.runtime.cache) : null; } catch { /* 忽略 */ }
            return {
                stats: { ...rep.stats, orphaned: rep.orphaned.length },
                plugins: Object.values(P.plugins).map(p => `${p.name}:${p.started}`),
                moduleCache: T.moduleCache.size,
                runtimeCache: cacheIds ? cacheIds.length : null,
                runtimeCacheIds: cacheIds,
            };
        });
        if (diagOn) logger.warn(`诊断开关已打开:${JSON.stringify(diag)}(${DIAG_KEY})`);
    }
    Object.defineProperty(W, INSTANCE_KEY, { value: api, writable: false, configurable: true, enumerable: false });
    // 控制台调试入口:挂到本脚本自己配置的名字上;已被占用时不覆盖
    if (GLOBAL_NAME) {
        if (GLOBAL_NAME in W) logger.warn(`全局名字 ${GLOBAL_NAME} 已被占用,未挂调试入口`);
        else Object.defineProperty(W, GLOBAL_NAME, { value: api, writable: false, configurable: true, enumerable: false });
    }

    // ---------- 同步阶段 ----------
    step("同步读取设置", loadSync);
    step("注册核心插件", () => P.addPlugin(SettingsPlugin));
    setSettingsOpener(() => openSettings());

    const sitePlugins = []; // { site, def }
    for (const entry of builtinSites) {
        step(`载入站点 ${entry?.id ?? ""}`, () => {
            const def = materialize(entry.site, api);
            if (!def) return;
            Sites.addSite(def);
            for (const pe of entry.plugins || []) {
                const pd = materialize(pe, api);
                if (pd) { pd.site = def.id; sitePlugins.push(pd); }
            }
            for (const pd of def.plugins || []) { pd.site ??= def.id; sitePlugins.push(pd); }
        });
    }
    const site = Sites.selectSite();
    step("站点事件", () => setSiteEvents(site.events));
    step("站点别名", () => installAliases(api));
    const genericPlugins = builtinPlugins.map(e => step("载入通用插件", () => materialize(e, api))).filter(Boolean);
    for (const def of genericPlugins) { def.site ??= "*"; step(`注册插件 ${def.name}`, () => P.addPlugin(def)); }
    for (const def of sitePlugins) step(`注册插件 ${def.name}`, () => P.addPlugin(def));
    step("菜单命令", installMenuCommands);
    step("悬浮按钮", installFloating);
    step("注册界面样式", () => registerStyle("uspp-ui", UI_CSS));
    if (typeof site.routeInfo === "function") setRouteParser(site.routeInfo);
    if (site.network) step("网络旁路", installNetworkHooks);
    if (site.route) step("路由工具", installRouteWatcher);

    // 页面接入工具:只有当前站点声明了打包器驱动才拦截
    if (site.driver === "turbopack") {
        step("登记补丁", P.registerPatches);
        if (diag.noHostPatches) trace("hostPatches.skipped");
        else step("登记站点设置入口补丁", registerHostPatches);
        if (diag.noTurbopack) trace("turbopack.skipped");
        else {
            step("安装打包器拦截", T.installInterceptor);
            step("监视打包器", () => T.watchInstrumentation(20000));
        }
    } else if (site.driver) {
        logger.warn(`不支持的打包器驱动:${site.driver}`);
    }
    logger.info(`${SCRIPT_NAME} ${VERSION}(${BUILD_TYPE}),脚本 ID ${SCRIPT_ID},当前站点 ${site.id},已注册 ${Object.keys(P.plugins).length} 个插件`);

    // ---------- 异步阶段 ----------
    (async () => {
        try { await loadAsync(); } catch (e) { logger.error("读取设置失败", e); }
        step("安装卸载保存", installUnloadSave);
        step("多标签页同步", installCrossTabSync);
        step("清理旧设置", P.cleanStaleSettings);
        step("记录插件", P.recordKnownPlugins);
        step("强制依赖", P.enforceDependencies);
        if (site.driver === "turbopack") step("登记补丁", P.registerPatches);
        step("启动 Init 插件", () => P.startAllAt(P.StartAt.Init));

        const onDom = () => {
            step("启动 DOMContentLoaded 插件", () => P.startAllAt(P.StartAt.DOMContentLoaded));
            if (diag.noSiteStart) trace("site.start.skipped");
            else { trace("site.start"); step("站点启动", () => site.start?.call(site, api)); }
            waitSiteReady(site, () => onSiteReady(site));
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onDom, { once: true });
        else onDom();
    })();

    function onSiteReady(s) {
        if (siteReadyDone) return;
        siteReadyDone = true;
        trace("site.ready", s.id);
        R.markSiteReady();
        if (s.driver === "turbopack") step("扫描模块缓存", T.rescanRuntimeCache);
        step("onceReady", () => resolveReady());
        dispatch(Events.SITE_READY, { site: s.id });
        const failed = step("启动 SiteReady 插件", () => P.startAllAt(P.StartAt.SiteReady)) || [];
        if (failed.length) retryFailed(failed);
        if (s.driver === "turbopack") {
            logger.info(`站点已就绪,已加载 ${T.moduleCache.size} 个模块`);
            // 共存时部分模块不经本系统的包装执行,定期并入运行时缓存
            setInterval(() => { try { T.syncRuntimeCache(); } catch { /* 忽略 */ } }, 2000);
            setTimeout(() => step("补丁健康报告", T.logHealthReport), 5000);
            setTimeout(() => step("构建指纹", () => checkFingerprint(s)), 0);
        }
    }

    /** 运行时注册站点:不能用打包器驱动;当前为通用站点且匹配时切换过去并启动它的插件 */
    function registerSiteRuntime(entry) {
        const def = typeof entry === "function" ? entry(api) : entry;
        if (!Sites.addSite(def, { runtime: true })) return false;
        const stored = Sites.getSiteById(def.id);
        if (!Sites.switchTo(stored)) return true;
        logger.info(`已切换到运行时注册的站点 ${stored.id}`);
        setSiteEvents(stored.events);
        installAliases(api);
        if (typeof stored.routeInfo === "function") setRouteParser(stored.routeInfo);
        if (stored.route) installRouteWatcher();
        for (const pd of stored.plugins || []) { pd.site ??= stored.id; P.addPlugin(pd, { runtime: true }); }
        P.enforceDependencies();
        for (const stage of [P.StartAt.Init, P.StartAt.DOMContentLoaded]) P.startAllAt(stage);
        step("站点启动", () => stored.start?.call(stored, api));
        siteReadyDone = false;
        waitSiteReady(stored, () => onSiteReady(stored));
        return true;
    }
}

try { main(); } catch (e) { console.error(`[${SCRIPT_NAME}] 启动失败`, e); }
