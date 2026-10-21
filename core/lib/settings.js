// 设置存储:代理 + 变更通知 + 多来源读取合并 + 防抖写入 + 多标签页同步
import { W, GM, SCRIPT_ID } from "../env.js";
import { Logger } from "./logger.js";
import { debounce } from "./utils.js";
import { isGeneric } from "./sites.js";
import { dispatch, Events } from "./events.js";

const logger = new Logger("Settings", "#86efac");

/** 脚本管理器存储里的键(脚本管理器本来就按脚本隔开) */
export const STORAGE_KEY = "UserscriptPPSettings";
/** 网站存储(localStorage、IndexedDB)由页面上所有脚本共用,键和库名带脚本 ID */
export const SITE_STORAGE_KEY = `UserscriptPP:${SCRIPT_ID}:settings`;
const IDB_NAME = `UserscriptPP:${SCRIPT_ID}`;
const IDB_STORE = "kv";
const BIGINT_TAG = "$usppBigint";

export const PlainSettings = { plugins: {} };

// 由插件管理器注入:读取插件设置缺省值
let defaultResolver = () => undefined;
export function setDefaultResolver(fn) { defaultResolver = fn; }

let ready = false;
export const isReady = () => ready;

// ---------- 监听者 ----------
const globalListeners = new Set();
const pathListeners = new Map();
const prefixListeners = new Map();

function addTo(map, key, fn) {
    let s = map.get(key);
    if (!s) map.set(key, s = new Set());
    s.add(fn);
}

function callSafe(fn, ...args) {
    try { fn(...args); } catch (e) { logger.error("设置监听者出错", e); }
}

// 本标签页改了、还没落盘的路径;别的标签页同步过来时不覆盖它们
const dirty = new Set();

function emitChange(path, value) {
    for (const fn of [...globalListeners]) callSafe(fn, value, path);
    const exact = pathListeners.get(path);
    if (exact) for (const fn of [...exact]) callSafe(fn, value, path);
    for (const [prefix, set] of prefixListeners) {
        if (path.startsWith(prefix)) {
            for (const fn of [...set]) callSafe(fn, value, path);
        }
    }
}

function notify(path, value) {
    emitChange(path, value);
    if (ready) dirty.add(path);
    scheduleSave();
}

export const SettingsStore = {
    addChangeListener(path, fn) { addTo(pathListeners, path, fn); },
    removeChangeListener(path, fn) { pathListeners.get(path)?.delete(fn); },
    addPrefixChangeListener(prefix, fn) { addTo(prefixListeners, prefix, fn); },
    removePrefixChangeListener(prefix, fn) { prefixListeners.get(prefix)?.delete(fn); },
    addGlobalChangeListener(fn) { globalListeners.add(fn); },
    removeGlobalChangeListener(fn) { globalListeners.delete(fn); },
    markAsChanged() {
        for (const fn of [...globalListeners]) callSafe(fn, PlainSettings, "");
        scheduleSave();
    },
};

// ---------- 代理 ----------
const RAW = Symbol("uspp.raw");
const proxyCache = new WeakMap(); // obj -> Map<path, proxy>

function makeProxy(obj, path) {
    let byPath = proxyCache.get(obj);
    if (!byPath) proxyCache.set(obj, byPath = new Map());
    const cached = byPath.get(path);
    if (cached) return cached;

    const proxy = new Proxy(obj, {
        get(target, key, receiver) {
            if (key === RAW) return target;
            if (typeof key === "symbol") return Reflect.get(target, key, receiver);
            let v = target[key];
            const full = path ? `${path}.${key}` : key;
            if (v === undefined) {
                // plugins.<名>.<键> 读不到时返回默认值并写回内存
                const parts = full.split(".");
                if (parts.length === 3 && parts[0] === "plugins") {
                    const def = defaultResolver(parts[1], parts[2]);
                    if (def !== undefined) {
                        target[key] = def;
                        v = def;
                    }
                }
            }
            if (v !== null && typeof v === "object" && !(v instanceof Date)) return makeProxy(v, full);
            return v;
        },
        set(target, key, value) {
            if (typeof key === "symbol") return Reflect.set(target, key, value);
            if (value && typeof value === "object" && value[RAW]) value = value[RAW];
            if (Object.is(target[key], value) && key in target) return true;
            target[key] = value;
            notify(path ? `${path}.${key}` : key, value);
            return true;
        },
        deleteProperty(target, key) {
            if (!(key in target)) return true;
            delete target[key];
            if (typeof key !== "symbol") notify(path ? `${path}.${key}` : key, undefined);
            return true;
        },
    });
    byPath.set(path, proxy);
    return proxy;
}

export const Settings = makeProxy(PlainSettings, "");

// ---------- 序列化 ----------
function replacer(_, v) {
    return typeof v === "bigint" ? { [BIGINT_TAG]: v.toString() } : v;
}
function reviver(_, v) {
    if (v && typeof v === "object" && typeof v[BIGINT_TAG] === "string" && Object.keys(v).length === 1) {
        try { return BigInt(v[BIGINT_TAG]); } catch { return 0n; }
    }
    return v;
}
export const serialize = obj => JSON.stringify(obj, replacer);

/** 接受对象、JSON 字符串、二次编码的 JSON 字符串 */
export function parseStored(raw) {
    try {
        let v = raw;
        for (let i = 0; i < 3 && typeof v === "string"; i++) v = JSON.parse(v, reviver);
        if (v && typeof v === "object" && !Array.isArray(v)) {
            // 对象形式也要还原 bigint
            v = JSON.parse(JSON.stringify(v), reviver);
            if (v.plugins && typeof v.plugins === "object" && Object.keys(v.plugins).length > 0) return v;
        }
    } catch { /* 视为没有 */ }
    return null;
}

// ---------- IndexedDB ----------
function idbOpen() {
    return new Promise((resolve, reject) => {
        const idb = W.indexedDB || window.indexedDB;
        if (!idb) return reject(new Error("no indexedDB"));
        const req = idb.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function idbGet(key) {
    const db = await idbOpen();
    try {
        return await new Promise((resolve, reject) => {
            const r = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
    } finally { db.close(); }
}
async function idbSet(key, value) {
    const db = await idbOpen();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally { db.close(); }
}

function lsGet() {
    try { return (W.localStorage || localStorage).getItem(SITE_STORAGE_KEY); } catch { return null; }
}

// ---------- 读取 ----------
function replaceContents(data) {
    for (const k of Object.keys(PlainSettings)) delete PlainSettings[k];
    Object.assign(PlainSettings, data);
    if (!PlainSettings.plugins || typeof PlainSettings.plugins !== "object") PlainSettings.plugins = {};
}

/** 把内存里(就绪前)产生、但读到的数据中没有的键补进去;读到的数据优先 */
function mergeMissing(into, from) {
    for (const k of Object.keys(from)) {
        if (!(k in into)) into[k] = from[k];
        else if (into[k] && from[k] && typeof into[k] === "object" && typeof from[k] === "object" && !Array.isArray(into[k])) mergeMissing(into[k], from[k]);
    }
    return into;
}

/** document-start 同步读取:只在 GM_getValue 同步返回有效数据时使用 */
export function loadSync() {
    if (!GM.get) return false;
    try {
        const raw = GM.get(STORAGE_KEY);
        if (raw && typeof raw.then === "function") return false;
        const data = parseStored(raw);
        if (data) {
            replaceContents(data);
            return true;
        }
    } catch (e) {
        logger.warn("同步读取设置失败", e);
    }
    return false;
}

/** 内容丰富度:设置项数量与数组 / 对象长度,enabled 不计分 */
export function richness(v, key) {
    if (key === "enabled") return 0;
    if (Array.isArray(v)) return 1 + v.reduce((n, x) => n + richness(x), 0);
    if (v && typeof v === "object") return 1 + Object.keys(v).reduce((n, k) => n + richness(v[k], k), 0);
    if (v === "" || v == null) return 0;
    return 1;
}

const isEmpty = v => v == null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

/** 只补主副本里缺的或为空的键;主副本已有的值(包括 enabled)不动 */
function fillFrom(into, from) {
    for (const k of Object.keys(from)) {
        const a = into[k], b = from[k];
        if (!(k in into) || (isEmpty(a) && !isEmpty(b))) into[k] = b;
        else if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) fillFrom(a, b);
    }
    return into;
}

/** 站点存储(IndexedDB、localStorage)按网站分开,只作当前网站的备份:只在有适配的站点上读写,不把设置留在随便访问的网站 */
const useSiteStorage = () => !isGeneric();

export async function loadAsync() {
    const sources = [["GM", async () => GM.get ? await GM.get(STORAGE_KEY) : null]];
    if (useSiteStorage()) sources.push(["IndexedDB", () => idbGet(SITE_STORAGE_KEY)], ["localStorage", lsGet]);
    const found = [];
    for (const [name, read] of sources) {
        try {
            const data = parseStored(await read());
            if (data) found.push({ name, data, score: richness(data) });
        } catch (e) {
            logger.debug(`从 ${name} 读取失败`, e);
        }
    }
    if (found.length) {
        // 最丰富的一份为主,其余副本只补缺
        found.sort((a, b) => b.score - a.score);
        const data = found[0].data;
        for (const f of found.slice(1)) fillFrom(data, f.data);
        const memory = JSON.parse(serialize(PlainSettings), reviver);
        replaceContents(mergeMissing(data, memory));
        logger.info(`设置已从 ${found.map(f => f.name).join(" + ")} 读取`);
    }
    ready = true;
    // 启动过程不落盘:只有之后真正改了设置才写
    return found.length > 0;
}

// ---------- 多标签页同步 ----------
const underDirty = path => {
    for (const d of dirty) if (d === path || d.startsWith(path + ".") || path.startsWith(d + ".")) return true;
    return false;
};

/** 别的标签页保存的整份设置:逐键合并进内存并照常发出变更通知(不触发写入) */
export function applyRemote(data) {
    if (!ready || !data || typeof data !== "object") return 0;
    const changedPaths = [];
    const walk = (target, src, path) => {
        for (const k of Object.keys(src)) {
            const full = path ? `${path}.${k}` : k;
            const a = target[k], b = src[k];
            if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) { walk(a, b, full); continue; }
            if (underDirty(full)) continue;
            if (JSON.stringify(a, replacer) === JSON.stringify(b, replacer)) continue;
            target[k] = b;
            changedPaths.push(full);
            emitChange(full, b);
        }
    };
    walk(PlainSettings, data, "");
    if (changedPaths.length) {
        logger.debug(`已从其他标签页同步 ${changedPaths.length} 项设置`);
        dispatch(Events.SETTINGS_SYNC, { paths: changedPaths });
    }
    return changedPaths.length;
}

/** 整份替换(导入备份):逐项发出变更通知,界面、主题、Quick CSS 即时跟着变,然后写入 */
export function replaceAll(data) {
    const before = JSON.parse(serialize(PlainSettings), reviver);
    replaceContents(data);
    const paths = [];
    const diff = (a, b, path) => {
        const isObj = v => v && typeof v === "object" && !Array.isArray(v);
        if (isObj(a) && isObj(b)) {
            for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], path ? `${path}.${k}` : k);
            return;
        }
        if (JSON.stringify(a, replacer) !== JSON.stringify(b, replacer)) paths.push(path);
    };
    diff(before, PlainSettings, "");
    for (const path of paths) {
        const v = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), PlainSettings);
        emitChange(path, v);
        if (ready) dirty.add(path);
    }
    scheduleSave();
    return paths.length;
}

let syncInstalled = false;
export function installCrossTabSync() {
    if (syncInstalled) return;
    syncInstalled = true;
    if (GM.addListener) {
        try {
            GM.addListener(STORAGE_KEY, (_name, _old, value, remote) => {
                if (!remote) return;
                const data = parseStored(value);
                if (data) applyRemote(data);
            });
        } catch (e) { logger.debug("监听脚本管理器存储失败", e); }
    }
    if (useSiteStorage()) {
        W.addEventListener("storage", e => {
            if (e.key !== SITE_STORAGE_KEY || e.newValue == null) return;
            const data = parseStored(e.newValue);
            if (data) applyRemote(data);
        });
    }
}

// ---------- 写入 ----------
export async function saveNow() {
    if (!ready) return;
    if (!PlainSettings.plugins || Object.keys(PlainSettings.plugins).length === 0) return;
    let json;
    try { json = serialize(PlainSettings); } catch (e) { logger.warn("设置序列化失败", e); return; }
    dirty.clear();
    pendingSave = false;
    // 三处都写:卸载脚本清空 GM 存储后,还能从站点存储救回
    if (GM.set) {
        try {
            try {
                const r = GM.set(STORAGE_KEY, JSON.parse(json));
                if (r && typeof r.then === "function") await r;
            } catch {
                const r = GM.set(STORAGE_KEY, json);
                if (r && typeof r.then === "function") await r;
            }
        } catch (e) { logger.warn("写入设置失败", e); }
    }
    if (!useSiteStorage()) return;
    try { (W.localStorage || localStorage).setItem(SITE_STORAGE_KEY, json); } catch (e) { logger.debug("写入 localStorage 备份失败", e); }
    try { await idbSet(SITE_STORAGE_KEY, json); } catch (e) { logger.debug("写入 IndexedDB 备份失败", e); }
}

let pendingSave = false;
const debouncedSave = debounce(() => { saveNow(); }, 100);
const scheduleSave = Object.assign(() => { pendingSave = true; debouncedSave(); }, { cancel: () => debouncedSave.cancel() });

/** 离开页面时补存;pagehide 覆盖往返缓存和移动端切走,和 beforeunload 一起只写一次 */
export function installUnloadSave() {
    const flush = () => {
        if (!pendingSave) return;
        scheduleSave.cancel();
        saveNow();
    };
    W.addEventListener("beforeunload", flush);
    W.addEventListener("pagehide", flush);
}
