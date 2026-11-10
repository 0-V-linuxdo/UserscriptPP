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
// 由插件管理器注入:这个名字是不是本页已注册的插件(别的标签页删掉整条设置时,已注册的只重置为默认值,不删)
let isRegisteredPlugin = () => false;
export function setPluginRegistry(fn) { isRegisteredPlugin = fn; }

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

// ---------- 明确设置过的项 ----------
// plugins.<名>.<键> 里用户(或插件)真的写过的项。读取时由默认值补上的不算,保存时不存;
// 写过的哪怕等于默认值也存(和 VS Code 配置的 userValue / defaultValue 一样分开),以后改默认值不影响它。
// 不落盘:存下来的项就是写过的,读取时整份重建
const explicit = new Set();
function markExplicit(path, value) {
    const parts = path.split(".");
    if (parts[0] !== "plugins") return;
    if (parts.length === 1) { markExplicitFrom({ plugins: value }); return; }
    if (parts.length === 2) {
        const prefix = path + ".";
        for (const k of [...explicit]) if (k.startsWith(prefix)) explicit.delete(k);
        if (value && typeof value === "object" && !Array.isArray(value)) for (const k of Object.keys(value)) explicit.add(prefix + k);
        return;
    }
    const key = parts.slice(0, 3).join(".");
    if (parts.length === 3 && value === undefined) explicit.delete(key);
    else explicit.add(key);
}
function markExplicitFrom(data) {
    explicit.clear();
    const plugins = data?.plugins;
    if (!plugins || typeof plugins !== "object") return;
    for (const [name, entry] of Object.entries(plugins)) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) for (const k of Object.keys(entry)) explicit.add(`plugins.${name}.${k}`);
    }
}
export const isExplicitSetting = (plugin, key) => explicit.has(`plugins.${plugin}.${key}`);

function notify(path, value) {
    markExplicit(path, value);
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
    /** 直接改了 PlainSettings 之后调用:给出改动的路径时按普通写入处理(记为本页未落盘的改动,不会被别的标签页的同步盖掉) */
    markAsChanged(path) {
        if (typeof path === "string" && path) {
            const v = getPath(PlainSettings, path);
            markExplicit(path, v);
            if (ready) dirty.add(path);
            emitChange(path, v);
        } else for (const fn of [...globalListeners]) callSafe(fn, PlainSettings, "");
        scheduleSave();
    },
};

const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

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
                    const def = defaultOf(parts[1], parts[2]);
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

/** 插件设置的默认值:每次给一份新的(对象默认值被就地修改时不会改到插件定义里的那份) */
function defaultOf(plugin, key) {
    const def = defaultResolver(plugin, key);
    return def !== null && typeof def === "object" ? JSON.parse(serialize(def), reviver) : def;
}
const isDefault = (plugin, key, value) => {
    const def = defaultResolver(plugin, key);
    return def !== undefined && serialize(def) === serialize(value);
};

/** 要存下来的内容:插件设置里没明确设置过、又和默认值相同的项不存(内存里照旧有)。
 *  这样以后改了默认值,没动过这一项的用户会跟着变;明确设置过的(哪怕等于默认值)照存;读取时缺的项由默认值补上 */
function persistable() {
    const out = { ...PlainSettings };
    const plugins = PlainSettings.plugins;
    if (plugins && typeof plugins === "object") {
        out.plugins = {};
        for (const [name, entry] of Object.entries(plugins)) {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) { out.plugins[name] = entry; continue; }
            const kept = {};
            for (const [k, v] of Object.entries(entry)) if (explicit.has(`plugins.${name}.${k}`) || !isDefault(name, k, v)) kept[k] = v;
            out.plugins[name] = kept;
        }
    }
    return out;
}

/**
 * 每份存下来的设置带:保存时间 $savedAt(毫秒,只作显示和旧副本排序)、版本号 $rev(每次保存在已知最大值上加一,不依赖时钟)、
 * 写入者 $writer(每个标签页启动时随机生成)。版本 = (rev, writer) 按字典序比较:两个标签页同时写出同一个 rev 时,
 * 所有标签页都认 writer 较大的那份(Lamport 时钟加节点 id 的做法),不再看墙钟
 */
const SAVED_AT = "$savedAt";
const REV = "$rev";
const WRITER = "$writer";
const META_KEYS = [SAVED_AT, REV, WRITER];
export const savedAtOf = data => (data && Number(data[SAVED_AT])) || 0;
export const revOf = data => (data && Number(data[REV])) || 0;
const writerOf = data => (data && typeof data[WRITER] === "string" ? data[WRITER] : "");
const verOf = data => ({ rev: revOf(data), writer: writerOf(data) });
/** 版本比较:先比 rev,再比 writer */
const cmpVer = (a, b) => (a.rev - b.rev) || (a.writer < b.writer ? -1 : a.writer > b.writer ? 1 : 0);
/** 本标签页的写入者 id */
const TAB_WRITER = (() => {
    try { if (W.crypto?.randomUUID) return W.crypto.randomUUID().replace(/-/g, "").slice(0, 16); } catch { /* 忽略 */ }
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
})();


/** 接受对象、JSON 字符串、二次编码的 JSON 字符串 */

export function parseStored(raw) {
    try {
        let v = raw;
        for (let i = 0; i < 3 && typeof v === "string"; i++) v = JSON.parse(v, reviver);
        if (v && typeof v === "object" && !Array.isArray(v)) {
            // 对象形式也要还原 bigint
            v = JSON.parse(JSON.stringify(v), reviver);
            // 保存时间和版本号不算设置:挪到不可枚举的属性上,合并、同步、导出都看不到它们
            for (const k of META_KEYS) {
                const n = k === WRITER ? (typeof v[k] === "string" ? v[k] : "") : (Number(v[k]) || 0);
                delete v[k];
                Object.defineProperty(v, k, { value: n, enumerable: false, configurable: true });
            }
            // localStorage 镜像里的版本信息不算设置
            delete v.$mirror;
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

/** 同步读取时读到的那份(副本);异步读取挑出更新的一份时,内存里从它来的内容不再补回去 */
let syncBase = null;

/** 去掉 from 里和 base 相同的部分,剩下就绪前真正新产生的内容 */
function withoutSame(from, base) {
    if (!base || typeof base !== "object") return from;
    for (const k of Object.keys(from)) {
        if (!(k in base)) continue;
        const a = from[k], b = base[k];
        if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
            withoutSame(a, b);
            if (Object.keys(a).length === 0) delete from[k];
        } else if (JSON.stringify(a, replacer) === JSON.stringify(b, replacer)) delete from[k];
    }
    return from;
}

/** document-start 同步读取:只在 GM_getValue 同步返回有效数据时使用 */
/** 脚本管理器只有异步读取(Greasemonkey 4、FireMonkey 等)时为 true:同步阶段读不到设置,改用启动快照 */
let asyncOnlyGm = false;
const BOOT_KEY = `${SITE_STORAGE_KEY}:boot`;

export function loadSync() {
    if (!GM.get) { asyncOnlyGm = true; return false; }
    try {
        const probe = GM.get(META_KEY);
        if (probe && typeof probe.then === "function") { asyncOnlyGm = true; return false; }
        const v2 = readV2();
        let data = null;
        if (v2) { data = v2.data; adoptV2(v2); }
        else {
            // 旧格式(整份一个键):读出来用,就绪后按新格式写一遍
            const raw = GM.get(STORAGE_KEY);
            if (raw && typeof raw.then === "function") { asyncOnlyGm = true; return false; }
            data = parseStored(raw);
            if (data) migrate = true;
        }
        if (data && data.plugins && Object.keys(data.plugins).length) {
            syncBase = JSON.parse(serialize(data), reviver);
            const pre = [...explicit];
            replaceContents(data);
            markExplicitFrom(data);
            for (const k of pre) explicit.add(k);
            return true;
        }
    } catch (e) {
        logger.warn("同步读取设置失败", e);
    }
    return false;
}

/**
 * 启动快照:管理器只有异步读取时,同步阶段拿不到设置,补丁计划却必须在这时定下。
 * 和 Vencord 网页版一样,在站点 localStorage 里另存一份各插件的开关(只有开关),同步读它;每次保存、收到别的标签页的写入后更新(不会跨站点过时)。
 * 由站点驱动的启动流程在选好站点后、登记补丁前调用;同步读取成功时不用它
 */
export function applyBootSnapshot() {
    if (!useSiteStorage()) return false;
    let snap;
    try { snap = JSON.parse((W.localStorage || localStorage).getItem(BOOT_KEY) || "null"); } catch { return false; }
    const enabled = snap && typeof snap.enabled === "object" ? snap.enabled : null;
    if (!enabled) return false;
    const base = { plugins: {} };
    for (const [name, on] of Object.entries(enabled)) {
        if (typeof on !== "boolean") continue;
        (PlainSettings.plugins[name] ??= {}).enabled = on;
        base.plugins[name] = { enabled: on };
    }
    // 异步读取时这些开关不算"本页新产生的",以读到的完整设置为准
    syncBase = base;
    return true;
}

function writeBootSnapshot() {
    // 同步读取可用的管理器上不需要(GM 为空时救回后会写回 GM,下次同步读得到);localStorage 是同步写入,能不写就不写
    if (!ready || !asyncOnlyGm || !useSiteStorage()) return;
    const enabled = {};
    for (const [name, entry] of Object.entries(PlainSettings.plugins || {})) {
        if (typeof entry?.enabled === "boolean") enabled[name] = entry.enabled;
    }
    try { (W.localStorage || localStorage).setItem(BOOT_KEY, JSON.stringify({ enabled })); } catch { /* 忽略 */ }
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


/**
 * 读取完整设置。脚本管理器存储(GM)是唯一权威:GM 里有带版本的设置就只用它,站点里的 IndexedDB / localStorage 副本只是备份,
 * 只在 GM 没有内容(卸载重装、清空存储)或 GM 里是旧版本写的、没有版本号的副本时才拿来比较和救回;救回后立即写回 GM
 */
export async function loadAsync() {
    let v2 = null, legacy = null;
    try {
        v2 = await awaitMaybe(readV2());
        if (!v2 && GM.get) legacy = parseStored(await awaitMaybe(GM.get(STORAGE_KEY)));
    } catch (e) { logger.debug("从 GM 读取失败", e); }
    if (v2 && !Object.keys(v2.data.plugins).length) v2 = null;
    const stamped = d => !!(revOf(d) || savedAtOf(d));
    let chosen = null, restored = false;
    if (v2) {
        adoptV2(v2);
        chosen = { name: "GM", data: v2.data };
        // 镜像只"快进":它是从 GM 现在那个版本接着写下来的(base 等于 GM 的版本)、又比 GM 新,说明 GM 没落盘这次写入(例如关页面时),用镜像的并补写回 GM
        const m = readMirror();
        if (m) for (const [part, ver] of m.vers) {
            const gmVer = v2.vers.get(part) || noVer;
            const base = m.base.get(part);
            if (!base || cmpVer(ver, gmVer) <= 0 || cmpVer(base, gmVer) !== 0) continue;
            if (part === META) Object.assign(chosen.data, metaContentOf(m.doc));
            else if (m.doc.plugins[part] !== undefined) chosen.data.plugins[part] = m.doc.plugins[part];
            else delete chosen.data.plugins[part];
            forceParts.add(part);
            lastBody.delete(part);
            restored = true;
            logger.info(`本页上次写入的 ${part === META ? "顶层设置" : part} 没落到脚本管理器存储里,已从本站镜像补回`);
        }
    } else if (legacy && stamped(legacy)) { chosen = { name: "GM", data: legacy }; migrate = true; }
    else {
        const found = legacy ? [{ name: "GM", data: legacy, rev: revOf(legacy), at: savedAtOf(legacy), score: richness(legacy) }] : [];
        if (useSiteStorage()) {
            for (const [name, read] of [["IndexedDB", () => idbGet(SITE_STORAGE_KEY)], ["localStorage", lsGet]]) {
                try {
                    const data = parseStored(await read());
                    if (data) found.push({ name, data, rev: revOf(data), at: savedAtOf(data), score: richness(data) });
                } catch (e) {
                    logger.debug(`从 ${name} 读取失败`, e);
                }
            }
        }
        if (found.length) {
            // 带版本 / 保存时间的优先;全都没有时按旧办法,最丰富的一份为主、其余只补缺(升级前的副本)
            found.sort((a, b) => (b.rev - a.rev) || (b.at - a.at) || (b.score - a.score));
            chosen = found[0];
            if (!chosen.at && !chosen.rev) for (const f of found.slice(1)) fillFrom(chosen.data, f.data);
            restored = chosen.name !== "GM";
            migrate = true;
        }
    }
    if (chosen) {
        const data = chosen.data;
        // 就绪前内存里新产生的(插件默认值、早期写入)补进去;同步读取时从(可能较旧的)GM 副本带进来的不补
        const memory = withoutSame(JSON.parse(serialize(PlainSettings), reviver), syncBase);
        syncBase = null;
        const pre = [...explicit];
        markExplicitFrom(data);
        for (const k of pre) explicit.add(k);
        replaceContents(mergeMissing(data, memory));
        logger.info(`设置已从 ${chosen.name} 读取`);
    }
    ready = true;
    writeBootSnapshot();
    if ((restored || migrate) && GM.set) {
        // GM 里没有(或是旧格式、或镜像补回了一部分):写回 GM(之后别的站点也能读到)
        if (restored) logger.info(`已从本站的 ${chosen.name === "GM" ? "镜像" : chosen.name} 救回设置并写回脚本管理器存储`);
        scheduleSave();
    }
    for (const [part, x] of [...pendingParts]) { pendingParts.delete(part); applyRemotePart(part, x.content, x.ver, x.extra); }
    // 启动过程不落盘:只有之后真正改了设置才写(救回、迁移的除外)
    return !!chosen;
}

// ---------- 存储布局(第 2 版:按插件分键) ----------
// GM 里:META_KEY 存顶层设置(不含 plugins)和已知插件的名单 $parts;每个插件的设置单独存在 PART_PREFIX + 名字。
// 每一份(part)各带自己的版本 ($rev, $writer):两个标签页改不同插件的设置不再冲突,同一份冲突时影响面只有这一份。
// 旧版本的整份设置(STORAGE_KEY)只在新格式不存在时读一次并迁移,之后不再写它(旧版本脚本的标签页刷新后才看到新设置)。
export const META_KEY = `${STORAGE_KEY}:meta`;
export const PART_PREFIX = `${STORAGE_KEY}:p:`;
const META = "$meta";
const FORMAT = 2;
const partKey = part => (part === META ? META_KEY : PART_PREFIX + part);
/** 路径属于哪一份:顶层键 -> 元信息;plugins.<名>... -> 那个插件;plugins 本身 -> 全部插件 */
function partsOfPath(path) {
    const parts = path.split(".");
    if (parts[0] !== "plugins") return [META];
    if (parts.length === 1) return Object.keys(PlainSettings.plugins || {});
    return [parts[1]];
}
const noVer = { rev: 0, writer: "" };
const partVer = new Map();   // 份 -> 本页内存里那份的版本(读到的、收到的、自己写的)
const lastBody = new Map();  // 份 -> 存储里现在那份的内容(序列化,不含版本);没变就不写
const knownParts = new Set(); // 存储里出现过的插件份(只增不减,删除用墓碑)
let migrate = false;          // 读到的是旧格式或从站点备份救回:就绪后整份按新格式写一遍

/** 读一份存储值:对象或 JSON 字符串;返回 { content, ver } 或 null */
function parsePart(raw) {
    try {
        let v = raw;
        for (let i = 0; i < 3 && typeof v === "string"; i++) v = JSON.parse(v, reviver);
        if (!v || typeof v !== "object" || Array.isArray(v)) return null;
        v = JSON.parse(JSON.stringify(v), reviver);
        const ver = { rev: Number(v[REV]) || 0, writer: typeof v[WRITER] === "string" ? v[WRITER] : "" };
        const out = { content: v, ver, savedAt: Number(v[SAVED_AT]) || 0, parts: Array.isArray(v.$parts) ? v.$parts.filter(x => typeof x === "string") : [], deleted: v.$deleted === true };
        for (const k of [...META_KEYS, "$parts", "$v", "$deleted"]) delete v[k];
        // 插件设置不是对象时(少见)包在 $value 里
        if (Object.keys(v).length === 1 && "$value" in v) out.content = v.$value;
        return out;
    } catch { return null; }
}
/** 同步读一份;管理器的读取是异步的时返回 Promise */
function readPart(part) {
    if (!GM.get) return null;
    try {
        const raw = GM.get(partKey(part));
        if (raw && typeof raw.then === "function") return raw.then(parsePart, () => null);
        return parsePart(raw);
    } catch { return null; }
}
const awaitMaybe = async v => (v && typeof v.then === "function" ? await v : v);

/** 从 GM 读出第 2 版的整份设置:{ data, vers: Map, parts: Set } 或 null(没有新格式);同步接口直接返回,异步接口返回 Promise */
function readV2() {
    const meta = readPart(META);
    const build = async metaV => {
        if (!metaV) return null;
        const data = { ...metaV.content, plugins: {} };
        const vers = new Map([[META, metaV.ver]]);
        const parts = new Set(metaV.parts);
        for (const name of parts) {
            const p = await awaitMaybe(readPart(name));
            if (!p) continue;
            vers.set(name, p.ver);
            if (!p.deleted) data.plugins[name] = p.content;
        }
        return { data, vers, parts, savedAt: metaV.savedAt };
    };
    if (meta && typeof meta.then === "function") return meta.then(build);
    // 同步路径:各份也同步读
    if (!meta) return null;
    const data = { ...meta.content, plugins: {} };
    const vers = new Map([[META, meta.ver]]);
    const parts = new Set(meta.parts);
    for (const name of parts) {
        const p = readPart(name);
        if (!p || typeof p.then === "function") continue;
        vers.set(name, p.ver);
        if (!p.deleted) data.plugins[name] = p.content;
    }
    return { data, vers, parts, savedAt: meta.savedAt };
}
function adoptV2(v2) {
    for (const [k, v] of v2.vers) partVer.set(k, v);
    for (const n of v2.parts) knownParts.add(n);
    lastBody.clear();
    lastBody.set(META, serialize(metaContentOf(v2.data)));
    for (const n of v2.parts) if (v2.data.plugins[n]) lastBody.set(n, serialize(v2.data.plugins[n]));
}
const metaContentOf = data => { const out = { ...data }; delete out.plugins; return out; };

/** 要存下来的一份:插件设置里没明确设置过、又等于默认值的项不存;整条插件设置不存在时为 undefined(写墓碑) */
function persistablePart(part) {
    if (part === META) return metaContentOf(PlainSettings);
    const entry = PlainSettings.plugins?.[part];
    if (entry === undefined) return undefined;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const kept = {};
    for (const [k, v] of Object.entries(entry)) if (explicit.has(`plugins.${part}.${k}`) || !isDefault(part, k, v)) kept[k] = v;
    return kept;
}
const sortedParts = () => [...knownParts].sort();
/** 一份的"内容指纹":元信息带上插件名单,插件份不存在时是墓碑 */
const bodyOf = (part, content) => (part === META ? serialize({ ...content, $parts: sortedParts() }) : content === undefined ? "$deleted" : serialize(content));

// ---------- 多标签页同步 ----------
const under = (set, path) => {
    for (const d of set) if (d === path || d.startsWith(path + ".") || path.startsWith(d + ".")) return true;
    return false;
};
const getRel = (obj, rel) => (rel === "" ? obj : getPath(obj, rel));
const prefixOf = part => (part === META ? "" : `plugins.${part}`);
const relOf = (part, p) => { const pre = prefixOf(part); return pre === "" ? p : p === pre ? "" : p.slice(pre.length + 1); };

/**
 * 本页写出、还没确认的那次保存,按份记:{ ver, base, paths: Map<路径, 写出的值> }。
 * base 是写之前那份的内容(三方合并的基准)。别的标签页在同一个基准上同时写了同一个 rev 时,
 * 双方按版本决胜:对方没动过的路径保留本页的,双方都改了的听版本大的;本页还有没被对方带上的改动就再写一次
 */
const inflight = new Map();
const forceParts = new Set(); // 没有改动、但存储里可能是过时的一份,下次保存要重写
let reasserts = 0;
const MAX_REASSERTS = 3;
const VERIFY_MS = 400;
let verifyTimer = 0;
const pendingParts = new Map(); // 就绪前收到的

function protectAndReassert(paths) {
    if (!paths.length) { reasserts = 0; return; }
    if (++reasserts > MAX_REASSERTS) { logger.warn(`设置和别的标签页反复冲突,已放弃重写:${paths.join(", ")}`); reasserts = 0; return; }
    for (const p of paths) { dirty.add(p); for (const part of partsOfPath(p)) lastBody.delete(part); }
    scheduleSave();
}

/**
 * 别处写来的一份比本页的旧:存储里可能就是这份旧的。过一会儿再确认(本页可能先从广播、镜像知道了新版本,
 * 管理器的值变化通知还在路上,马上读本页的 GM 缓存会误判),确认还是旧的才在下次保存时重写
 */
const staleTimers = new Map();
function staleSeen(part) {
    if (staleTimers.has(part)) return;
    staleTimers.set(part, setTimeout(async () => {
        staleTimers.delete(part);
        const cur = partVer.get(part) || noVer;
        let r;
        try { r = await awaitMaybe(readPart(part)); } catch { r = null; }
        if (r && cmpVer(r.ver, cur) >= 0) {
            if (cmpVer(r.ver, cur) > 0) applyRemotePart(part, r.deleted ? undefined : r.content, r.ver, { parts: r.parts, deleted: r.deleted });
            return;
        }
        forceParts.add(part);
        lastBody.delete(part);
        scheduleSave();
    }, VERIFY_MS));
}

/** 把别的标签页写的一份合并进内存(逐键,照常发变更通知;本页没落盘的改动不被盖掉)。返回变了几项 */
export function applyRemotePart(part, content, ver, extra = {}) {
    if (!part || !ver) return 0;
    if (!ready) {
        const prev = pendingParts.get(part);
        if (!prev || cmpVer(ver, prev.ver) > 0) pendingParts.set(part, { content, ver, extra });
        return 0;
    }
    // 元信息带来的插件名单只增不减:新出现的插件份,读进来并开始监听
    const discovered = [];
    if (part === META && Array.isArray(extra.parts)) for (const n of extra.parts) if (!knownParts.has(n)) { knownParts.add(n); discovered.push(n); }
    const cur = partVer.get(part) || noVer;
    const fromOther = ver.writer !== TAB_WRITER;
    const fl = inflight.get(part);
    const sibling = !!(fl && fromOther && ver.rev && ver.rev === fl.ver.rev);
    const c = cmpVer(ver, cur);
    let changed = 0;
    if (sibling || c > 0) changed = mergePart(part, content, ver, extra, fl, sibling);
    else if (c < 0 && fromOther) staleSeen(part);
    for (const n of discovered) { watchPart(n); catchUpPart(n); }
    return changed;
}

function mergePart(part, content, ver, extra, fl, sibling) {
    if (fl && !sibling && ver.rev > fl.ver.rev) inflight.delete(part); // 对方在本页这次写入之后写的:已包含它
    const protect = new Set(dirty);
    const keep = [];
    if (sibling) {
        const theirsWin = cmpVer(ver, fl.ver) > 0;
        for (const [p, ours] of fl.paths) {
            const rel = relOf(part, p);
            const theirs = content == null ? undefined : getRel(content, rel);
            const changedByThem = !fl.base || serialize(theirs ?? null) !== serialize((fl.base && getRel(fl.base, rel)) ?? null);
            if (changedByThem && theirsWin) continue; // 双方都改了,听版本大的
            protect.add(p);
            if (serialize(theirs ?? null) !== serialize(ours ?? null)) keep.push(p);
        }
        inflight.delete(part);
    }
    const cur = partVer.get(part) || noVer;
    if (cmpVer(ver, cur) > 0) partVer.set(part, ver);
    const deleted = !!extra.deleted || (part !== META && content == null);
    // 收到的就是存储里现在的内容:之后判断"没变就不写"要和它比
    if (part === META) lastBody.set(META, serialize({ ...content, $parts: [...new Set(extra.parts || [])].sort() }));
    else lastBody.set(part, deleted ? "$deleted" : serialize(content));
    const changedPaths = [];
    const removed = (full, gone) => {
        if (gone && typeof gone === "object" && !Array.isArray(gone) && Object.keys(gone).length) {
            for (const k of Object.keys(gone)) removed(`${full}.${k}`, gone[k]);
            return;
        }
        changedPaths.push(full);
        emitChange(full, undefined);
    };
    const walk = (target, src, path) => {
        for (const k of Object.keys(src)) {
            if (path === "" && k === "plugins") continue;
            const full = path ? `${path}.${k}` : k;
            const a = target[k], b = src[k];
            if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) { walk(a, b, full); continue; }
            if (under(protect, full)) continue;
            markExplicit(full, b);
            if (JSON.stringify(a, replacer) === JSON.stringify(b, replacer)) continue;
            target[k] = b;
            changedPaths.push(full);
            emitChange(full, b);
        }
        // 别的标签页删掉的键:本地有、收到的没有、本地又没改过的,也删掉(这一份的版本更新,对方看到过本页知道的全部内容)
        for (const k of Object.keys(target)) {
            if (Object.prototype.hasOwnProperty.call(src, k)) continue;
            if (path === "" && k === "plugins") continue;
            const full = path ? `${path}.${k}` : k;
            if (under(protect, full)) continue;
            const parts = full.split(".");
            // 插件设置里缺的项是"等于默认值"(保存时不存默认值),不是删掉
            if (parts.length === 3 && parts[0] === "plugins") {
                explicit.delete(full);
                const def = defaultOf(parts[1], parts[2]);
                if (def !== undefined) {
                    if (serialize(target[k]) === serialize(def)) continue;
                    target[k] = def;
                    changedPaths.push(full);
                    emitChange(full, def);
                    continue;
                }
            }
            const gone = target[k];
            delete target[k];
            removed(full, gone);
        }
    };
    if (part === META) walk(PlainSettings, content || {}, "");
    else {
        const full = `plugins.${part}`;
        const plugins = PlainSettings.plugins;
        if (deleted && !isRegisteredPlugin(part)) {
            // 整条插件设置被删(墓碑):本页没注册这个插件的,条目也删
            if (plugins[part] !== undefined && !under(protect, full)) {
                const gone = plugins[part];
                delete plugins[part];
                markExplicit(full, undefined);
                removed(full, gone);
            }
        } else {
            // 本页已注册的插件被删了整条:只重置为默认值(它正在用 settings.store),不删条目
            const target = plugins[part] && typeof plugins[part] === "object" && !Array.isArray(plugins[part]) ? plugins[part] : (plugins[part] = {});
            const src = deleted ? {} : content;
            if (src && typeof src === "object" && !Array.isArray(src)) walk(target, src, full);
            else if (!under(protect, full) && JSON.stringify(plugins[part], replacer) !== JSON.stringify(src, replacer)) { plugins[part] = src; changedPaths.push(full); emitChange(full, src); }
        }
    }
    if (changedPaths.length) {
        logger.debug(`已从其他标签页同步 ${changedPaths.length} 项设置`);
        dispatch(Events.SETTINGS_SYNC, { paths: changedPaths });
    }
    if (sibling) {
        if (keep.length) logger.debug(`和别的标签页同时保存,重写本页的 ${keep.length} 项`);
        protectAndReassert(keep);
    }
    writeBootSnapshot();
    return changedPaths.length;
}

/** 整份替换(导入备份):逐项发出变更通知,界面、主题、Quick CSS 即时跟着变,然后写入 */
export function replaceAll(data) {
    const before = JSON.parse(serialize(PlainSettings), reviver);
    replaceContents(data);
    markExplicitFrom(PlainSettings);
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


// ---------- 同 origin 的协调:Web Locks 串行写入、BroadcastChannel 传内容、localStorage 镜像 ----------
// 有值变化监听的管理器(TM / VM)靠监听同步;没有的(AdGuard)靠这里:写入在同一 origin 的锁里串行做,写完把新内容广播给别的标签页,
// 再写一份同步可读的 localStorage 镜像(storage 事件也会通知别的标签页)。这些都是页面自己的接口,不依赖脚本管理器
const CHANNEL = `uspp-settings:${SCRIPT_ID}`;
let channel = null;
const openWriters = new Map(); // 别的标签页:开始写、还没写完的(写入者 -> 开始时间)
function getChannel() {
    if (channel !== null) return channel || null;
    channel = false;
    try {
        const BC = W.BroadcastChannel || (typeof BroadcastChannel !== "undefined" ? BroadcastChannel : null);
        if (!BC) return null;
        channel = new BC(CHANNEL);
        channel.onmessage = e => onChannel(e.data);
    } catch { channel = false; }
    return channel || null;
}
function post(msg) { try { getChannel()?.postMessage({ ...msg, w: TAB_WRITER }); } catch { /* 忽略 */ } }
function onChannel(m) {
    if (!m || typeof m !== "object" || m.w === TAB_WRITER) return;
    if (m.t === "begin") { openWriters.set(m.w, Date.now()); return; }
    if (m.t !== "done") return;
    openWriters.delete(m.w);
    for (const x of Array.isArray(m.parts) ? m.parts : []) {
        if (!x || typeof x.part !== "string" || !x.ver) continue;
        let content;
        try { content = x.body == null ? undefined : JSON.parse(x.body, reviver); } catch { continue; }
        applyRemotePart(x.part, content, { rev: Number(x.ver.rev) || 0, writer: String(x.ver.writer || "") }, { parts: x.parts, deleted: !!x.deleted });
    }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** 拿到锁后:上一个持锁的标签页如果还没把它写的内容广播到,最多等 300 ms */
async function waitOpenWriters() {
    const t0 = Date.now();
    for (;;) {
        const now = Date.now();
        for (const [w, at] of openWriters) if (now - at > 1500) openWriters.delete(w);
        if (!openWriters.size || now - t0 > 300) return;
        await sleep(10);
    }
}
const LOCK = `uspp-settings:${SCRIPT_ID}`;
const lockManager = () => { try { return W.navigator?.locks?.request ? W.navigator.locks : null; } catch { return null; } };
export const hasWriteLock = () => !!lockManager();
/** 在同 origin 的锁里执行;没有 Web Locks 或 3 秒拿不到锁时直接执行(退回先读后合并再写 + 写后核对) */
async function withLock(fn) {
    const L = lockManager();
    if (!L) return fn(false);
    let granted = false;
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => { if (!granted) ac.abort(); }, 3000) : 0;
    try {
        return await L.request(LOCK, ac ? { signal: ac.signal } : {}, async () => { granted = true; clearTimeout(timer); return fn(true); });
    } catch (e) {
        if (granted) throw e;
        logger.debug("拿不到设置写入锁,直接写", e);
        return fn(false);
    } finally { clearTimeout(timer); }
}

/** localStorage 镜像:整份设置 + 各份版本 + 写之前 GM 里那份的版本(base)。只在有适配的站点上用 */
const MIRROR = "$mirror";
function readMirror() {
    if (!useSiteStorage()) return null;
    try {
        const raw = (W.localStorage || localStorage).getItem(SITE_STORAGE_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw, reviver);
        const m = v && v[MIRROR];
        if (!m || m.v !== FORMAT || typeof m.vers !== "object") return null;
        const doc = { ...v };
        for (const k of [...META_KEYS, MIRROR]) delete doc[k];
        if (!doc.plugins || typeof doc.plugins !== "object") doc.plugins = {};
        const ver = x => (Array.isArray(x) ? { rev: Number(x[0]) || 0, writer: String(x[1] || "") } : null);
        const vers = new Map(Object.entries(m.vers).map(([k, x]) => [k, ver(x)]).filter(([, x]) => x));
        const base = new Map(Object.entries(m.base || {}).map(([k, x]) => [k, ver(x)]).filter(([, x]) => x));
        return { doc, vers, base, parts: Array.isArray(m.parts) ? m.parts : [] };
    } catch { return null; }
}
function writeMirror(bases) {
    if (!useSiteStorage()) return;
    const vers = {}, base = {};
    for (const [k, v] of partVer) vers[k] = [v.rev, v.writer];
    for (const [k, v] of bases) base[k] = [v.rev, v.writer];
    // 没写的份 base 等于自己的版本(不会被误当成"GM 丢了这次写入")
    for (const k of Object.keys(vers)) if (!(k in base)) base[k] = vers[k];
    try {
        const doc = persistable();
        const rev = Math.max(0, ...[...partVer.values()].map(v => v.rev));
        (W.localStorage || localStorage).setItem(SITE_STORAGE_KEY, serialize({ ...doc, [SAVED_AT]: Date.now(), [REV]: rev, [WRITER]: TAB_WRITER, [MIRROR]: { v: FORMAT, vers, base, parts: sortedParts() } }));
    } catch (e) { logger.debug("写入 localStorage 镜像失败", e); }
}
/** 镜像里比本页新的份合并进来(AdGuard 等没有值变化监听时,别的标签页的写入从这里、从广播到达) */
function applyMirror(m) {
    if (!m) return;
    for (const [part, ver] of m.vers) {
        if (cmpVer(ver, partVer.get(part) || noVer) <= 0) continue;
        if (part === META) applyRemotePart(META, metaContentOf(m.doc), ver, { parts: m.parts });
        else applyRemotePart(part, m.doc.plugins[part], ver, { deleted: m.doc.plugins[part] === undefined });
    }
}

// ---------- 写入 ----------
// 网站存储(IndexedDB)只是备份(卸载脚本清空 GM 存储后救回用):合并到 2 秒写一次,离开页面时补写
const SITE_BACKUP_DELAY = 2000;
let siteTimer = 0, siteJson = null, lastSiteBody = null;

function setPart(part, value) {
    const json = serialize(value);
    try {
        return GM.set(partKey(part), JSON.parse(json));
    } catch {
        return GM.set(partKey(part), json);
    }
}

/** 这次要写的份:改动涉及的、要强制重写的、迁移时的全部;内容和存储里一样的不写 */
function planWrites(wrote) {
    const touched = new Set(forceParts);
    if (migrate) { touched.add(META); for (const n of Object.keys(PlainSettings.plugins || {})) touched.add(n); }
    for (const p of wrote) for (const part of partsOfPath(p)) touched.add(part);
    const out = [];
    // 插件份先写,元信息(带插件名单)最后写:别的标签页看到名单里的新插件时,它那份已经在了
    const order = [...touched].filter(p => p !== META).concat(touched.has(META) ? [META] : []);
    for (const part of order) {
        const content = persistablePart(part);
        // 从没存过、又是空的插件份不写(全是默认值)
        if (part !== META && !knownParts.has(part) && (content === undefined || (content && typeof content === "object" && !Array.isArray(content) && !Object.keys(content).length))) continue;
        if (part !== META && !knownParts.has(part)) { knownParts.add(part); watchPart(part); }
        out.push({ part, content });
    }
    // 名单变了,元信息也要写
    if (!touched.has(META) && bodyOf(META, persistablePart(META)) !== lastBody.get(META)) out.push({ part: META, content: persistablePart(META) });
    // 要强制重写的(镜像补回、冲突后重申)照写:这时 lastBody 记的可能是镜像里的内容,不是 GM 里的
    return out.filter(w => forceParts.has(w.part) || bodyOf(w.part, w.content) !== lastBody.get(w.part));
}

/** 写一份;返回写入用的 Promise(异步管理器)或 null。失败抛出 */
function writeOne(w, wrote) {
    const prev = partVer.get(w.part) || noVer;
    const ver = { rev: prev.rev + 1, writer: TAB_WRITER };
    const meta = { [REV]: ver.rev, [WRITER]: ver.writer };
    let value;
    if (w.part === META) value = { ...w.content, ...meta, [SAVED_AT]: Date.now(), $v: FORMAT, $parts: sortedParts() };
    else if (w.content === undefined) value = { ...meta, $deleted: true };
    else if (w.content && typeof w.content === "object" && !Array.isArray(w.content)) value = { ...w.content, ...meta };
    else value = { $value: w.content, ...meta };
    const r = setPart(w.part, value);
    const base = w.part === META ? (() => { try { return JSON.parse(lastBody.get(META) || "null", reviver); } catch { return null; } })() : (() => { const b = lastBody.get(w.part); if (!b || b === "$deleted") return null; try { return JSON.parse(b, reviver); } catch { return null; } })();
    const commit = () => {
        partVer.set(w.part, ver);
        lastBody.set(w.part, bodyOf(w.part, w.content));
        forceParts.delete(w.part);
        const mine = wrote.filter(p => partsOfPath(p).includes(w.part));
        const stored = w.content === undefined ? undefined : JSON.parse(serialize({ v: w.content }), reviver).v;
        inflight.set(w.part, { ver, base, paths: new Map(mine.map(p => [p, stored === undefined ? null : (getRel(stored, relOf(w.part, p)) ?? null)])) });
        return { part: w.part, ver, prev };
    };
    return { r, commit };
}

/** 写后核对:过一会儿再读一次存储,被同时写入的别的标签页盖掉了就按版本合并,必要时重写 */
function armVerify() {
    clearTimeout(verifyTimer);
    verifyTimer = setTimeout(async () => {
        verifyTimer = 0;
        for (const [part, fl] of [...inflight]) {
            const r = await awaitMaybe(readPart(part));
            if (inflight.get(part) !== fl) continue;
            if (!r || (r.ver.writer === TAB_WRITER && r.ver.rev === fl.ver.rev)) { inflight.delete(part); continue; }
            applyRemotePart(part, r.deleted ? undefined : r.content, r.ver, { parts: r.parts, deleted: r.deleted });
            if (inflight.get(part) === fl && r.ver.rev > fl.ver.rev) inflight.delete(part);
        }
        if (!inflight.size) reasserts = 0;
    }, VERIFY_MS);
}

/** 存储里的值比本页新的份先合并进来(锁里、写之前):镜像(同步、同 origin 最新)和 GM */
async function refreshFromStores() {
    applyMirror(readMirror());
    if (!GM.get) return;
    for (const part of [META, ...knownParts]) {
        const r = await awaitMaybe(readPart(part));
        if (r && cmpVer(r.ver, partVer.get(part) || noVer) > 0) applyRemotePart(part, r.deleted ? undefined : r.content, r.ver, { parts: r.parts, deleted: r.deleted });
    }
}

function noteSiteBackup() {
    if (!useSiteStorage()) return;
    let body;
    try { body = serialize(persistable()); } catch { return; }
    if (body === lastSiteBody) return;
    const rev = Math.max(0, ...[...partVer.values()].map(v => v.rev));
    siteJson = { body, json: serialize({ ...persistable(), [SAVED_AT]: Date.now(), [REV]: rev, [WRITER]: TAB_WRITER }) };
}

let pendingSave = false;
let saving = null, saveAgain = false, flushWanted = false;

/**
 * 写入。一次只跑一个(同一页里不会写出两份版本相同、内容不同的设置),跑的时候又要求保存就在这次结束后再跑一次。
 * 有 Web Locks 时在同 origin 的锁里做:先把别的标签页刚写的合并进来,再按份写出变了的,最后广播、写镜像;
 * 写入失败的改动留着,下次重试
 */
export function saveNow({ flushBackup = false } = {}) {
    if (flushBackup) flushWanted = true;
    if (saving) { saveAgain = true; return saving; }
    saving = (async () => {
        try {
            do {
                saveAgain = false;
                await saveOnce();
            } while (saveAgain);
            if (flushWanted) { flushWanted = false; await flushSiteBackup(); }
        } finally { saving = null; }
    })();
    return saving;
}

async function saveOnce() {
    if (!ready) return;
    if (!PlainSettings.plugins || Object.keys(PlainSettings.plugins).length === 0) return;
    pendingSave = false;
    await withLock(async locked => {
        if (locked) { post({ t: "begin" }); await waitOpenWriters(); }
        try {
            await refreshFromStores();
            writeBootSnapshot();
            const wrote = [...dirty];
            dirty.clear();
            let plan;
            try { plan = planWrites(wrote); } catch (e) { logger.warn("设置序列化失败", e); for (const p of wrote) dirty.add(p); return; }
            const done = [], bases = new Map();
            if (GM.set) {
                for (const w of plan) {
                    let job;
                    try { job = writeOne(w, wrote); if (job.r && typeof job.r.then === "function") await job.r; } catch (e) {
                        // 没写进去:改动留着下次重试
                        logger.warn("写入设置失败", e);
                        for (const p of wrote) if (partsOfPath(p).includes(w.part)) dirty.add(p);
                        pendingSave = true;
                        continue;
                    }
                    const c = job.commit();
                    bases.set(c.part, c.prev);
                    done.push(c);
                }
            }
            if (done.length) {
                migrate = false;
                writeMirror(bases);
                post({ t: "done", parts: done.map(c => { const content = persistablePart(c.part); return { part: c.part, ver: c.ver, body: content === undefined ? null : serialize(content), deleted: c.part !== META && content === undefined, parts: c.part === META ? sortedParts() : undefined }; }) });
                armVerify();
            } else if (locked) post({ t: "done", parts: [] });
            noteSiteBackup();
        } catch (e) {
            if (locked) post({ t: "done", parts: [] });
            throw e;
        }
    });
    if (siteJson && !siteTimer) siteTimer = setTimeout(() => { flushSiteBackup(); }, SITE_BACKUP_DELAY);
}

/** 离开页面时:同步写出(不等锁、不等读取;异步管理器的写入也不等它完成),镜像同步写一份,下次启动时 GM 没落盘的能从镜像救回 */
function flushSync() {
    if (!ready || !GM.set) return;
    const wrote = [...dirty];
    dirty.clear();
    pendingSave = false;
    let plan;
    try { plan = planWrites(wrote); } catch { return; }
    const bases = new Map(), done = [];
    for (const w of plan) {
        try {
            const job = writeOne(w, wrote);
            if (job.r && typeof job.r.then === "function") job.r.catch(() => { });
            const c = job.commit();
            bases.set(c.part, c.prev);
            done.push(c);
        } catch (e) { logger.warn("写入设置失败", e); }
    }
    if (done.length) {
        writeMirror(bases);
        post({ t: "done", parts: done.map(c => { const content = persistablePart(c.part); return { part: c.part, ver: c.ver, body: content === undefined ? null : serialize(content), deleted: c.part !== META && content === undefined, parts: c.part === META ? sortedParts() : undefined }; }) });
    }
    noteSiteBackup();
    flushSiteBackup();
}

async function flushSiteBackup() {
    clearTimeout(siteTimer);
    siteTimer = 0;
    const pending = siteJson;
    siteJson = null;
    if (!pending) return;
    try { await idbSet(SITE_STORAGE_KEY, pending.json); lastSiteBody = pending.body; } catch (e) { logger.debug("写入 IndexedDB 备份失败", e); }
}

const debouncedSave = debounce(() => { saveNow(); }, 100);
const scheduleSave = Object.assign(() => { pendingSave = true; debouncedSave(); }, { cancel: () => debouncedSave.cancel() });

/** 离开页面时补存;pagehide 覆盖往返缓存和移动端切走,和 beforeunload 一起只写一次 */
export function installUnloadSave() {
    const flush = () => {
        if (!pendingSave && !siteJson && !dirty.size) return;
        scheduleSave.cancel();
        flushSync();
    };
    W.addEventListener("beforeunload", flush);
    W.addEventListener("pagehide", flush);
}

// ---------- 监听别的标签页 ----------
const watched = new Set();
function watchPart(part) {
    if (!syncInstalled || !GM.addListener || watched.has(part)) return;
    watched.add(part);
    try {
        GM.addListener(partKey(part), (_name, _old, value, remote) => {
            if (!remote) return;
            const r = parsePart(value);
            if (!r) return;
            applyRemotePart(part, r.deleted ? undefined : r.content, r.ver, { parts: r.parts, deleted: r.deleted });
        });
    } catch (e) { logger.debug("监听脚本管理器存储失败", e); }
}
/** 刚知道的份(别的标签页新加的插件,或安装监听之前的空档):同步读一次 */
function catchUpPart(part) {
    const r = readPart(part);
    if (!r || typeof r.then === "function") { if (r) r.then(x => { if (x && cmpVer(x.ver, partVer.get(part) || noVer) > 0) applyRemotePart(part, x.deleted ? undefined : x.content, x.ver, { parts: x.parts, deleted: x.deleted }); }); return; }
    if (cmpVer(r.ver, partVer.get(part) || noVer) > 0) applyRemotePart(part, r.deleted ? undefined : r.content, r.ver, { parts: r.parts, deleted: r.deleted });
}
let syncInstalled = false;
export function installCrossTabSync() {
    if (syncInstalled) return;
    syncInstalled = true;
    getChannel();
    for (const part of [META, ...knownParts]) { watchPart(part); catchUpPart(part); }
    if (useSiteStorage()) {
        W.addEventListener("storage", e => {
            if (e.key !== SITE_STORAGE_KEY || e.newValue == null) return;
            applyMirror(readMirror());
        });
    }
}

