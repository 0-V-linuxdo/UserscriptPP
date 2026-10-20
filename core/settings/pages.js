// 框架设置的四页;站点的 settingsHost 可以把它们嵌进站点自己的设置界面
import { h, ErrorBoundary } from "../ui/react.js";
import { PuzzleIcon, PaletteIcon, CodeIcon, ArchiveIcon } from "../ui/icons.js";
import { PluginsTab } from "./PluginsTab.js";
import { ThemesTab } from "./ThemesTab.js";
import { QuickCssTab } from "./QuickCssTab.js";
import { BackupTab } from "./BackupTab.js";
import { TAB_IDS } from "./shared.js";

const page = (C, label) => {
    const P = () => h(ErrorBoundary, { fallback: h("div", { className: "uspp-page uspp-error" }, `${label} failed to render.`) }, h(C));
    P.displayName = `Uspp${label.replace(/\s/g, "")}Page`;
    return P;
};

export const SETTINGS_PAGES = Object.freeze([
    { id: TAB_IDS.plugins, key: "plugins", label: "Plugins", icon: PuzzleIcon, component: page(PluginsTab, "Plugins") },
    { id: TAB_IDS.themes, key: "themes", label: "Themes", icon: PaletteIcon, component: page(ThemesTab, "Themes") },
    { id: TAB_IDS.quickCss, key: "quickCss", label: "Quick CSS", icon: CodeIcon, component: page(QuickCssTab, "Quick CSS") },
    { id: TAB_IDS.backup, key: "backup", label: "Backup", icon: ArchiveIcon, component: page(BackupTab, "Backup") },
]);

export const pageByKey = key => SETTINGS_PAGES.find(p => p.key === key || p.id === key) || SETTINGS_PAGES[0];
