// Plugins 页(规格 8.2、8.3)
import { h, useState, useRef, useEffect, useForceUpdate, ErrorBoundary } from "../ui/react.js";
import { Switch, Select, Input, Button, Tooltip, IconButton } from "../ui/components.js";
import {
    plugins, isPluginEnabled, togglePlugin, needsRestart, getVisibleSettings, isEnabledAsDependency,
} from "../lib/plugins.js";
import { Settings, SettingsStore } from "../lib/settings.js";
import { subscribe, dispatch, Events } from "../lib/events.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { isChromium } from "../env.js";
import {
    PlugIcon, StarIcon, StarFillIcon, PinIcon, PinFillIcon, SlidersIcon, LockIcon, WarningIcon, ChromiumIcon, WrenchIcon,
} from "../ui/icons.js";
import { PluginModal } from "./PluginModal.js";
import { getSlotItems, onSlotChange, slotValue } from "../lib/slots.js";
import { pluginSiteLabel } from "./site-label.js";
import { sys, listSetting } from "./shared.js";

const TAGS = [
    ["composer", "Composer"], ["messages", "Messages"], ["chats", "Chats"], ["media", "Media"], ["navigation", "Navigation"],
    ["notifications", "Notifications"], ["appearance", "Appearance"], ["declutter", "Declutter"], ["privacy", "Privacy"], ["developer", "Developer"],
];
const DAY = 86400000;

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
    const failed = !p.required && isPluginEnabled(p.name) && !p.started;
    if (p.required) out.push(h(Tooltip, { key: "req", content: "This plugin is required for Userscript++ to work" }, h("span", { className: "uspp-icon-badge" }, h(LockIcon, { size: 3.5 }))));
    if (failed) out.push(h(Tooltip, { key: "fail", content: "This plugin failed to start" }, h("span", { className: "uspp-icon-badge uspp-warn" }, h(WarningIcon, { size: 3.5 }))));
    if (p.chromiumOnly) out.push(h(Tooltip, { key: "chr", content: "Chromium only" }, h("span", { className: "uspp-icon-badge" }, h(ChromiumIcon, { size: 3.5 }))));
    if (p.dev) out.push(h(Tooltip, { key: "dev", content: "Development build only" }, h("span", { className: "uspp-icon-badge" }, h(WrenchIcon, { size: 3.5 }))));
    const seen = sys().knownPlugins?.[p.name];
    if (seen && Date.now() - seen < 2 * DAY) out.push(h("span", { key: "new", className: "uspp-badge" }, "New"));
    return out;
}

function PluginCard({ p, tracker }) {
    const enabled = isPluginEnabled(p.name);
    const starred = listSetting("starredPlugins").includes(p.name);
    const pinned = listSetting("pinnedPlugins").includes(p.name);
    const failed = !p.required && enabled && !p.started;
    const hasSettings = getVisibleSettings(p).length > 0;
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
    return h("div", { className: "uspp-card", "data-failed": String(failed), "data-uspp-plugin": p.name },
        h("div", { className: "uspp-card-head" },
            h("span", { className: "uspp-icon-badge" }, h(ErrorBoundary, { fallback: h(PlugIcon, { size: 4.5 }) }, h(Icon, { size: 4.5 }))),
            h("span", { className: "uspp-card-name" }, p.name),
            h(Badges, { p }),
            h("span", { className: "uspp-site-badge", "data-uspp-plugin-site": p.site ?? "*" }, pluginSiteLabel(p)),
            h("div", { className: "uspp-card-controls" },
                h(PluginActions, { p }),
                h(IconButton, { icon: starred ? StarFillIcon : StarIcon, label: starred ? "Unstar" : "Star", active: starred, onClick: toggleStar }),
                !p.required && h(IconButton, { icon: pinned ? PinFillIcon : PinIcon, label: pinned ? "Unpin" : "Pin", active: pinned, onClick: togglePin }),
                hasSettings && h(IconButton, { icon: SlidersIcon, label: "config", onClick: openConfig }),
                h(Switch, {
                    checked: enabled, disabled: p.required || isEnabledAsDependency(p.name), label: p.name,
                    onChange: () => { togglePlugin(p.name); tracker.onToggled(p); },
                }))),
        h("div", { className: "uspp-card-desc" }, p.description),
        h("div", { className: "uspp-card-authors" }, (p.authors || []).join(", ")));
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
