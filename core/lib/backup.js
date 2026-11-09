// 设置备份:导出整份设置为 JSON、导入时整份替换
import { VERSION, GM } from "../env.js";
import { Logger } from "./logger.js";
import { PlainSettings, serialize, parseStored, saveNow, replaceAll } from "./settings.js";
import { plugins, isPluginEnabled, reconcile, needsRestart, sensitiveKeys, OptionType } from "./plugins.js";
import { dispatch, Events } from "./events.js";
import { exportData, importData } from "./datastore.js";

const logger = new Logger("Backup", "#93c5fd");
export const BACKUP_FORMAT = "userscript-pp-settings";

const clone = v => parseStored(serialize(v)) ?? JSON.parse(serialize(v));

/** 导出:默认去掉插件标为 sensitive 的设置项 */
export function exportSettings({ includeSensitive = false } = {}) {
    const settings = clone(PlainSettings);
    if (!includeSensitive) {
        for (const name of Object.keys(settings.plugins || {})) {
            for (const k of sensitiveKeys(name)) if (settings.plugins[name] && k in settings.plugins[name]) delete settings.plugins[name][k];
        }
    }
    return { format: BACKUP_FORMAT, version: VERSION, exportedAt: new Date().toISOString(), settings };
}

/** 导出,另带插件数据(插件数据存储里的内容,异步读取) */
export async function exportSettingsWithData(opts = {}) {
    const out = exportSettings(opts);
    out.data = await exportData(Object.keys(plugins));
    return out;
}

/** 识别文件内容:接受导出格式,也接受直接是设置对象的 JSON */
export function parseBackup(text) {
    let obj;
    try { obj = typeof text === "string" ? JSON.parse(text) : text; } catch { throw new Error("This file is not valid JSON."); }
    const settings = obj && obj.format === BACKUP_FORMAT ? obj.settings : obj;
    const data = parseStored(settings);
    if (!data) throw new Error("No Userscript++ settings found in this file.");
    const names = Object.keys(data.plugins);
    const s = data.plugins.Settings || {};
    const parts = s.sites && typeof s.sites === "object" ? Object.values(s.sites) : [];
    const themes = parts.reduce((n, p) => n + (Array.isArray(p?.themes) ? p.themes.length : 0), Array.isArray(s.themes) ? s.themes.length : 0);
    const pluginData = obj && obj.format === BACKUP_FORMAT && obj.data && typeof obj.data === "object" ? obj.data : null;
    return {
        settings: data,
        data: pluginData,
        summary: {
            dataPlugins: pluginData ? Object.keys(pluginData).length : 0,
            plugins: names.length,
            enabled: names.filter(n => data.plugins[n]?.enabled === true).length,
            themes,
            sites: parts.length,
            quickCss: parts.some(p => typeof p?.customCSS === "string" && p.customCSS.length > 0) || (typeof s.customCSS === "string" && s.customCSS.length > 0),
            version: obj?.version ?? null,
            exportedAt: obj?.exportedAt ?? null,
        },
    };
}

// ---------- 导入校验 ----------
/** 一个值是否符合设置定义;返回 null 表示合法,否则是原因 */
function checkValue(def, check, v) {
    if (!def) return null;
    const t = def.type;
    if (t === OptionType.BOOLEAN && typeof v !== "boolean") return "expected true or false";
    if ((t === OptionType.NUMBER || t === OptionType.SLIDER) && !(typeof v === "number" && Number.isFinite(v))) return "expected a number";
    if (t === OptionType.SLIDER && (v < def.min || v > def.max)) return `expected ${def.min}–${def.max}`;
    if (t === OptionType.BIGINT && typeof v !== "bigint") return "expected an integer";
    if (t === OptionType.STRING && typeof v !== "string") return "expected text";
    if (t === OptionType.SELECT && !(def.options || []).some(o => o.value === v)) return "not one of the options";
    if (typeof check?.isValid === "function") {
        let r;
        try { r = check.isValid(v); } catch (e) { return e?.message || "invalid value"; }
        if (r === false) return "invalid value";
        if (typeof r === "string") return r;
    }
    return null;
}

/**
 * 按本次构建里各插件的设置定义逐项校验(就地修改):不合法的值删掉(改用缺省值)。
 * 不在定义里的键(框架自己的列表、旧版本留下的)和本次构建里没有的插件原样保留。返回 [{ plugin, key, reason }]
 */
export function sanitizeImport(data) {
    const invalid = [];
    for (const [name, conf] of Object.entries(data?.plugins || {})) {
        if (!conf || typeof conf !== "object" || Array.isArray(conf)) { delete data.plugins[name]; invalid.push({ plugin: name, key: "*", reason: "not an object" }); continue; }
        const p = plugins[name];
        if (!p) continue;
        if ("enabled" in conf && typeof conf.enabled !== "boolean") { delete conf.enabled; invalid.push({ plugin: name, key: "enabled", reason: "expected true or false" }); }
        const def = p.settings?.def || {};
        const checks = p.settings?.checks || {};
        for (const key of Object.keys(conf)) {
            if (key === "enabled" || !(key in def)) continue;
            const why = checkValue(def[key], checks[key], conf[key]);
            if (why) { delete conf[key]; invalid.push({ plugin: name, key, reason: why }); }
        }
    }
    return invalid;
}

/** 导入前预览:哪些插件会打开、哪些会关掉、多少个设置项会变(只算本次构建里有的插件) */
export function previewImport(settings) {
    const data = clone(settings);
    const invalid = sanitizeImport(data);
    const turnOn = [], turnOff = [];
    let changed = 0;
    for (const [name, p] of Object.entries(plugins)) {
        if (p.required || p.hidden) continue;
        const inc = data.plugins?.[name];
        const next = typeof inc?.enabled === "boolean" ? inc.enabled : !!p.enabledByDefault;
        const now = isPluginEnabled(name);
        if (next !== now) (next ? turnOn : turnOff).push(name);
        for (const key of Object.keys(p.settings?.def || {})) {
            if (inc && key in inc && serialize(inc[key]) !== serialize(PlainSettings.plugins[name]?.[key])) changed++;
        }
    }
    return { turnOn, turnOff, changed, invalid };
}

// ---------- 撤销 ----------
// 导入前的整份设置(含密钥类)和被覆盖的插件数据存在 GM 存储里:导入后要刷新页面时也能撤销。保留 7 天
export const UNDO_KEY = "UserscriptPPImportUndo";
const UNDO_MS = 7 * 24 * 60 * 60 * 1000;
let undoCache;

async function readUndo() {
    if (undoCache !== undefined) return undoCache;
    let v = null;
    try { v = GM.get ? await GM.get(UNDO_KEY) : null; } catch { v = null; }
    if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
    undoCache = v && typeof v === "object" && Date.now() - (v.at || 0) < UNDO_MS ? v : null;
    return undoCache;
}
async function writeUndo(v) {
    undoCache = v;
    try {
        if (!GM.set) return;
        const r = v ? GM.set(UNDO_KEY, JSON.stringify(v)) : (GM.del ? GM.del(UNDO_KEY) : GM.set(UNDO_KEY, ""));
        if (r && typeof r.then === "function") await r;
    } catch (e) { logger.warn("保存导入前的设置失败", e); }
}

/** 同步判断有没有可撤销的导入(lastImport() 读过一次之后才准) */
export const canUndoImport = () => !!undoCache;

/** 能撤销的上一次导入:{ at } 或 null */
export async function lastImport() {
    const u = await readUndo();
    return u ? { at: u.at } : null;
}

/** 把设置换成 data,并按新设置启停插件;返回 true 表示需要刷新 */
async function apply(data, pluginData) {
    const before = Object.fromEntries(Object.keys(plugins).map(n => [n, isPluginEnabled(n)]));
    for (const name of Object.keys(plugins)) data.plugins[name] ??= {};
    replaceAll(data);
    let reload = false;
    for (const [name, was] of Object.entries(before)) {
        const p = plugins[name];
        const now = isPluginEnabled(name);
        if (was === now) continue;
        if (needsRestart(p)) reload = true;
        dispatch(Events.PLUGIN_TOGGLE, { name, enabled: now });
    }
    // 开关的变更在 replaceAll 发通知时已经收敛过;这里再收敛一次,兜住只改了依赖关系、没改开关的情况
    try { reconcile(); } catch (e) { logger.error("导入后启停插件失败", e); }
    await saveNow({ flushBackup: true });
    if (pluginData) { try { await importData(pluginData); } catch (e) { logger.error("导入插件数据失败", e); } }
    if (reload) dispatch(Events.RELOAD_NEEDED, { reason: "import" });
    return reload;
}

let lastInvalid = [];
/** 上一次导入时因不合法而丢掉的设置项:[{ plugin, key, reason }] */
export const lastImportInvalid = () => lastInvalid.slice();

/**
 * 导入:按设置定义逐项校验后整份替换;文件里密钥类设置为空时保留本机已有的;之后按新设置启停插件。
 * 导入前的设置(和要被覆盖的插件数据)先存下来,可用 undoImport() 撤销。返回 true 表示需要刷新
 */
export async function importSettings(settings, { data: pluginData } = {}) {
    const data = clone(settings);
    data.plugins ??= {};
    lastInvalid = sanitizeImport(data);
    if (lastInvalid.length) logger.warn(`导入时丢掉了 ${lastInvalid.length} 个不合法的设置项`, lastInvalid);
    for (const name of Object.keys(PlainSettings.plugins)) {
        for (const k of sensitiveKeys(name)) {
            const cur = PlainSettings.plugins[name]?.[k];
            const inc = data.plugins[name]?.[k];
            if ((inc == null || inc === "") && cur != null && cur !== "") (data.plugins[name] ??= {})[k] = cur;
        }
    }
    let prevData = null;
    if (pluginData) { try { prevData = await exportData(Object.keys(pluginData)); } catch { prevData = null; } }
    await writeUndo({ at: Date.now(), settings: serialize(PlainSettings), data: prevData });
    return apply(data, pluginData);
}

/** 撤销上一次导入:恢复导入前的设置和插件数据。没有可撤销的导入时返回 null,否则返回是否需要刷新 */
export async function undoImport() {
    const u = await readUndo();
    if (!u) return null;
    const data = parseStored(u.settings);
    if (!data) { await writeUndo(null); return null; }
    const reload = await apply(data, u.data || null);
    await writeUndo(null);
    lastInvalid = [];
    return reload;
}

// ---------- 文件 ----------
export function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

export const backupFilename = () => `userscript-pp-settings-${new Date().toISOString().slice(0, 10)}.json`;

/** 让用户选一个 JSON 文件,返回其文本;取消时返回 null */
export function pickJsonFile() {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.style.display = "none";
        input.onchange = () => {
            const f = input.files?.[0];
            input.remove();
            if (!f) return resolve(null);
            f.text().then(resolve, () => resolve(null));
        };
        (document.body || document.documentElement).appendChild(input);
        input.click();
    });
}
