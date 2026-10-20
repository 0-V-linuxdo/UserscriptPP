// 设置备份:导出整份设置为 JSON、导入时整份替换
import { VERSION } from "../env.js";
import { Logger } from "./logger.js";
import { PlainSettings, serialize, parseStored, saveNow, replaceAll } from "./settings.js";
import { plugins, isPluginEnabled, startPlugin, stopPlugin, needsRestart, sensitiveKeys } from "./plugins.js";
import { dispatch, Events } from "./events.js";

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
    return {
        settings: data,
        summary: {
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

/** 导入:整份替换;文件里密钥类设置为空时保留本机已有的;之后按新设置启停插件。返回 true 表示需要刷新 */
export async function importSettings(settings) {
    const data = clone(settings);
    data.plugins ??= {};
    for (const name of Object.keys(PlainSettings.plugins)) {
        for (const k of sensitiveKeys(name)) {
            const cur = PlainSettings.plugins[name]?.[k];
            const inc = data.plugins[name]?.[k];
            if ((inc == null || inc === "") && cur != null && cur !== "") (data.plugins[name] ??= {})[k] = cur;
        }
    }
    const before = Object.fromEntries(Object.keys(plugins).map(n => [n, isPluginEnabled(n)]));
    for (const name of Object.keys(plugins)) data.plugins[name] ??= {};
    replaceAll(data);
    let reload = false;
    for (const [name, was] of Object.entries(before)) {
        const p = plugins[name];
        const now = isPluginEnabled(name);
        if (was === now) continue;
        if (needsRestart(p)) reload = true;
        try { if (now) startPlugin(p); else stopPlugin(p); } catch (e) { logger.error(`导入后启停 ${name} 失败`, e); }
        dispatch(Events.PLUGIN_TOGGLE, { name, enabled: now });
    }
    await saveNow();
    if (reload) dispatch(Events.RELOAD_NEEDED, { reason: "import" });
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
