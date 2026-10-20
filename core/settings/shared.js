// Settings 插件内部共用的小工具
import { Settings, PlainSettings } from "../lib/settings.js";

export const TAB_IDS = { plugins: "uspp_plugins_tab", themes: "uspp_themes_tab", quickCss: "uspp_quickcss_tab", backup: "uspp_backup_tab" };

export const sys = () => Settings.plugins.Settings;
export const sysPlain = () => PlainSettings.plugins.Settings ??= {};

export function listSetting(key) {
    const v = sysPlain()[key];
    return Array.isArray(v) ? v.slice() : [];
}
