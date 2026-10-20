// 把框架设置嵌进 Grok:设置对话框里的 "Userscript++" 分组,头像菜单里的 "Userscript++" 子菜单
import { U, h, Fragment, ErrorBoundary, useSubscription } from "./u.js";
import { common, whenCommon } from "./common.js";

const GROUP_ID = "uspp";
const GROUP_LABEL = "Userscript++";
const PLUGINS_TIP = "Toggle features. Some need a reload. Click the sliders icon to configure.";
const ENTRY_PATH = "plugins.Settings.showSiteEntry";

let logger = null;
const log = () => (logger ??= new U.Logger("GrokSettings", "#a5b4fc"));
const pages = () => U.settingsPages;
const pageById = id => pages().find(p => p.id === id);
const pageId = key => (pages().find(p => p.key === key || p.id === key) || pages()[0]).id;
const entryShown = () => U.PlainSettings.plugins.Settings?.showSiteEntry !== false;

function PluginsLabel() {
    const { Tooltip } = U.components;
    return h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, "Plugins",
        h(Tooltip, { content: PLUGINS_TIP }, h("span", { className: "uspp-tip", "aria-label": PLUGINS_TIP, style: { display: "inline-flex", opacity: 0.7 } }, h(U.icons.InfoIcon, { size: 3.5 }))));
}

// Grok 的标签图标以 size(4px 为单位)传入
const tabIcon = Icon => ({ size = 4 }) => h(Icon, { size });
let entries = null;
const registryEntries = () => entries ??= pages().map(p => ({
    id: p.id,
    group: GROUP_ID,
    icon: tabIcon(p.icon),
    // 团队设置界面里不显示
    visible: ctx => !ctx?.isTeamSettingsSession && entryShown(),
    component: p.component,
}));

function navGroups(groups) {
    const list = Array.isArray(groups) ? groups : [];
    return list.includes(GROUP_ID) ? list : [...list, GROUP_ID];
}
function tabRegistry(reg) {
    const list = Array.isArray(reg) ? reg : [];
    const ids = new Set(pages().map(p => p.id));
    return [...list.filter(t => !ids.has(t?.id)), ...registryEntries()];
}
function tabLabel(tab) {
    const p = tab && pageById(tab.id);
    if (!p) return null;
    return p.key === "plugins" ? h(PluginsLabel) : p.label;
}

// ---------- 打开 ----------
/** 打开 Grok 设置对话框并切到指定标签 */
function openSettingsTab(tabId) {
    const store = common.SettingsDialogStore;
    if (!store) return false;
    const st = store.getState();
    try {
        if (typeof st.openTab === "function") st.openTab(tabId);
        else { st.setTab?.(tabId); st.setOpen?.(true); }
        return true;
    } catch (e) {
        log().error("打开设置失败", e);
        return false;
    }
}

/** 等 Grok 设置对话框出现后再打开插件设置弹窗,让它叠在对话框之上 */
function openPluginOverSettings(plugin) {
    const started = Date.now();
    const tick = () => {
        const dlg = document.querySelector('[role="dialog"][data-state="open"]');
        if (dlg || Date.now() - started > 1500) U.openPluginSettings(plugin);
        else setTimeout(tick, 50);
    };
    setTimeout(tick, 30);
}

function open({ tab, plugin } = {}) {
    if (!openSettingsTab(pageId(plugin ? "plugins" : (tab || "plugins")))) return false;
    if (plugin) openPluginOverSettings(plugin);
    return true;
}
const isOpen = () => !!document.querySelector('[role="dialog"] [data-uspp-page]');

// ---------- 头像菜单 ----------
const pluginsWithSettings = () => Object.values(U.plugins)
    .filter(p => !p.hidden && !(p.chromiumOnly && !U.isChromium()) && U.getVisibleSettings(p).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

const subscribeMenu = fn => {
    const off = U.subscribe(U.Events.PLUGIN_TOGGLE, fn);
    U.SettingsStore.addChangeListener(ENTRY_PATH, fn);
    return () => { off(); U.SettingsStore.removeChangeListener?.(ENTRY_PATH, fn); };
};

function AvatarMenu() {
    useSubscription(subscribeMenu);
    const { DropdownMenuSub: Sub, DropdownMenuSubTrigger: Trigger, DropdownMenuSubContent: Content, DropdownMenuItem: Item } = common;
    if (!entryShown() || !Sub || !Trigger || !Content || !Item) return null;
    const { icons } = U;
    const icon = (I, el) => h("span", { className: "inline-flex me-2 text-fg-secondary" }, el ?? h(I, { size: 4 }));
    const list = pluginsWithSettings();
    const pageItem = key => {
        const p = pages().find(x => x.key === key);
        return p && h(Item, { key, onClick: () => open({ tab: key }), "data-uspp-menu": key.toLowerCase() }, icon(p.icon), p.label);
    };
    return h(Sub, { "data-uspp-avatar-menu": "" },
        h(Trigger, { "data-uspp-menu": "root" }, icon(icons.LogoIcon), GROUP_LABEL),
        h(Content, null,
            list.length > 0 && h(Sub, null,
                h(Trigger, { "data-uspp-menu": "plugins" }, icon(icons.PuzzleIcon), "Plugins"),
                // 插件多时在菜单内部滚动,不带动页面
                h(Content, { "data-uspp-menu-list": "plugins", style: { maxHeight: "min(60vh, 420px)", overflowY: "auto", overscrollBehavior: "contain" } }, list.map(p => h(Item, { key: p.name, onClick: () => open({ plugin: p }), "data-uspp-menu-plugin": p.name },
                    icon(null, h(ErrorBoundary, { fallback: h(icons.PlugIcon, { size: 4 }) }, h(p.icon || icons.PlugIcon, { size: 4 }))), p.name)))),
            pageItem("themes"),
            pageItem("quickCss"),
            pageItem("backup")));
}

function renderAvatarMenu() {
    return h(ErrorBoundary, { key: "uspp-avatar-menu", fallback: null, label: "avatar-menu" }, h(AvatarMenu));
}

// ---------- 兜底(补丁被其他脚本绕过时) ----------
const fallbacks = new Set();
function whenModule(keys, fn) {
    const m = U.findByProps(...keys);
    if (m) fn(m); else U.waitFor(x => keys.every(k => x && k in x), fn);
}
function hookExport(name, fn) {
    const C = U.findExportedComponent(name);
    if (C) fn(C); else U.waitFor(m => typeof m[name] === "function" || (m[name] && typeof m[name] === "object"), m => fn(m[name]));
}

function enableFallback(kind) {
    if (fallbacks.has(kind)) return;
    fallbacks.add(kind);
    if (kind === "registry") {
        whenModule(["NAV_GROUPS", "TAB_REGISTRY"], m => {
            try {
                const groups = m.NAV_GROUPS, reg = m.TAB_REGISTRY;
                if (Array.isArray(groups) && !groups.includes(GROUP_ID)) groups.push(GROUP_ID);
                if (Array.isArray(reg)) for (const e of registryEntries()) if (!reg.some(x => x?.id === e.id)) reg.push(e);
            } catch (e) { log().error("兜底注册设置标签失败", e); }
        });
        U.registerInjectionFallback("Settings", "设置标签注册");
    } else if (kind === "labels") {
        // 标签名:Grok 找不到标签名时直接显示 id,把这段文字换掉
        const ids = new Set(pages().map(p => p.id));
        const swap = (props, key, render) => {
            const c = props.children;
            if (typeof c === "string" && ids.has(c)) return render({ ...props, children: tabLabel({ id: c }) });
            if (Array.isArray(c) && c.some(x => typeof x === "string" && ids.has(x)))
                return render({ ...props, children: c.map(x => typeof x === "string" && ids.has(x) ? h(Fragment, { key: x }, tabLabel({ id: x })) : x) });
        };
        for (const tag of ["span", "div", "p", "h1", "h2", "h3"]) U.addRenderHook(tag, swap);
        hookExport("SettingsContainer", C => U.addRenderHook(C, (props, key, render) => {
            if (typeof props.title === "string" && ids.has(props.title)) return render({ ...props, title: pageById(props.title).label });
        }));
        // 分组名:未知分组的标题为空
        whenModule(["navGroupLabelStyle"], K => U.addRenderHook("div", (props, key, render) => {
            if (props.className === K.navGroupLabelStyle && props.children == null) return render({ ...props, children: GROUP_LABEL });
        }));
        U.registerInjectionFallback("Settings", "设置标签名");
    } else if (kind === "avatar") {
        hookExport("SupportIcon", Support => whenCommon(["DropdownMenuSub", "DropdownMenuSubTrigger"], SubC => {
            U.addRenderHook(SubC, (props, key, render) => {
                if (props["data-uspp-avatar-menu"] != null) return;
                const first = U.asArray(props.children)[0];
                if (!first || first.type !== common.DropdownMenuSubTrigger || !U.treeHas(first.props?.children, el => el.type === Support, 3)) return;
                return h(Fragment, { key }, renderAvatarMenu(), render());
            });
        }));
        U.registerInjectionFallback("Settings", "头像菜单");
    }
}

/** 站点启动时调用:补丁被绕过时启用对应兜底 */
export function installSettingsFallbacks() {
    U.onPatchBypassed("Settings", results => {
        for (const r of results) {
            if (r.find.includes("TAB_REGISTRY")) enableFallback("registry");
            else if (r.find.includes("settings-nav-group")) enableFallback("labels");
            else if (r.find.includes("user-dropdown.help")) enableFallback("avatar");
        }
    });
}

export const settingsHost = {
    open,
    isOpen,
    // 补丁记在核心 Settings 插件名下,$self 指向本对象
    patches: [
        {
            // 设置标签注册表:追加分组和框架的设置页
            find: '"TAB_REGISTRY",0,',
            replacement: {
                match: /"NAV_GROUPS",0,(\[[^\]]*\]),"TAB_REGISTRY",0,(\i)\]/,
                replace: '"NAV_GROUPS",0,$self.navGroups($1),"TAB_REGISTRY",0,$self.tabRegistry($2)]',
            },
        },
        {
            // 设置对话框:分组名和标签名
            // 翻译词典模块里也有这些字符串,用第二个特征排除
            find: ['"settings-nav-group.general"', '"SettingsDialog:tabLabel"'],
            group: true,
            replacement: [
                {
                    match: /(\i=>\{switch\(\i\)\{)(case"general":return \i\("settings-nav-group\.general")/,
                    replace: '$1case"uspp":return"Userscript++";$2',
                },
                {
                    match: /default:(return\(0,\i\.logError\)\("SettingsDialog:tabLabel",`No label for settings tab \$\{(\i)\.id\}`\))/,
                    replace: "default:if($self.tabLabel($2))return $self.tabLabel($2);$1",
                },
            ],
        },
        {
            // 头像菜单:Help 之前插入子菜单
            find: ['"user-dropdown.help"', "DropdownMenuSubTrigger"],
            replacement: {
                match: /(\(0,\i\.jsxs\)\(\i\.DropdownMenuSub,\{children:\[\(0,\i\.jsxs\)\(\i\.DropdownMenuSubTrigger,\{ref:\i,children:\[[^\]]{0,400}?"user-dropdown\.help")/,
                replace: "$self.renderAvatarMenu(),$1",
            },
        },
    ],
    navGroups,
    tabRegistry,
    tabLabel,
    renderAvatarMenu,
    openSettingsTab,
};
