// 插件数据存储:给插件存放缓存、历史这类大块数据,不进设置(不跟着跨标签同步、三处合并,导出时可选)。
// 缺省存在当前网站的 IndexedDB(库名带脚本 ID);.global 存在本脚本的 GM 存储里,跨网站共享。
// 页面没有 IndexedDB 时退回内存(只在本次页面里有效)并记 warn。
import { W, GM, SCRIPT_ID } from "../env.js";
import { Logger } from "./logger.js";

const logger = new Logger("DataStore", "#99f6e4");
export const DATA_DB = `UserscriptPP:${SCRIPT_ID}:data`;
const STORE = "kv";
const SEP = "\u0000";
const GM_PREFIX = "data:";

let dbp = null;
let memory = null;
function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
        const idb = W.indexedDB || (typeof indexedDB !== "undefined" ? indexedDB : null);
        if (!idb) return reject(new Error("no indexedDB"));
        const req = idb.open(DATA_DB, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("blocked"));
    }).catch(e => {
        logger.warn("IndexedDB 不可用,插件数据只保存在本次页面的内存里", e?.message ?? e);
        memory ??= new Map();
        return null;
    });
    return dbp;
}

const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        fn(t.objectStore(STORE));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
    });
};
const reqValue = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

async function idbGet(k) {
    const d = await db();
    if (!d) return memory.get(k);
    return reqValue(d.transaction(STORE, "readonly").objectStore(STORE).get(k));
}
async function idbSet(k, v) {
    const d = await db();
    if (!d) { memory.set(k, v); return; }
    await tx("readwrite", s => { s.put(v, k); });
}
async function idbDel(k) {
    const d = await db();
    if (!d) { memory.delete(k); return; }
    await tx("readwrite", s => { s.delete(k); });
}
async function idbKeys() {
    const d = await db();
    if (!d) return [...memory.keys()];
    return reqValue(d.transaction(STORE, "readonly").objectStore(STORE).getAllKeys());
}

// ---------- GM(跨网站) ----------
const gmIndexKey = plugin => `${GM_PREFIX}${plugin}${SEP}__keys`;
const gmKey = (plugin, key) => `${GM_PREFIX}${plugin}${SEP}${key}`;
const gmMem = new Map();
const gmGet = (k, d) => (GM.get ? GM.get(k, d) : gmMem.has(k) ? gmMem.get(k) : d);
const gmSet = (k, v) => (GM.set ? GM.set(k, v) : gmMem.set(k, v));
const gmDel = k => (GM.del ? GM.del(k) : gmMem.delete(k));
const gmIndex = plugin => { const v = gmGet(gmIndexKey(plugin), []); return Array.isArray(v) ? v : []; };

const clone = v => (v === undefined ? undefined : typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

const stores = new Map();
/** 某个插件的数据存储 */
export function dataStoreFor(plugin) {
    if (stores.has(plugin)) return stores.get(plugin);
    const k = key => `${plugin}${SEP}${String(key)}`;
    const global = Object.freeze({
        async get(key, fallback) { const v = gmGet(gmKey(plugin, key), undefined); return v === undefined ? fallback : clone(v); },
        async set(key, value) {
            gmSet(gmKey(plugin, key), clone(value));
            const idx = gmIndex(plugin);
            if (!idx.includes(String(key))) gmSet(gmIndexKey(plugin), [...idx, String(key)]);
        },
        async del(key) { gmDel(gmKey(plugin, key)); gmSet(gmIndexKey(plugin), gmIndex(plugin).filter(x => x !== String(key))); },
        async keys() { return gmIndex(plugin); },
        async clear() { for (const key of gmIndex(plugin)) gmDel(gmKey(plugin, key)); gmDel(gmIndexKey(plugin)); },
    });
    const store = Object.freeze({
        async get(key, fallback) { try { const v = await idbGet(k(key)); return v === undefined ? fallback : v; } catch (e) { logger.error(`${plugin} 读取数据失败`, e); return fallback; } },
        async set(key, value) { await idbSet(k(key), value); },
        async del(key) { await idbDel(k(key)); },
        async keys() { const p = `${plugin}${SEP}`; return (await idbKeys()).filter(x => typeof x === "string" && x.startsWith(p)).map(x => x.slice(p.length)); },
        async clear() { for (const key of await this.keys()) await idbDel(k(key)); },
        global,
    });
    stores.set(plugin, store);
    return store;
}

/** 导出:所有插件的数据(当前网站的和跨网站的) */
export async function exportData(pluginNames) {
    const out = {};
    for (const name of pluginNames) {
        const s = dataStoreFor(name);
        const site = {}, glob = {};
        for (const key of await s.keys()) site[key] = await s.get(key);
        for (const key of await s.global.keys()) glob[key] = await s.global.get(key);
        if (Object.keys(site).length || Object.keys(glob).length) out[name] = { site, global: glob };
    }
    return out;
}

/** 导入:按插件整份替换 */
export async function importData(data) {
    if (!data || typeof data !== "object") return;
    for (const [name, v] of Object.entries(data)) {
        const s = dataStoreFor(name);
        await s.clear();
        await s.global.clear();
        for (const [key, val] of Object.entries(v?.site || {})) await s.set(key, val);
        for (const [key, val] of Object.entries(v?.global || {})) await s.global.set(key, val);
    }
}

/** 不在这条脚本里的插件:删掉它的数据(和清理旧设置一样) */
export async function pruneData(keepNames) {
    const keep = new Set(keepNames);
    // 只在库已经存在时清理:不为清理而在每个网站上新建数据库
    const idb = W.indexedDB || (typeof indexedDB !== "undefined" ? indexedDB : null);
    if (typeof idb?.databases !== "function") return;
    try { if (!(await idb.databases()).some(d => d.name === DATA_DB)) return; } catch { return; }
    try {
        for (const key of await idbKeys()) {
            if (typeof key !== "string") continue;
            const name = key.split(SEP)[0];
            if (!keep.has(name)) await idbDel(key);
        }
    } catch (e) { logger.debug("清理插件数据失败", e); }
}
