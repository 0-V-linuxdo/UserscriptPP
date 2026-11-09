// Plugins 页(规格 8.2、8.3)
import { h, useState, useRef, useEffect, useForceUpdate, useSubscription, ErrorBoundary } from "../ui/react.js";
import { onPluginError, onPluginTripped, pluginErrorsOf } from "../lib/plugin-errors.js";
import { Switch, Select, Input, Button, Tooltip, IconButton } from "../ui/components.js";
import {
    plugins, isPluginEnabled, togglePlugin, needsRestart, getVisibleSettings, isEnabledAsDependency, pendingReload, dependentsOf,
} from "../lib/plugins.js";
import { Settings, SettingsStore } from "../lib/settings.js";
import { subscribe, dispatch, Events } from "../lib/events.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { isChromium, SCRIPT_NAME } from "../env.js";
import {
    PlugIcon, StarIcon, StarFillIcon, PinIcon, PinFillIcon, SlidersIcon, LockIcon, WarningIcon, ChromiumIcon, WrenchIcon, EyeIcon,
} from "../ui/icons.js";
import { PluginModal } from "./PluginModal.js";
import { hasPreview } from "./PluginPreview.js";
import { BaseCard } from "./BaseCard.js";
import { classes } from "../lib/utils.js";
import { getSlotItems, onSlotChange, slotValue } from "../lib/slots.js";
import { pluginSiteLabel } from "./site-label.js";

const SLOW_START_MS = 10;
import { sys, listSetting } from "./shared.js";

const TAGS = [
    ["composer", "Composer"], ["messages", "Messages"], ["chats", "Chats"], ["media", "Media"], ["navigation", "Navigation"],
    ["notifications", "Notifications"], ["appearance", "Appearance"], ["declutter", "Declutter"], ["privacy", "Privacy"], ["developer", "Developer"],
];
const DAY = 86400000;
// 脚本只含一个站点时不在卡片上标所属站点(规格 4.3)
const MULTI_SITE = (typeof __USPP_SITES__ !== "undefined" ? __USPP_SITES__ : []).length > 1;

function visiblePlugins() {
    return Object.values(plugins).filter(p => !p.hidden && !(p.chromiumOnly && !isChromium()));
}

function useLive() {
    const force = useForceUpdate();
    useEffect(() => {
        const offs = [Events.PLUGIN_TOGGLE, Events.PLUGIN_PIN, Events.PLUGIN_STAR].map(e => subscribe(e, () => force()));
        const fn = () => force();
        SettingsStore.addPrefixChangeListener("plugins.", fn);
        const offSlot = onSlotChange("settings.pluginActions", fn);
        return () => { offs.forEach(o => o()); offSlot(); SettingsStore.removePrefixChangeListener("plugins.", fn); };
    }, []);
}

/** 记录打开本页时的状态,决定是否需要提示刷新 */
function useReloadTracker() {
    const ref = useRef(null);
    if (!ref.current) {
        ref.current = {
            initial: Object.fromEntries(Object.keys(plugins).map(n => [n, isPluginEnabled(n)])),
            settings: new Map(), // "插件.键" -> 初始值
            dismissed: false,
        };
    }
    const [, setTick] = useState(0);
    const t = ref.current;
    const dirty = () => Object.values(plugins).some(p => needsRestart(p) && (t.initial[p.name] ?? false) !== isPluginEnabled(p.name))
        || [...t.settings].some(([k, init]) => { const [n, key] = k.split("."); return !Object.is(Settings.plugins[n]?.[key], init); });
    const prompt = async () => {
        setTick(x => x + 1);
        if (!dirty()) { t.dismissed = false; return; }
        dispatch(Events.RELOAD_NEEDED, null);
        if (t.dismissed) return;
        const ok = await confirmDialog({ title: "Reload required", body: "This plugin changes the site's code, so you need to reload the page.", confirmText: "Reload", cancelText: "Later" });
        if (ok) location.reload();
        else { t.dismissed = true; setTick(x => x + 1); }
    };
    return {
        get showBanner() { return t.dismissed && dirty(); },
        onToggled: p => { if (needsRestart(p)) prompt(); else setTick(x => x + 1); },
        onSettingRestart: (name, key, before) => {
            const k = `${name}.${key}`;
            if (!t.settings.has(k)) t.settings.set(k, before);
            prompt();
        },
    };
}

function Badges({ p }) {
    const out = [];
    const failed = !p.started && !!p.startError;
    const icon = (key, tip, Icon, cls) => h(Tooltip, { key, content: tip }, h("span", { className: classes("uspp-icon-badge", cls) }, h(Icon, { size: 3.5 })));
    if (failed) out.push(icon("fail", "This plugin failed to start", WarningIcon, "uspp-warn"));
    if (pendingReload.has(p.name)) out.push(icon("reload", "Its settings changed after this page started; reload the page to apply them", WarningIcon));
    if (p.required) out.push(icon("req", `This plugin is required for ${SCRIPT_NAME} to work`, LockIcon));
    if (p.dev) out.push(icon("dev", "Development build only", WrenchIcon));
    if (p.chromiumOnly) out.push(icon("chr", "Chromium only", ChromiumIcon));
    const seen = sys().knownPlugins?.[p.name];
    if (seen && Date.now() - seen < 2 * DAY) out.push(h("span", { key: "new", className: "uspp-badge" }, "New"));
    return out;
}

const subscribeErrors = fn => { const a = onPluginError(fn), b = onPluginTripped(fn); return () => { a(); b(); }; };

function PluginCard({ p, tracker }) {
    useSubscription(subscribeErrors);
    const errs = pluginErrorsOf(p.name);
    const enabled = isPluginEnabled(p.name);
    const starred = listSetting("starredPlugins").includes(p.name);
    const pinned = listSetting("pinnedPlugins").includes(p.name);
    const failed = !p.started && !!p.startError;
    const byDependency = isEnabledAsDependency(p.name);
    const onToggle = async () => {
        // 关掉一个别的插件还要用的插件:先问是否一起关(否则它会作为依赖继续运行)
        const needs = enabled && !byDependency && !p.tripped ? dependentsOf(p.name) : [];
        if (needs.length) {
            const ok = await confirmDialog({ title: `Turn off ${p.name}?`, body: `${needs.join(", ")} ${needs.length === 1 ? "needs" : "need"} it. Turn ${needs.length === 1 ? "it" : "them"} off too?`, confirmText: "Turn off all", danger: true });
            if (!ok) return;
            for (const n of needs) if (isPluginEnabled(n) && !isEnabledAsDependency(n)) { togglePlugin(n); tracker.onToggled(plugins[n]); }
        }
        if (isPluginEnabled(p.name) === enabled) togglePlugin(p.name);
        tracker.onToggled(p);
    };
    const hasSettings = getVisibleSettings(p).length > 0;
    const showPreview = hasPreview(p);
    const Icon = p.icon || PlugIcon;
    const toggleStar = () => {
        const list = listSetting("starredPlugins").filter(n => n !== p.name);
        if (!starred) list.push(p.name);
        sys().starredPlugins = list;
        dispatch(Events.PLUGIN_STAR, { name: p.name, starred: !starred });
    };
    const togglePin = () => {
        const list = listSetting("pinnedPlugins").filter(n => n !== p.name);
        if (!pinned) list.unshift(p.name);
        sys().pinnedPlugins = list;
        dispatch(Events.PLUGIN_PIN, { name: p.name, pinned: !pinned });
    };
    const openConfig = () => openModal(({ onClose }) => h(PluginModal, { plugin: p, onClose, onRestartChange: tracker.onSettingRestart }), { modalKey: `uspp-plugin-${p.name}` });
    const btn = (key, icon, label, onClick, active) => h(IconButton, { key, icon, label, onClick, active, size: 3.5, className: "uspp-card-btn" });
    return h(BaseCard, {
        attrs: { "data-failed": String(failed), "data-required": String(!!p.required), "data-uspp-plugin": p.name },
        name: p.name,
        icon: h(ErrorBoundary, { fallback: h(PlugIcon, { size: 3.5 }) }, h(Icon, { size: 3.5 })),
        badges: h(Badges, { p }),
        description: p.description,
        controls: [
            h(PluginActions, { key: "actions", p }),
            btn("star", starred ? StarFillIcon : StarIcon, starred ? "Unstar" : "Star", toggleStar, starred),
            !p.required && btn("pin", pinned ? PinFillIcon : PinIcon, pinned ? "Unpin" : "Pin", togglePin, pinned),
            hasSettings && h(Tooltip, { key: "cfg", content: "config" }, btn(null, SlidersIcon, "config", openConfig)),
            p.required
                // 必需插件:开关保持正常的“已开启”外观,只是锁住不能关;提示挂在外层 span 上(disabled 按钮不触发悬停)
                ? h(Tooltip, { key: "switch", content: `Required for ${SCRIPT_NAME} to work, can't be turned off` },
                    h("span", { className: "uspp-switch-lock", "data-uspp-locked": "true" },
                        h(Switch, { checked: true, disabled: true, label: p.name })))
                : byDependency
                    // 只因为被别的插件依赖才运行:锁住开关,说明是谁需要它
                    ? h(Tooltip, { key: "switch", content: `Needed by ${dependentsOf(p.name).join(", ")}` },
                        h("span", { className: "uspp-switch-lock", "data-uspp-locked": "dependency" },
                            h(Switch, { checked: true, disabled: true, label: p.name })))
                    // 出错太多被本页停掉的:开关显示为关,打开就是重新启动
                    : h(Switch, { key: "switch", checked: enabled && !p.tripped, label: p.name, onChange: onToggle }),
        ],
        footer: [
            h("span", { key: "a", className: "uspp-card-authors" }, (p.authors || []).join(", ") || "\u00A0"),
            // 插件声明会访问的外部主机,用户在卡片上就能看到
            Array.isArray(p.connect) && p.connect.length > 0 && h("span", { key: "c", className: "uspp-card-timing", title: `This plugin can send requests to: ${p.connect.join(", ")}` }, `Connects to ${p.connect.length > 2 ? `${p.connect.slice(0, 2).join(", ")} +${p.connect.length - 2}` : p.connect.join(", ")}`),
            // 启动较慢(>= 10 ms)的插件在卡片上标出启动耗时,排查页面变卡时一眼能看到
            // 运行期错误(启动之后的回调出错):数量和最近一条;出错太多被停掉时另标出
            errs && h("span", { key: "e", className: "uspp-card-timing", "data-uspp-plugin-errors": p.name, "data-error": "true", title: `Last error (${errs.last?.where ?? "?"}): ${errs.last?.message ?? ""}` },
                errs.tripped ? `Turned off after ${errs.count} errors` : `${errs.count} error${errs.count === 1 ? "" : "s"}`),
            p.started && p.startMs >= SLOW_START_MS && h("span", { key: "t", className: "uspp-card-timing", title: "Time this plugin took to start on this page" }, `${p.startMs} ms`),
            MULTI_SITE && h("span", { key: "s", className: "uspp-site-badge", "data-uspp-plugin-site": p.site ?? "*" }, pluginSiteLabel(p)),
            showPreview && h("button", { key: "p", type: "button", className: "uspp-card-preview", "aria-label": "Preview", title: "Preview", onClick: openConfig },
                h(EyeIcon, { size: 3.5 }), "Preview"),
        ],
    });
}

/** 注入点 settings.pluginActions:卡片上的额外按钮;定义里写了 plugin 时只出现在那个插件上 */
function PluginActions({ p }) {
    const items = getSlotItems("settings.pluginActions").filter(d => !d.plugin || d.plugin === p.name);
    const ctx = { plugin: p };
    return items.map(d => h(ErrorBoundary, { key: d.id, fallback: null },
        d.render ? h(d.render, ctx) : h("button", {
            type: "button", className: "uspp-btn uspp-btn-icon " + (d.className || ""), title: d.tooltip ?? d.label, "aria-label": d.label ?? d.id,
            disabled: slotValue(d.disabled, ctx), "data-active": String(slotValue(d.active, ctx)),
            onClick: () => { try { (d.onSelect || d.onClick)?.(ctx); } catch (e) { console.error("[Userscript++] 插件卡片按钮出错", e); } },
        }, typeof d.icon === "function" ? h(d.icon, { size: 4 }) : (d.icon ?? d.label))));
}

function sortPinned(list) {
    const pins = listSetting("pinnedPlugins");
    const pinned = pins.map(n => list.find(p => p.name === n)).filter(Boolean);
    return [...pinned, ...list.filter(p => !pins.includes(p.name)).sort((a, b) => a.name.localeCompare(b.name))];
}

export function PluginsTab() {
    useLive();
    const tracker = useReloadTracker();
    const [cat, setCat] = useState("favorites");
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const all = visiblePlugins();

    // 没有任何插件带更新时间时,Recent 永远为空,不显示
    const hasRecent = all.some(p => p.updatedAt);
    const cats = [["favorites", "Favorites"], ...(hasRecent ? [["recent", "Recent"]] : []), ["all", "All"], ...TAGS.filter(([t]) => all.some(p => p.tags?.includes(t)))];

    const q = query.trim().toLowerCase();
    const pass = p => (!q || `${p.name} ${p.description}`.toLowerCase().includes(q))
        && (filter === "all" || (filter === "enabled") === isPluginEnabled(p.name));

    let body;
    const grid = list => h("div", { className: "uspp-grid" }, list.map(p => h(ErrorBoundary, { key: p.name, fallback: null }, h(PluginCard, { p, tracker }))));
    const empty = text => h("div", { className: "uspp-empty" }, text);

    if (cat === "favorites") {
        const stars = listSetting("starredPlugins").slice().reverse();
        const list = stars.map(n => all.find(p => p.name === n)).filter(Boolean).filter(pass);
        body = list.length ? grid(list) : empty(stars.length && q ? "No plugins match your search." : "No favorites yet. Star a plugin to see it here.");
    } else if (cat === "recent") {
        const list = all.filter(p => p.updatedAt && Date.now() - p.updatedAt < 7 * DAY).sort((a, b) => b.updatedAt - a.updatedAt).filter(pass);
        body = list.length ? grid(list) : empty(q ? "No plugins match your search." : "No plugins updated in the last 7 days.");
    } else if (cat === "all") {
        const normal = sortPinned(all.filter(p => !p.required)).filter(pass);
        const req = all.filter(p => p.required).sort((a, b) => a.name.localeCompare(b.name)).filter(pass);
        body = normal.length + req.length === 0 ? empty("No plugins match your search.") : h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
            normal.length > 0 && grid(normal),
            req.length > 0 && h("div", { className: "uspp-divider" }, "Required"),
            req.length > 0 && grid(req));
    } else {
        const list = sortPinned(all.filter(p => p.tags?.includes(cat))).filter(pass);
        body = list.length ? grid(list) : empty("No plugins match your search.");
    }

    return h("div", { className: "uspp-page", "data-uspp-page": "plugins" },
        tracker.showBanner && h("div", { className: "uspp-banner" },
            h("span", { style: { flex: 1 } }, "Reload the page to apply plugin changes."),
            h(Button, { variant: "primary", size: "sm", onClick: () => location.reload() }, "Reload")),
        h("div", { className: "uspp-tabs", role: "tablist" }, cats.map(([id, label]) => h("button", {
            key: id, type: "button", role: "tab", className: "uspp-chip", "aria-selected": String(cat === id), onClick: () => setCat(id),
        }, label))),
        h("div", { className: "uspp-toolbar" },
            h(Input, { type: "search", placeholder: `Search ${all.length} plugins...`, value: query, onChange: e => setQuery(e.target.value) }),
            h(Select, { value: filter, label: "Filter", onChange: setFilter, options: [{ label: "All", value: "all" }, { label: "Enabled", value: "enabled" }, { label: "Disabled", value: "disabled" }] })),
        body);
}
