// 主题与 Quick CSS:按站点分区(plugins.Settings.sites.<分区>),每条主题可另设"适用于所有站点"
import { Logger } from "./logger.js";
import { Settings, PlainSettings } from "./settings.js";
import { registerStyle, disableStyle, unregisterStyle, enableStyle } from "./styles.js";
import { fetchExternal } from "./net.js";
import { GM } from "../env.js";
import { siteKey, getSites } from "./sites.js";

const logger = new Logger("Themes", "#fcd34d");
const cssCache = new Map(); // url -> css(本次页面里已取得的在线主题)
const applied = new Set();  // 本页注册过样式的主题 id

// ---------- 在线主题缓存:存在脚本管理器里(各网站共用),先用缓存立即注入,每天后台检查一次 ----------
const CACHE_KEY = "UserscriptPPThemeCache";
const REFRESH_MS = 24 * 60 * 60 * 1000;
let diskCache = null;
function readDisk() {
    if (diskCache) return diskCache;
    diskCache = {};
    try {
        const v = GM.get ? GM.get(CACHE_KEY) : null;
        if (v && typeof v === "object" && typeof v.then !== "function") diskCache = { ...v };
        else if (typeof v === "string") diskCache = JSON.parse(v) || {};
    } catch { diskCache = {}; }
    return diskCache;
}
function writeDisk() {
    try { const r = GM.set?.(CACHE_KEY, diskCache || {}); r?.catch?.(() => { }); } catch (e) { logger.debug("写入主题缓存失败", e); }
}
function cacheCss(url, css) {
    cssCache.set(url, css);
    readDisk()[url] = { css, at: Date.now() };
    writeDisk();
}
function dropCache(url) {
    cssCache.delete(url);
    if (readDisk()[url]) { delete diskCache[url]; writeDisk(); }
}

// ---------- 分区 ----------
export const SITES_PATH = "plugins.Settings.sites";
const EMPTY = Object.freeze({});
/** 只读:分区不存在时返回空对象,不创建(免得每个访问过的网站都留下一条空记录) */
export function readPartition(key = siteKey()) {
    const p = raw().sites?.[key];
    return p && typeof p === "object" ? p : EMPTY;
}
/** 写入用:必要时创建分区,返回会触发保存的代理 */
export function writePartition(key = siteKey()) {
    const r = raw();
    if (!r.sites || typeof r.sites !== "object" || Array.isArray(r.sites)) S().sites = {};
    if (!r.sites[key] || typeof r.sites[key] !== "object") S().sites[key] = {};
    return S().sites[key];
}
const themesOf = part => (Array.isArray(part?.themes) ? part.themes : []);

const listeners = new Set();
const emit = () => { for (const l of [...listeners]) { try { l(); } catch { /* 忽略 */ } } };
export const subscribeThemes = fn => { listeners.add(fn); return () => listeners.delete(fn); };

const S = () => Settings.plugins.Settings;
const raw = () => PlainSettings.plugins.Settings ??= {};
const styleName = id => `theme:${id}`;

function themesList() {
    return themesOf(readPartition());
}
/** 当前站点分区的主题(Themes 页只显示和编辑这些) */
export const getThemes = () => themesList().map(t => ({ ...t }));
/** 其他分区里标了"适用于所有站点"的主题 */
function foreignAllSiteThemes() {
    const key = siteKey(), out = [];
    for (const [k, part] of Object.entries(raw().sites || {})) if (k !== key) for (const t of themesOf(part)) if (t?.allSites) out.push(t);
    return out;
}

export const isThemesEnabled = () => raw().themesEnabled !== false;
export const isOnlineThemesEnabled = () => raw().onlineThemesEnabled !== false;

function saveThemes(list) {
    writePartition().themes = list.map(t => ({ ...t }));
    emit();
}

export function parseThemeMeta(css) {
    const meta = {};
    const m = /\/\*\*([\s\S]*?)\*\//.exec(css);
    if (m) {
        for (const line of m[1].split(/\r?\n/)) {
            const mm = /@(name|author|description)\s+(.+)$/.exec(line.replace(/^\s*\*?\s*/, ""));
            if (mm) meta[mm[1]] = mm[2].trim();
        }
    }
    return meta;
}

export function nameFromUrl(url) {
    try {
        const file = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
        return file.replace(/\.css$/i, "").replace(/[-_]+/g, " ").trim() || url;
    } catch { return url; }
}

export function validateThemeUrl(url) {
    let u;
    try { u = new URL(String(url).trim()); } catch { return "Enter a valid URL."; }
    if (u.protocol !== "https:") return "Enter a valid URL.";
    if (!/\.css$/i.test(u.pathname)) return "URL must point to a .css file.";
    return null;
}

async function fetchCss(url) {
    let res;
    try {
        res = await fetchExternal(url, { timeout: 30000 });
    } catch (e) {
        throw new Error(`Failed to fetch theme (${e?.message || "network error"}).`);
    }
    if (!res.ok) throw new Error(`Failed to fetch theme (${res.status}).`);
    const css = await res.text();
    if (!css.trim()) throw new Error("Theme file is empty.");
    return css;
}

function applyTheme(t) {
    const name = styleName(t.url);
    if (!isThemesEnabled() || !t.enabled) { disableStyle(name); return; }
    applied.add(t.url);
    if (t.local) {
        registerStyle(name, t.css || "");
        return;
    }
    if (!isOnlineThemesEnabled()) { disableStyle(name); return; }
    const mem = cssCache.get(t.url);
    if (mem != null) { registerStyle(name, mem); return; }
    const disk = readDisk()[t.url];
    if (disk && typeof disk.css === "string") {
        cssCache.set(t.url, disk.css);
        registerStyle(name, disk.css);
        if (Date.now() - (disk.at || 0) < REFRESH_MS) return;
    }
    fetchCss(t.url).then(css => {
        cacheCss(t.url, css);
        const cur = [...themesList(), ...foreignAllSiteThemes()].find(x => x.url === t.url);
        // 拉取返回时若主题已被关闭或删除则丢弃
        if (!cur || !cur.enabled || !isThemesEnabled() || !isOnlineThemesEnabled()) return;
        registerStyle(name, css);
    }).catch(e => logger.warn(`加载在线主题失败${disk ? "(继续使用缓存)" : ""}:${t.url}`, e.message));
}

export function applyAllThemes() {
    const list = [...themesList(), ...foreignAllSiteThemes()];
    const ids = new Set(list.map(t => t.url));
    // 别的标签页删掉的主题
    for (const id of [...applied]) if (!ids.has(id)) { unregisterStyle(styleName(id)); applied.delete(id); }
    for (const t of list) applyTheme(t);
}

export async function addTheme(url) {
    url = String(url || "").trim();
    const err = validateThemeUrl(url);
    if (err) throw new Error(err);
    if (themesList().some(t => t.url === url)) throw new Error("This theme is already added.");
    const css = await fetchCss(url);
    cacheCss(url, css);
    const meta = parseThemeMeta(css);
    const theme = { url, name: meta.name || nameFromUrl(url), author: meta.author || "", description: meta.description || "", enabled: false };
    if (themesList().some(t => t.url === url)) throw new Error("This theme is already added.");
    saveThemes([...themesList(), theme]);
    return { ...theme };
}

const randomId = () => "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

export function addLocalTheme(name, css) {
    const meta = parseThemeMeta(css || "");
    const theme = {
        url: randomId(),
        name: String(name || "").trim() || meta.name || "Untitled",
        author: meta.author || "Local",
        description: meta.description || "",
        enabled: false,
        local: true,
        css: String(css || ""),
    };
    saveThemes([...themesList(), theme]);
    return { ...theme };
}

export function updateLocalTheme(id, { name, css } = {}) {
    const list = themesList().map(t => ({ ...t }));
    const t = list.find(x => x.url === id && x.local);
    if (!t) return false;
    if (name != null) t.name = String(name);
    if (css != null) {
        t.css = String(css);
        const meta = parseThemeMeta(t.css);
        if (meta.description != null) t.description = meta.description;
        if (meta.author) t.author = meta.author;
    }
    saveThemes(list);
    applyTheme(t);
    return true;
}

export function removeTheme(id) {
    const list = themesList();
    if (!list.some(t => t.url === id)) return false;
    unregisterStyle(styleName(id));
    applied.delete(id);
    dropCache(id);
    saveThemes(list.filter(t => t.url !== id));
    return true;
}

function setEnabled(id, enabled) {
    const list = themesList().map(t => ({ ...t }));
    const t = list.find(x => x.url === id);
    if (!t) return false;
    t.enabled = enabled;
    saveThemes(list);
    if (enabled) applyTheme(t); else disableStyle(styleName(id));
    return true;
}
export const enableTheme = id => setEnabled(id, true);
export const disableTheme = id => setEnabled(id, false);

/** 主题是否适用于所有站点(否则只用于它所在的站点分区) */
export function setThemeAllSites(id, allSites) {
    const list = themesList().map(t => ({ ...t }));
    const t = list.find(x => x.url === id);
    if (!t) return false;
    if (allSites) t.allSites = true; else delete t.allSites;
    saveThemes(list);
    applyTheme(t);
    return true;
}

export function setThemesEnabled(b) {
    S().themesEnabled = !!b;
    if (b) applyAllThemes();
    else for (const t of [...themesList(), ...foreignAllSiteThemes()]) disableStyle(styleName(t.url));
    emit();
}

export function setOnlineThemesEnabled(b) {
    S().onlineThemesEnabled = !!b;
    for (const t of [...themesList(), ...foreignAllSiteThemes()]) if (!t.local) {
        if (b) applyTheme(t); else disableStyle(styleName(t.url));
    }
    emit();
}

// ---------- Quick CSS(当前站点分区) ----------
const QUICK_CSS = "quick-css";
export function getQuickCss() {
    const p = readPartition();
    return { css: p.customCSS || "", enabled: p.customCSSEnabled !== false };
}
export function setQuickCss({ css, enabled } = {}) {
    const st = writePartition();
    if (css != null) st.customCSS = String(css);
    if (enabled != null) st.customCSSEnabled = !!enabled;
}
export function applyQuickCss() {
    const { css, enabled } = getQuickCss();
    if (enabled && css) registerStyle(QUICK_CSS, css);
    else disableStyle(QUICK_CSS);
}
export { enableStyle };
