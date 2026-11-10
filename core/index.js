// 站点脚本的入口:一份站点无关的核心 + 本脚本带的站点适配。同一页面上可以有多条基于框架的脚本,各自独立
/* global __USPP_DEV__, __USPP_WEBPACK__ */
import { W, VERSION, FRAMEWORK_VERSION, BUILD_TYPE, HOT_URL, isChromium, SCRIPT_ID, SCRIPT_NAME, SUPPORT_URL, GLOBAL_NAME, INSTANCE_KEY, INSTANCE_EXPR, API_VERSION } from "./env.js";
import builtinSites from "uspp:sites";
import builtinPlugins from "uspp:plugins";
import { Logger } from "./lib/logger.js";
import { diag, diagOn, trace, diagReport, setDiagExtra, DIAG_KEY } from "./lib/diag.js";
import * as utils from "./lib/utils.js";
import { makeLazy, proxyLazy } from "./lib/lazy.js";
import { Settings, PlainSettings, SettingsStore, loadSync, loadAsync, applyBootSnapshot, installUnloadSave, installCrossTabSync } from "./lib/settings.js";
import * as Sites from "./lib/sites.js";
import { matchesUrl, matchPattern } from "./lib/match.js";
import { exportSettings, importSettings, parseBackup, previewImport, undoImport, lastImport } from "./lib/backup.js";
import * as P from "./lib/plugins.js";
import { onPluginTripped, pluginErrorStats } from "./lib/plugin-errors.js";
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
import * as Kit from "./ui/kit.js";
import { highlightCss } from "./ui/highlight.js";
import { createExternalStore, createSelectionStore } from "./lib/stores.js";
import * as icons from "./ui/icons.js";
import { openModal, closeModal, closeAllModals, ModalCard, confirmDialog } from "./ui/modal.js";
import { ensureRoot, queryUi } from "./ui/root.js";
import { showToast, dismissToast, showNotice, closeNotice, ToastType } from "./ui/toast.js";
import { installFloating } from "./ui/floating.js";
import { currentTheme } from "./ui/theme.js";
import { UI_CSS } from "./ui/styles.css.js";
import SettingsPlugin, { setSettingsOpener } from "./settings/index.js";
import { openSettingsPanel, closeSettingsPanel } from "./settings/SettingsPanel.js";
import { PluginModal } from "./settings/PluginModal.js";
import { checkPatches, describeResult, crawlChunks, extractChunkPaths } from "./lib/reporter.js";
import { trackFinders, failedFinders } from "./lib/finder-log.js";
import { ownByCurrent } from "./lib/scope.js";
import { installBridge, setPluginResolver, setSelfTarget } from "./lib/bridge.js";
import { patchMethod, isPatched } from "./lib/patcher.js";
import { rewriteRequest, rewriteResponse, onWebSocket, onEventSource, makeResponse } from "./lib/network.js";
import { dataStoreFor, exportData, importData, pruneData } from "./lib/datastore.js";
import { applyMenuPatches } from "./lib/slots.js";
import { renderSlot, SlotOutlet } from "./ui/slot-render.js";
import { setSiteInterceptors, addInterceptor, runInterceptors, hasInterceptors } from "./lib/interceptors.js";
import { registerCommand, runCommand, getCommands, installKeybinds, keyFor } from "./lib/commands.js";
import { registerSettingsPage } from "./lib/settings-pages.js";
import { getSettingsPages } from "./settings/pages.js";
import { notify, getNotificationHistory } from "./ui/notify.js";
import { beginBoot, isSafeMode, safeModeReason, lastBootInfo, markBootHealthy, reloadInSafeMode, exitSafeMode } from "./lib/safemode.js";
import { collectDiagnostics, setPatchSummary } from "./lib/diagnostics.js";
import { openPalette, closePalette, setPaletteOpener } from "./settings/Palette.js";
import { copyDiagnostics, reportIssue } from "./settings/index.js";
import { showFailureSummary, openFailedList } from "./settings/FailedPlugins.js";
import { startHotClient, evalPluginChunk } from "./lib/hot.js";
import { installWebpack } from "./lib/webpack.js";
import { checkForUpdate, installUpdate, CHANGELOG } from "./lib/updater.js";
import { openChangelog } from "./settings/UpdatesTab.js";

const logger = new Logger("Core", "#c4b5fd");
const DEFAULT_READY_TIMEOUT = 15000;
const BUILD_SITES = typeof __USPP_SITES__ !== "undefined" ? __USPP_SITES__ : [];

function step(label, fn) {
    try { return fn(); } catch (e) { logger.error(`${label} 失败`, e); }
}

// ---------- 设置入口 ----------
function openPluginSettings(plugin, focusKey) {
    const p = typeof plugin === "string" ? P.plugins[plugin] : plugin;
    if (!p) return false;
    openModal(({ onClose }) => R.h(PluginModal, { plugin: p, onClose }), { modalKey: `uspp-plugin-${p.name}` });
    // 从搜索栏打开某个设置项时滚到它并短暂高亮
    if (focusKey) setTimeout(() => {
        const el = queryUi(`[data-uspp-setting="${String(focusKey).replace(/["\\]/g, "")}"]`);
        if (!el) return;
        try { el.scrollIntoView({ block: "center" }); } catch { /* 忽略 */ }
        el.classList.add("uspp-setting-flash");
        setTimeout(() => el.classList.remove("uspp-setting-flash"), 1600);
    }, 80);
    return true;
}

/** 安全模式提示:说明原因,可以直接恢复或打开设置 */
function showSafeModeNotice() {
    const info = lastBootInfo();
    const why = safeModeReason() === "crash"
        ? `The page may have been broken by a plugin${info.lastPlugin ? ` (last starting: ${info.lastPlugin})` : ""}${info.failed.length ? `; failed: ${info.failed.join(", ")}` : ""}.`
        : "Started in safe mode on request.";
    showNotice({ type: "WARNING", message: `${SCRIPT_NAME} is in safe mode: only required plugins run, no themes or Quick CSS. ${why}`, action: { label: "Exit safe mode", onClick: exitSafeMode, close: false } });
}

/** 站点声明了 settingsHost 且打开成功时用站点自己的设置界面;否则(或嵌入失败)打开框架面板 */
function openSettings(opts = {}) {
    const host = Sites.getSite().settingsHost;
    if (host && typeof host.open === "function" && PlainSettings.plugins.Settings?.showSiteEntry !== false) {
        let ok = false;
        try { ok = !!host.open(opts); } catch (e) { logger.warn("站点设置界面打开失败", e); }
        if (ok) {
            setTimeout(() => {
                const shown = typeof host.isOpen === "function" ? host.isOpen() : !!queryUi("[data-uspp-page]");
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
        try { T.addPatch(patch, "Settings", { key: `Settings#host${i}`, self: { key: "settingsHost", expr: `${INSTANCE_EXPR}.site.settingsHost` } }); } catch (e) { logger.error(`登记站点设置入口的第 ${i} 条补丁失败`, e); }
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
    if (site.driver === "webpack") {
        // webpack:分块文件名带内容哈希,站点重新构建后会变;看同源的 <script src>(分块 ID 往往不变,不能用)
        for (const s of document.querySelectorAll("script[src]")) { try { if (new URL(s.src, location.href).origin === location.origin) names.add(base(s.src)); } catch { /* 忽略 */ } }
    } else {
        if (chunkPath) for (const s of document.querySelectorAll(`script[src*="${chunkPath}"]`)) names.add(base(s.src));
        for (const p of T.chunkPaths) names.add(base(p));
    }
    const now = [...names].filter(Boolean).sort();
    if (!now.length) return;
    const prev = Array.isArray(themes.readPartition().chunkFingerprint) ? themes.readPartition().chunkFingerprint : null;
    if (prev && prev.length) {
        const set = new Set(prev);
        const overlap = now.filter(n => set.has(n)).length;
        if (overlap / Math.max(now.length, prev.length) < 0.5) {
            logger.warn(`${site.name} 的构建已变化(分块文件重合不到一半),部分补丁可能失效`);
            alertSiteChange(site, `build:${now.slice(0, 3).join(",")}`);
        }
    }
    if (!prev || prev.join("\n") !== now.join("\n")) themes.writePartition().chunkFingerprint = now;
}

/**
 * 站点改版提示:同一原因(同一版本脚本 + 同一种变化)只提示一次,带"Report a problem"入口(配了 supportURL 时)。
 * 只在页面上提示,不上报任何东西。
 */
function alertSiteChange(site, reason) {
    const key = `${VERSION}|${reason}`;
    const part = themes.readPartition();
    if (part.siteChangeNotice === key) return;
    themes.writePartition().siteChangeNotice = key;
    notify({
        title: `${site.name} has changed`,
        body: `${SCRIPT_NAME} may not work fully on this version of the site until it is updated.${SUPPORT_URL ? " Click to report it." : ""}`,
        type: "warning",
        duration: 15000,
        onClick: SUPPORT_URL ? () => reportIssue() : undefined,
    });
}

// 插件运行期出错太多被停掉时提示一次;点开插件设置可以看最近的错误
onPluginTripped((name, s) => notify({
    title: `${name} was turned off`,
    body: `It kept failing on this page (${s.recent.length} errors in a short time). It will start again when you reload. Last error: ${s.last?.message ?? "unknown"}`,
    type: "error",
    duration: 15000,
    plugin: name,
}));

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
        step("启动失败汇总", showFailureSummary);
    }, DEFAULT_READY_TIMEOUT);
}

// ---------- 补丁检查器(开发构建) ----------
/** 本脚本里所有插件的补丁(启用的和停用的)加上站点设置入口的补丁 */
function allPatchEntries() {
    const out = [];
    for (const p of Object.values(P.plugins)) {
        if (!Array.isArray(p.patches)) continue;
        const enabled = P.isPluginEnabled(p.name);
        p.patches.forEach((patch, index) => out.push({ plugin: p.name, index, patch, enabled }));
    }
    (Sites.getSite().settingsHost?.patches || []).forEach((patch, index) => out.push({ plugin: "Settings(settingsHost)", index, patch, enabled: true }));
    return out;
}

/**
 * 在页面里逐条测试本脚本的补丁和查找器:先取运行时注册表里的全部模块源码,
 * crawl 为真时再从源码里找出还没加载的懒加载分块,逐个取回、在隔离作用域里解析(不执行模块),一并测试。
 * 返回报告对象;log 为真时在控制台打印失败项。
 */
async function checkPatchesInPage({ crawl = true, limit = 3000, log = true } = {}) {
    const site = Sites.getSite();
    const sources = new Map();
    T.findInRegistry((src, id) => { sources.set(id, src); return false; });
    let crawlInfo = null;
    if (crawl && site.driver === "turbopack") {
        const chunkPath = site.driverOptions?.chunkPath || "/_next/static/chunks/";
        const prefix = chunkPath.replace(/static\/chunks\/?$/, "");
        const toPath = s => { try { const p = new URL(s, location.href).pathname; const i = p.indexOf("static/chunks/"); return i >= 0 ? p.slice(i) : null; } catch { return null; } };
        const loaded = [...document.querySelectorAll("script[src]")].map(s => toPath(s.src)).concat([...T.chunkPaths].map(toPath)).filter(Boolean);
        const seeds = new Set();
        for (const s of document.querySelectorAll("script:not([src])")) for (const p of extractChunkPaths(s.textContent)) seeds.add(p);
        const fetchFn = W.fetch.bind(W);
        crawlInfo = await crawlChunks({
            sources, seeds: [...seeds], loaded, limit,
            fetchText: async p => { const r = await fetchFn(new URL(prefix + p, location.origin).href, { credentials: "same-origin" }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); },
            evaluate: text => T.evaluateChunk(text),
        });
    }
    // 只检查语法:构造函数不会执行;页面禁止 eval 时(EvalError)跳过
    const syntaxCheck = code => { try { new Function(`return (${code}\n)`); return null; } catch (e) { return e instanceof SyntaxError ? e.message : null; } };
    const report = checkPatches(allPatchEntries(), sources, { syntaxCheck });
    report.crawl = crawlInfo;
    report.finders = failedFinders();
    report.validateMisses = T.checkOnlyMismatches.slice();
    if (log) {
        const s = report.summary;
        const head = `补丁检查:${s.modules} 个模块${crawlInfo ? `(新取 ${crawlInfo.chunks} 个分块${crawlInfo.failed.length ? `,${crawlInfo.failed.length} 个取不到` : ""})` : ""},${s.total} 条补丁,通过 ${s.ok},失败 ${s.failed},提示 ${s.warnings};解析为空的查找器 ${report.finders.length} 个`;
        const bad = report.results.filter(r => r.status !== "ok" || r.issues.length);
        if (bad.length || report.finders.length) {
            logger.warn(head);
            for (const r of bad) console.log(describeResult(r));
            if (report.finders.length) console.log(`解析为空的查找器:\n${report.finders.map(f => `    ${f.finder}${f.lazy ? "(懒)" : ""}`).join("\n")}`);
        } else logger.info(head);
    }
    return report;
}

// ---------- 接口分组 ----------
/**
 * 按用途分组的命名空间(U.webpack / U.dom / U.net / U.ui / U.settings / U.themes),和平铺的名字指向同一个实现。
 * 用取值函数转发到 api 上的同名项:开发构建给查找器包上的记录、站点 getter 都照常生效。平铺的名字保留,不弃用。
 */
const NAMESPACES = {
    webpack: ["filters", "find", "findAll", "findByProps", "findByCode", "findByDisplayName", "findComponentByCode", "findExportedComponent", "findStore",
        "findModuleId", "findModuleFactory", "mapMangledModule", "requireModule", "waitFor", "findCssClasses", "mapMangledCssClasses", "findBulk",
        "extractAndLoadChunks", "extractAndLoadChunksLazy", "DefaultChunkLoadRegex", "loadChunk", "importModule", "injectExports", "search", "onModuleLoad",
        "getAllStores", "isZustandStore", "findReact", "syncModuleCache", "moduleCacheVersion",
        "addPatch", "patches", "patchStats", "patchResults", "patchReport", "getPatchedCode", "onPatchBypassed", "registerInjectionFallback"],
    dom: ["waitForElement", "observe", "setAttr", "setText", "toggleClass", "setStyle", "mount", "unmount",
        "getFiber", "getProps", "walkFiberUp", "findFiberProps", "addRenderHook", "asArray", "treeHas", "onRouteChange"],
    net: ["onRequest", "onResponse", "rewriteRequest", "rewriteResponse", "onWebSocket", "onEventSource", "makeResponse", "fetchExternal"],
    ui: ["react", "components", "icons", "openModal", "closeModal", "closeAllModals", "ensureUiRoot", "showToast", "dismissToast", "ToastType",
        "showNotice", "closeNotice", "notify", "getNotificationHistory", "theme", "highlightCss", "createExternalStore", "createSelectionStore",
        "useExternalStore", "useFiltered", "useAsyncAction", "ErrorBoundary", "openPalette", "closePalette", "renderSlot", "SlotOutlet"],
    settings: ["Settings", "PlainSettings", "SettingsStore", "openSettings", "openSettingsPanel", "closeSettingsPanel", "openPluginSettings",
        "settingsPages", "registerSettingsPage", "exportSettings", "importSettings", "previewImport", "undoImport", "lastImport", "parseBackup", "exportData", "importData", "DataStore"],
    themes: ["getThemes", "addTheme", "addLocalTheme", "updateLocalTheme", "removeTheme", "enableTheme", "disableTheme", "setThemeAllSites",
        "isThemesEnabled", "setThemesEnabled", "isOnlineThemesEnabled", "setOnlineThemesEnabled", "getQuickCss", "setQuickCss",
        "registerStyle", "enableStyle", "disableStyle", "unregisterStyle"],
};
// 懒查找器的短名字:U.webpack.lazy.byProps(...) 等同 U.findByPropsLazy(...)
const LAZY_NAMES = {
    find: "findLazy", byProps: "findByPropsLazy", byCode: "findByCodeLazy", byDisplayName: "findByDisplayNameLazy",
    componentByCode: "findComponentByCodeLazy", exportedComponent: "findExportedComponentLazy", store: "findStoreLazy",
    cssClasses: "findCssClassesLazy", mapMangledModule: "mapMangledModuleLazy",
};
function forwardTo(api, map, extra = {}) {
    const o = { ...extra };
    for (const [k, name] of Object.entries(map)) {
        if (!(name in api)) continue;
        Object.defineProperty(o, k, { get: () => api[name], enumerable: true });
    }
    return Object.freeze(o);
}
function installNamespaces(api) {
    for (const [ns, names] of Object.entries(NAMESPACES)) {
        if (ns in api) { logger.warn(`接口分组 ${ns} 和已有名字冲突,跳过`); continue; }
        const map = Object.fromEntries(names.map(n => [n, n]));
        // 转发对象是冻结的,lazy 在冻结前加上
        if (ns === "webpack") api[ns] = forwardTo(api, map, { lazy: forwardTo(api, LAZY_NAMES) });
        else api[ns] = forwardTo(api, map);
    }
}

// ---------- 定义收集 ----------
/** 构建产物里的定义可以是对象,也可以是接收公开接口的工厂函数 U => 定义 */
const materialize = (entry, api) => (typeof entry === "function" ? entry(api) : entry);

function main() {
    // ---------- 守卫 ----------
    if (W.top !== W.self) return;
    // 只防同一条脚本重复运行;别的基于框架的脚本各有自己的实例,互不让位
    if (W[INSTANCE_KEY]) { console.info(`[${SCRIPT_NAME}] 本脚本已在运行,跳过重复注入`); return; }
    step("安全模式判定", beginBoot);

    let resolveReady;
    const onceReady = new Promise(r => { resolveReady = r; });
    let siteReadyDone = false;

    const api = {
        version: VERSION,
        frameworkVersion: FRAMEWORK_VERSION,
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
            if (!__USPP_DEV__) { logger.warn("registerSite 只在开发构建里可用"); return false; }
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
        pluginPhase: P.pluginPhase,
        reloadNeeded: () => [...P.pendingReload],
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
        get settingsPages() { return getSettingsPages(); },
        registerSettingsPage: def => ownByCurrent(registerSettingsPage(def)),
        exportSettings, importSettings, previewImport, undoImport, lastImport, parseBackup, exportData, importData,
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
        mapMangledModule: F.mapMangledModule, mapMangledModuleLazy: F.mapMangledModuleLazy, requireModule: F.requireModule, waitFor: F.waitFor,
        findCssClasses: F.findCssClasses, findCssClassesLazy: F.findCssClassesLazy, mapMangledCssClasses: F.mapMangledCssClasses, findBulk: F.findBulk,
        extractAndLoadChunks: F.extractAndLoadChunks, extractAndLoadChunksLazy: F.extractAndLoadChunksLazy, DefaultChunkLoadRegex: F.DefaultChunkLoadRegex,
        loadChunk: F.loadChunk, importModule: F.importModule, injectExports: T.injectExports,
        search: F.search, onModuleLoad: T.onModuleLoad, onceReady, getAllStores: F.getAllStores,
        isZustandStore: F.isZustandStore, findReact: F.getReact,
        // 被其他脚本包装执行的模块只在运行时缓存里:并入本系统的缓存;版本号在缓存变化时递增
        syncModuleCache: () => { try { T.syncRuntimeCache(); } catch { /* 无打包器 */ } }, moduleCacheVersion: T.getCacheVersion,
        // DOM / fiber / JSX
        waitForElement: dom.waitForElement, observe: (sel, opts) => ownByCurrent(dom.observe(sel, opts)),
        setAttr: dom.setAttr, setText: dom.setText, toggleClass: dom.toggleClass, setStyle: dom.setStyle, mount: dom.mount, unmount: dom.unmount,
        getFiber, getProps, walkFiberUp, findFiberProps,
        addRenderHook: (type, fn) => ownByCurrent(addRenderHook(type, fn)), asArray, treeHas,
        // 方法补丁器
        patchMethod: (obj, name, hooks) => ownByCurrent(patchMethod(obj, name, hooks)), isPatched,
        // 路由 / 网络
        onRouteChange: fn => ownByCurrent(onRouteChange(fn)),
        onRequest: (m, fn) => ownByCurrent(onRequest(m, fn)), onResponse: (m, fn) => ownByCurrent(onResponse(m, fn)),
        rewriteRequest: (m, fn) => ownByCurrent(rewriteRequest(m, fn)), rewriteResponse: (m, fn) => ownByCurrent(rewriteResponse(m, fn)),
        onWebSocket: (m, hooks) => ownByCurrent(onWebSocket(m, hooks)), onEventSource: (m, hooks) => ownByCurrent(onEventSource(m, hooks)),
        makeResponse,
        // 插件数据
        DataStore: { for: dataStoreFor },
        // 注入点
        addSlotItem, removeSlotItem, getSlotItems, onSlotChange: (slot, fn) => ownByCurrent(onSlotChange(slot, fn)), getSlotVersion,
        renderSlot, SlotOutlet, applyMenuPatches,
        // 拦截器
        addInterceptor: (name, fn, opts) => ownByCurrent(addInterceptor(name, fn, opts)), runInterceptors, hasInterceptors,
        // 命令、搜索栏、快捷键
        registerCommand: def => ownByCurrent(registerCommand(def)), runCommand, getCommands, keyFor, openPalette, closePalette,
        // 安全模式、诊断
        isSafeMode, reloadInSafeMode, exitSafeMode, collectDiagnostics, copyDiagnostics, pluginErrorStats, openFailedPlugins: openFailedList,
        // 更新
        checkForUpdate, installUpdate, openChangelog, changelog: CHANGELOG,
        // 界面
        react: {
            h: R.h, Fragment: R.Fragment, getReact: R.getReact, getRenderer: R.getRenderer, usingSiteRenderer: R.usingSiteRenderer,
            useState: R.useState, useEffect: R.useEffect, useLayoutEffect: R.useLayoutEffect, useMemo: R.useMemo, useRef: R.useRef,
            useCallback: R.useCallback, useReducer: R.useReducer, useContext: R.useContext, useId: R.useId,
            useSyncExternalStore: R.useSyncExternalStore, useForceUpdate: R.useForceUpdate, useSubscription: R.useSubscription,
        },
        components: { ...C, ...Kit, ModalCard, confirmDialog, SlotOutlet },
        highlightCss, createExternalStore, createSelectionStore, useExternalStore: Kit.useExternalStore, useFiltered: Kit.useFiltered, useAsyncAction: Kit.useAsyncAction,
        icons,
        openModal, closeModal, closeAllModals, ensureUiRoot: () => (diag.noEarlyUiRoot ? trace("uiRoot.early.skipped") : ensureRoot()),
        showToast, dismissToast, ToastType, showNotice, closeNotice, notify, getNotificationHistory,
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
        subscribe: (ev, fn) => ownByCurrent(subscribe(ev, fn)), dispatch, Events,
        // 工具
        Logger, ErrorBoundary: R.ErrorBoundary, makeLazy, proxyLazy, fetchExternal,
        copyToClipboard: utils.copyToClipboard, debounce: utils.debounce, sleep: utils.sleep, onlyOnce: utils.onlyOnce,
        escapeRegExp: utils.escapeRegExp, humanizeKey: utils.humanizeKey,
        matchesUrl, matchPattern, isChromium,
        countIdleMutations,
    };
    if (__USPP_DEV__) {
        // 补丁 / 查找器检查器(开发构建);命令行版本见 scripts/check-patches.mjs
        api.checkPatches = checkPatchesInPage;
        api.failedFinders = failedFinders;
        // 热重载用;控制台里也可以手动 U.replacePlugin(新定义)
        api.replacePlugin = P.replacePlugin;
        trackFinders(api, ["find", "findAll", "findByProps", "findByCode", "findByDisplayName", "findComponentByCode", "findExportedComponent", "findStore",
            "findModuleId", "findModuleFactory", "mapMangledModule", "findCssClasses", "findLazy", "findByPropsLazy", "findByCodeLazy", "findByDisplayNameLazy",
            "findComponentByCodeLazy", "findExportedComponentLazy", "findStoreLazy", "findCssClassesLazy", "mapMangledModuleLazy"]);
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
    installNamespaces(api);
    // 页面上只挂页面桥(补丁用的门面和编译槽),完整接口 api 不出闭包
    setPluginResolver(name => P.plugins[name] ?? null);
    setSelfTarget("settingsHost", () => Sites.getSite().settingsHost ?? null);
    installBridge(W, api);
    // 控制台调试入口:挂到本脚本自己配置的名字上;已被占用时不覆盖
    if (GLOBAL_NAME) {
        if (GLOBAL_NAME in W) logger.warn(`全局名字 ${GLOBAL_NAME} 已被占用,未挂调试入口`);
        else Object.defineProperty(W, GLOBAL_NAME, { value: api, writable: false, configurable: true, enumerable: false });
    }

    // ---------- 同步阶段 ----------
    const syncLoaded = step("同步读取设置", loadSync);
    step("注册核心插件", () => P.addPlugin(SettingsPlugin));
    setSettingsOpener(() => openSettings());
    setPaletteOpener((name, key) => { openSettingsPanel({ tab: "plugins" }); openPluginSettings(name, key); });
    setPatchSummary(() => { const r = T.patchReport(); return r?.stats ? { ...r.stats, orphaned: r.orphaned?.length ?? 0 } : null; });

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
    step("站点拦截器", () => setSiteInterceptors(site.interceptors));
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

    // 补丁只在模块第一次加载时生效:按同步读到的设置(读不到时用启动快照)一次定下,之后不再补登记
    function registerPatchesOnce() {
        if (!syncLoaded) step("读取启动快照", applyBootSnapshot);
        P.registerPatches();
    }
    // 页面接入工具:只有当前站点声明了打包器驱动才拦截
    if (site.driver === "turbopack") {
        F.setChunkPrefix(site.driverOptions?.chunkPath);
        step("登记补丁", registerPatchesOnce);
        if (diag.noHostPatches) trace("hostPatches.skipped");
        else step("登记站点设置入口补丁", registerHostPatches);
        if (diag.noTurbopack) trace("turbopack.skipped");
        else {
            step("安装打包器拦截", T.installInterceptor);
            step("监视打包器", () => T.watchInstrumentation(20000));
        }
    } else if (site.driver === "webpack") {
        step("登记补丁", registerPatchesOnce);
        if (diag.noHostPatches) trace("hostPatches.skipped");
        else step("登记站点设置入口补丁", registerHostPatches);
        // 构建里没有 webpack 站点时 __USPP_WEBPACK__ 为 false,webpack 驱动整个不打进脚本
        if (__USPP_WEBPACK__) step("安装打包器拦截", () => installWebpack(site.driverOptions || {}));
    } else if (site.driver) {
        logger.warn(`不支持的打包器驱动:${site.driver}`);
    }
    logger.info(`${SCRIPT_NAME} ${VERSION}(${BUILD_TYPE}),脚本 ID ${SCRIPT_ID},当前站点 ${site.id},已注册 ${Object.keys(P.plugins).length} 个插件`);

    // ---------- 异步阶段 ----------
    (async () => {
        try { await loadAsync(); } catch (e) { logger.error("读取设置失败", e); }
        step("安装卸载保存", installUnloadSave);
        step("多标签页同步", installCrossTabSync);
        // 本次构建里没有的插件:超过 90 天没出现才删设置和数据
        const keepData = step("清理旧设置", () => P.cleanStaleSettings());
        // 清理设置出错时不动插件数据
        if (keepData) step("清理旧插件数据", () => { pruneData(keepData); });
        step("快捷键", installKeybinds);
        // --hot 构建:连本机构建服务,改一个插件时原地替换
        if (__USPP_DEV__ && HOT_URL) step("热重载", () => startHotClient(HOT_URL, {
            onPlugin(ev) {
                if (!P.plugins[ev.name]) { notify({ title: "Hot reload", body: `${ev.name} is new: reinstall the dev build to load it.`, type: "info" }); return; }
                const def = evalPluginChunk(ev.code, api, ev.name);
                if (ev.dev) def.dev = true;
                if (ev.chromium) def.chromiumOnly = true;
                def.site ??= ev.site;
                const r = P.replacePlugin(def);
                trace("hot.replace", ev.name, r);
                if (r.reason === "patches") notify({ title: "Hot reload", body: `${ev.name} has bundler patches: reinstall the dev build and reload.`, type: "warning" });
                else if (!r.ok) showToast(`${ev.name} failed to restart: ${r.error?.message ?? r.reason}`, ToastType.ERROR);
                else showToast(`Reloaded ${ev.name}`, ToastType.SUCCESS);
            },
            onFull(reason) {
                notify({ title: "Dev build rebuilt", body: `Reinstall the dev build and reload the page${reason ? ` (${reason})` : ""}.`, type: "info" });
            },
        }));
        step("记录插件", P.recordKnownPlugins);
        step("强制依赖", P.enforceDependencies);
        if (site.driver === "turbopack" || site.driver === "webpack") step("核对补丁计划", () => {
            const changed = P.checkPatchPlan();
            if (!changed.length) return;
            dispatch(Events.RELOAD_NEEDED, { reason: "patches", plugins: changed });
            notify({ title: "Reload to apply", body: `Settings for ${changed.join(", ")} differ from what this page started with; reload the page to apply them.`, type: "info" });
        });
        step("启动 Init 插件", () => P.startAllAt(P.StartAt.Init));

        const onDom = () => {
            step("启动 DOMContentLoaded 插件", () => P.startAllAt(P.StartAt.DOMContentLoaded));
            // 安全模式提示不等站点就绪(页面坏掉时站点可能永远就绪不了)
            if (isSafeMode()) step("安全模式提示", showSafeModeNotice);
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
        if (s.driver) step("扫描模块缓存", T.rescanRuntimeCache);
        step("onceReady", () => resolveReady());
        dispatch(Events.SITE_READY, { site: s.id });
        const failed = step("启动 SiteReady 插件", () => P.startAllAt(P.StartAt.SiteReady)) || [];
        if (failed.length) retryFailed(failed);
        else setTimeout(() => step("启动失败汇总", showFailureSummary), 0);
        step("启动完成", () => markBootHealthy());
        if (s.driver) {
            logger.info(`站点已就绪,已加载 ${T.moduleCache.size} 个模块`);
            // 共存时部分模块不经本系统的包装执行,定期并入运行时缓存
            setInterval(() => { try { T.syncRuntimeCache(); } catch { /* 忽略 */ } }, 2000);
            setTimeout(() => step("补丁健康报告", () => { if (T.logHealthReport()?.siteChanged) alertSiteChange(s, "patches"); }), 5000);
            if (__USPP_DEV__) setTimeout(() => step("查找器报告", () => {
                const bad = failedFinders();
                if (bad.length) logger.debug(`${bad.length} 个查找器解析为空(站点改版时最先失效):`, bad.map(f => f.finder));
            }), 8000);
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
        setSiteInterceptors(stored.interceptors);
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
