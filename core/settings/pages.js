// 框架设置面板的页:内置页 + 站点和插件登记的页(显示在内置页之后);站点的 settingsHost 可以把它们嵌进站点自己的设置界面
import { h, ErrorBoundary } from "../ui/react.js";
import { PuzzleIcon, PaletteIcon, CodeIcon, ArchiveIcon, KeyboardIcon, BellIcon, SlidersIcon, ReloadIcon } from "../ui/icons.js";
import { PluginsTab } from "./PluginsTab.js";
import { ThemesTab } from "./ThemesTab.js";
import { QuickCssTab } from "./QuickCssTab.js";
import { BackupTab } from "./BackupTab.js";
import { KeybindsTab } from "./KeybindsTab.js";
import { NotificationsTab } from "./NotificationsTab.js";
import { UpdatesTab } from "./UpdatesTab.js";
import { TAB_IDS } from "./shared.js";
import { getRegisteredPages, subscribeSettingsPages } from "../lib/settings-pages.js";

const page = (C, label) => {
    const P = () => h(ErrorBoundary, { fallback: h("div", { className: "uspp-page uspp-error" }, `${label} failed to render.`) }, h(C));
    P.displayName = `Uspp${label.replace(/\s/g, "")}Page`;
    return P;
};

export const BUILTIN_PAGES = Object.freeze([
    { id: TAB_IDS.plugins, key: "plugins", label: "Plugins", icon: PuzzleIcon, component: page(PluginsTab, "Plugins") },
    { id: TAB_IDS.themes, key: "themes", label: "Themes", icon: PaletteIcon, component: page(ThemesTab, "Themes") },
    { id: TAB_IDS.quickCss, key: "quickCss", label: "Quick CSS", icon: CodeIcon, component: page(QuickCssTab, "Quick CSS") },
    { id: TAB_IDS.keybinds, key: "keybinds", label: "Keybinds", icon: KeyboardIcon, component: page(KeybindsTab, "Keybinds") },
    { id: TAB_IDS.notifications, key: "notifications", label: "Notifications", icon: BellIcon, component: page(NotificationsTab, "Notifications") },
    { id: TAB_IDS.updates, key: "updates", label: "Updates", icon: ReloadIcon, component: page(UpdatesTab, "Updates") },
    { id: TAB_IDS.backup, key: "backup", label: "Backup", icon: ArchiveIcon, component: page(BackupTab, "Backup") },
]);

const wrapped = new WeakMap();
const customPage = def => {
    let C = wrapped.get(def);
    if (!C) {
        const Inner = def.component;
        C = () => h("div", { className: "uspp-page", "data-uspp-page": def.key }, h(ErrorBoundary, { fallback: h("div", { className: "uspp-error" }, `${def.label} failed to render.`) }, h(Inner)));
        C.displayName = `UsppCustomPage_${def.key}`;
        wrapped.set(def, C);
    }
    return { id: def.id, key: def.key, label: def.label, icon: def.icon || SlidersIcon, component: C, custom: true, plugin: def.plugin };
};

/** 当前全部页(内置页在前) */
export const getSettingsPages = () => [...BUILTIN_PAGES, ...getRegisteredPages().map(customPage)];
export { subscribeSettingsPages };
/** 旧名:内置页 */
export const SETTINGS_PAGES = BUILTIN_PAGES;

export const pageByKey = key => getSettingsPages().find(p => p.key === key || p.id === key) || BUILTIN_PAGES[0];
