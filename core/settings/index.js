// 核心插件 Settings:框架设置面板、菜单命令入口、主题与 Quick CSS 的加载、系统数据承载
import { SCRIPT_NAME, SUPPORT_URL, W, GM } from "../env.js";
import { SlidersIcon } from "../ui/icons.js";
import { definePlugin, definePluginSettings, OptionType, migratePluginSetting } from "../lib/plugins.js";
import { SettingsStore } from "../lib/settings.js";
import { applyAllThemes, applyQuickCss, isThemesEnabled, SITES_PATH } from "../lib/themes.js";
import { getSite } from "../lib/sites.js";
import { addSlotItem, removeSlotItem } from "../lib/slots.js";
import { setDebugLogs } from "../lib/logger.js";
import { isSafeMode, reloadInSafeMode } from "../lib/safemode.js";
import { collectDiagnostics, reportIssueTarget } from "../lib/diagnostics.js";
import { copyToClipboard } from "../lib/utils.js";
import { showToast } from "../ui/toast.js";
import { openPalette } from "./Palette.js";
import { notify } from "../ui/notify.js";
import { canUpdate, checkForUpdate, installUpdate, noteRunningVersion, maybeAutoCheck } from "../lib/updater.js";
import { openChangelog } from "./UpdatesTab.js";
import { canUndoImport, lastImport } from "../lib/backup.js";
import { runUndoImport } from "./BackupTab.js";

const NAME = "Settings";
export const MENU_COMMAND_ID = "uspp-settings";
const MENU_SEARCH_ID = "uspp-search", MENU_SAFE_ID = "uspp-safe-reload";

/** 报告问题:打开 supportURL(GitHub 仓库时直接是填好诊断信息的新建 Issue 页);只打开页面,不上传任何东西 */
export async function reportIssue() {
    if (!SUPPORT_URL) return false;
    const text = collectDiagnostics();
    const target = reportIssueTarget(SUPPORT_URL, text);
    if (target.copied) {
        const ok = await copyToClipboard(text);
        if (ok !== false) showToast(target.truncated ? "Full diagnostic info copied: paste it into the issue." : "Diagnostic info copied: paste it into your report.", "SUCCESS");
    }
    try { W.open(target.url, "_blank", "noopener"); } catch { return false; }
    return true;
}

export async function copyDiagnostics() {
    const ok = await copyToClipboard(collectDiagnostics());
    showToast(ok === false ? "Couldn't copy diagnostic info." : "Diagnostic info copied.", ok === false ? "ERROR" : "SUCCESS");
    return ok;
}

const settings = definePluginSettings({
    showSiteEntry: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show this script's entry in the site's own menus and settings.",
        // 只有声明了 settingsHost 的站点才有站点入口
        get hidden() { return !getSite().settingsHost; },
    },
    floatingPosition: {
        type: OptionType.SELECT,
        description: "Where floating buttons from plugins appear.",
        options: [
            { label: "Bottom right", value: "bottom-right", default: true },
            { label: "Bottom left", value: "bottom-left" },
            { label: "Top right", value: "top-right" },
            { label: "Top left", value: "top-left" },
        ],
    },
    debugLogs: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Print debug logs to the browser console (useful when reporting a problem).",
        onChange: v => setDebugLogs(v),
    },
});

/** 手动检查:结果用提示告诉用户 */
async function checkNow() {
    const r = await checkForUpdate();
    if (r?.error) showToast(`Couldn't check for updates: ${r.error}`, "ERROR");
    else if (r?.hasUpdate) announceUpdate(r);
    else showToast(`${SCRIPT_NAME} is up to date (v${r?.current}).`, "SUCCESS");
    return r;
}
const announceUpdate = r => notify({ title: `${SCRIPT_NAME} v${r.latest} is available`, body: `You have v${r.current}. Click to update.`, type: "info", duration: 15000, onClick: () => installUpdate() });

/** 启动后:版本变了就提示更新日志;到期就自动检查更新 */
function afterStart() {
    const changed = noteRunningVersion();
    if (changed) notify({
        title: `${SCRIPT_NAME} updated to v${changed.to}`,
        body: changed.entries.length ? `${changed.entries.flatMap(e => e.notes).slice(0, 2).join(" · ")}${changed.entries.flatMap(e => e.notes).length > 2 ? " …" : ""} — click for details.` : `Updated from v${changed.from}.`,
        type: "success", duration: 12000,
        onClick: changed.entries.length ? () => openChangelog({ entries: changed.entries, title: `What's new since v${changed.from}` }) : undefined,
    });
    maybeAutoCheck(announceUpdate).catch(() => { });
}

// 管理器没有菜单命令(例如 AdGuard)时,设置入口改放在页面角落的悬浮按钮区
const FLOATING_ENTRY_ID = "uspp.settingsEntry";
function addFloatingEntry() {
    if (GM.menu) return;
    addSlotItem("floating", FLOATING_ENTRY_ID, { label: `${SCRIPT_NAME} settings`, icon: SlidersIcon, order: -1000, onSelect: () => openSettings() });
}

let openSettings = () => { };
/** 由入口模块注入实际的打开函数(站点设置界面或框架面板) */
export function setSettingsOpener(fn) { openSettings = fn; }

export default definePlugin({
    name: NAME,
    description: "Userscript++ settings panel and menu command, and loads themes and Quick CSS.",
    authors: ["Userscript++"],
    required: true,
    site: "*",
    settings,
    commands: [
        { id: "uspp.palette", name: "Search commands, plugins and settings", keywords: ["palette", "find"], defaultKey: "Alt+Shift+P", run: () => openPalette() },
        { id: "uspp.settings", name: "Open settings", keywords: ["preferences", "options"], run: () => openSettings() },
        { id: "uspp.safeReload", name: "Reload in safe mode", description: "Reload with only required plugins, no themes and no Quick CSS.", keywords: ["crash", "broken"], run: () => reloadInSafeMode() },
        { id: "uspp.checkUpdates", name: "Check for updates", keywords: ["update", "version", "upgrade"], when: () => canUpdate(), run: () => checkNow() },
        { id: "uspp.changelog", name: "Show changelog", keywords: ["what's new", "release notes", "version"], run: () => openChangelog() },
        { id: "uspp.reportIssue", name: "Report a problem", description: "Open the issue page with diagnostic info filled in. Nothing is sent until you submit it.", keywords: ["bug", "issue", "support", "feedback"], when: () => !!SUPPORT_URL, run: () => reportIssue() },
        { id: "uspp.undoImport", name: "Undo last import", description: "Restore the settings you had before the last backup import.", keywords: ["backup", "restore", "revert"], when: () => canUndoImport(), run: () => runUndoImport() },
        { id: "uspp.diagnostics", name: "Copy diagnostic info", description: "Versions, enabled plugins, patch status and recent errors, for bug reports.", keywords: ["debug", "support", "report"], run: () => copyDiagnostics() },
    ],

    start() {
        migratePluginSetting(NAME, "showSiteEntry", "showMenu");
        setDebugLogs(settings.store.debugLogs);
        lastImport().catch(() => { }); // 预读,"Undo last import" 命令据此出现
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", afterStart, { once: true });
        else setTimeout(afterStart, 0);
        // 安全模式:不加载主题和 Quick CSS
        if (isSafeMode()) {
            addSlotItem("menuCommand", MENU_COMMAND_ID, { label: `${SCRIPT_NAME} settings`, order: -1000, onSelect: () => openSettings() });
            addSlotItem("menuCommand", MENU_SEARCH_ID, { label: `${SCRIPT_NAME}: search…`, order: -999, onSelect: () => openPalette() });
            addFloatingEntry();
            return;
        }
        applyQuickCss();
        if (isThemesEnabled()) applyAllThemes();
        // 分区数据(当前站点和"所有站点"主题)变化时重新应用,包括别的标签页同步过来的
        let queued = false;
        this._apply = () => {
            if (queued) return;
            queued = true;
            queueMicrotask(() => { queued = false; applyQuickCss(); applyAllThemes(); });
        };
        for (const k of [SITES_PATH, "plugins.Settings.themesEnabled", "plugins.Settings.onlineThemesEnabled"]) SettingsStore.addPrefixChangeListener(k, this._apply);
        addSlotItem("menuCommand", MENU_COMMAND_ID, { label: `${SCRIPT_NAME} settings`, order: -1000, onSelect: () => openSettings() });
        addSlotItem("menuCommand", MENU_SEARCH_ID, { label: `${SCRIPT_NAME}: search…`, order: -999, onSelect: () => openPalette() });
        addSlotItem("menuCommand", MENU_SAFE_ID, { label: `${SCRIPT_NAME}: reload in safe mode`, order: -998, onSelect: () => reloadInSafeMode() });
        addFloatingEntry();
    },
    stop() {
        if (this._apply) for (const k of [SITES_PATH, "plugins.Settings.themesEnabled", "plugins.Settings.onlineThemesEnabled"]) SettingsStore.removePrefixChangeListener(k, this._apply);
        for (const id of [MENU_COMMAND_ID, MENU_SEARCH_ID, MENU_SAFE_ID]) removeSlotItem("menuCommand", id);
        removeSlotItem("floating", FLOATING_ENTRY_ID);
    },
});
