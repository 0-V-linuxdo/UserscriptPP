// 核心插件 Settings:框架设置面板、菜单命令入口、主题与 Quick CSS 的加载、系统数据承载
import { definePlugin, definePluginSettings, OptionType, migratePluginSetting } from "../lib/plugins.js";
import { SettingsStore } from "../lib/settings.js";
import { applyAllThemes, applyQuickCss, isThemesEnabled, migrateLegacyLayout, SITES_PATH } from "../lib/themes.js";
import { getSite } from "../lib/sites.js";
import { addSlotItem, removeSlotItem } from "../lib/slots.js";

const NAME = "Settings";
export const MENU_COMMAND_ID = "uspp-settings";

const settings = definePluginSettings({
    showSiteEntry: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show the Userscript++ entry in this site's own menus and settings.",
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
});

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

    start() {
        migratePluginSetting(NAME, "showSiteEntry", "showMenu");
        migrateLegacyLayout();
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
        addSlotItem("menuCommand", MENU_COMMAND_ID, { label: "Userscript++ settings", order: -1000, onSelect: () => openSettings() });
    },
    stop() {
        if (this._apply) for (const k of [SITES_PATH, "plugins.Settings.themesEnabled", "plugins.Settings.onlineThemesEnabled"]) SettingsStore.removePrefixChangeListener(k, this._apply);
        removeSlotItem("menuCommand", MENU_COMMAND_ID);
    },
});
