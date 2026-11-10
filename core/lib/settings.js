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
/** 本页知道的最新版本:读到的、收到的、自己写的;下次保存用 rev + 1 */
let known = { rev: 0, writer: "" };
const seeRev = data => { const v = verOf(data); if (cmpVer(v, known) > 0) known = v; return v.rev; };

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
        const raw = GM.get(STORAGE_KEY);
        if (raw && typeof raw.then === "function") { asyncOnlyGm = true; return false; }
        const data = parseStored(raw);
        if (data) {
            seeRev(data);
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

/** 就绪前收到的别的标签页的写入:就绪后补上(最新的一份) */
let pendingRemote = null;

/**
 * 读取完整设置。脚本管理器存储(GM)是唯一权威:GM 里有带版本的设置就只用它,站点里的 IndexedDB / localStorage 副本只是备份,
 * 只在 GM 没有内容(卸载重装、清空存储)或 GM 里是旧版本写的、没有版本号的副本时才拿来比较和救回;救回后立即写回 GM
 */
export async function loadAsync() {
    let gm = null;
    try { gm = parseStored(GM.get ? await GM.get(STORAGE_KEY) : null); } catch (e) { logger.debug("从 GM 读取失败", e); }
    const stamped = d => !!(revOf(d) || savedAtOf(d));
    let chosen = null, restored = false;
    if (gm && stamped(gm)) chosen = { name: "GM", data: gm };
    else {
        const found = gm ? [{ name: "GM", data: gm, rev: revOf(gm), at: savedAtOf(gm), score: richness(gm) }] : [];
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
        }
    }
    if (chosen) {
        const data = chosen.data;
        seeRev(data);
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
    if (restored && GM.set) {
        // GM 里没有:从站点备份救回,写回 GM(之后别的站点也能读到)
        logger.info(`脚本管理器存储里没有设置,已从本站的 ${chosen.name} 备份救回并写回`);
        lastGmBody = null;
        scheduleSave();
    }
    if (pendingRemote) { const d = pendingRemote; pendingRemote = null; applyRemote(d); }
    // 启动过程不落盘:只有之后真正改了设置才写(救回的除外)
    return !!chosen;
}

// ---------- 多标签页同步 ----------
const under = (set, path) => {
    for (const d of set) if (d === path || d.startsWith(path + ".") || path.startsWith(d + ".")) return true;
    return false;
};

/**
 * 本页写出、还没确认胜出的一次保存:{ ver, base, paths: Map<路径, 写出的值> }。
 * base 是写之前读到的存储内容(三方合并的基准)。别的标签页在同一个基准上同时写了同一个 rev 时,
 * 双方按版本决胜:对方没动过的路径保留本页的,双方都改了的听版本大的;本页还有没被对方带上的改动就再写一次
 */
let inflight = null;
let reasserts = 0;
const MAX_REASSERTS = 3;
const VERIFY_MS = 400;
let verifyTimer = 0;

function protectAndReassert(paths) {
    if (!paths.length) { reasserts = 0; return; }
    if (++reasserts > MAX_REASSERTS) { logger.warn(`设置和别的标签页反复冲突,已放弃重写:${paths.join(", ")}`); reasserts = 0; return; }
    for (const p of paths) dirty.add(p);
    lastGmBody = null;
    scheduleSave();
}

/** 别的标签页保存的整份设置:逐键合并进内存并照常发出变更通知(不触发写入,除非本页的改动被对方的同时写入覆盖) */
export function applyRemote(data) {
    if (!data || typeof data !== "object") return 0;
    // 就绪前(异步读取还没完成)收到的:先记下,读完再用
    if (!ready) { if (!pendingRemote || cmpVer(verOf(data), verOf(pendingRemote)) > 0) pendingRemote = data; return 0; }
    const v = verOf(data);
    const fromOther = v.writer !== TAB_WRITER;
    // 和本页写出、还没确认的那次保存基于同一个版本(同一个 rev,不同写入者):是同时写的兄弟
    const sibling = !!(inflight && fromOther && v.rev && v.rev === inflight.ver.rev);
    if (!sibling && v.rev && cmpVer(v, known) < 0) {
        // 过时的一份(例如经另一个通道晚到的,或落后的标签页写的):不用它。但它可能是存储里现在的内容,
        // 下次保存不能因为"和上次写的一样"跳过;别的标签页写的,本页补写一次把存储改回最新
        lastGmBody = null;
        if (fromOther) scheduleSave();
        return 0;
    }
    if (inflight && !sibling && v.rev > inflight.ver.rev) inflight = null; // 对方在本页这次写入之后写的:已包含它
    // 版本号更大(或同时写的兄弟):写它的标签页已经看到过本页知道的全部内容,它没有的就是删掉了(包括整条插件设置)。
    // 没有版本号(旧版本写的)或版本相同:整条插件设置和顶层键照旧不删
    const newer = sibling || cmpVer(v, known) > 0;
    const protect = new Set(dirty);
    const keep = [];
    if (sibling) {
        const theirsWin = cmpVer(v, inflight.ver) > 0;
        for (const [p, ours] of inflight.paths) {
            const theirs = getPath(data, p);
            const changedByThem = !inflight.base || serialize(theirs ?? null) !== serialize(getPath(inflight.base, p) ?? null);
            if (changedByThem && theirsWin) continue; // 双方都改了,听版本大的
            protect.add(p);
            if (serialize(theirs ?? null) !== serialize(ours ?? null)) keep.push(p);
        }
        inflight = null;
    }
    seeRev(data);
    // 收到的就是存储里现在的内容:之后判断"没变就不写"要和它比,而不是和本页上次写的比。
    // 不然本页写过 X、别的标签页改成 Y、本页再改回 X 时,会以为 X 已经在存储里而跳过写入
    try { lastGmBody = serialize(data); } catch { lastGmBody = null; }
    lastSiteBody = null;
    const changedPaths = [];
    const walk = (target, src, path) => {
        for (const k of Object.keys(src)) {
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
        // 别的标签页删掉的键:本地有、收到的没有、本地又没改过的,也删掉;不然本页下次保存会把它写回去。
        // 顶层和 plugins.<名> 这两层只在收到的版本更新时才删(见上);plugins 本身不删
        if (!newer && (path === "" || path === "plugins")) return;
        for (const k of Object.keys(target)) {
            if (Object.prototype.hasOwnProperty.call(src, k)) continue;
            if (path === "" && k === "plugins") continue;
            const full = path ? `${path}.${k}` : k;
            if (under(protect, full)) continue;
            const parts = full.split(".");
            // 整条插件设置被删:本页已注册的插件只重置为默认值(它正在用 settings.store),不删条目
            if (parts.length === 2 && parts[0] === "plugins" && isRegisteredPlugin(k) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
                walk(target[k], {}, full);
                continue;
            }
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
            if (parts.length === 2 && parts[0] === "plugins") markExplicit(full, undefined);
            removed(full, gone);
        }
    };
    // 删掉的是一整个对象(例如整条插件设置)时逐个叶子发通知,按前缀 "plugins.<名>." 监听的也能收到
    const removed = (full, gone) => {
        if (gone && typeof gone === "object" && !Array.isArray(gone) && Object.keys(gone).length) {
            for (const k of Object.keys(gone)) removed(`${full}.${k}`, gone[k]);
            return;
        }
        changedPaths.push(full);
        emitChange(full, undefined);
    };
    walk(PlainSettings, data, "");
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
// 存储里现在的内容(不含保存时间):本页写入后,以及收到别的标签页的写入后更新;没变就不写
let lastGmBody = null, lastSiteBody = null;
// 网站存储只是备份(卸载脚本清空 GM 存储后救回用):合并到 2 秒写一次,离开页面时补写
const SITE_BACKUP_DELAY = 2000;
let siteTimer = 0, siteJson = null;
/** localStorage 是同步写入,大块设置会卡主线程;只在管理器没有值变化监听、要靠它的 storage 事件做多标签页同步时才写 */
const needLsSync = () => !GM.addListener;

/** 读 GM 存储里现在那份设置;读不到为 null。同步接口直接返回,异步接口(AdGuard、GM4)等它 */
async function readStoredGm() {
    if (!GM.get) return null;
    try {
        let raw = GM.get(STORAGE_KEY);
        if (raw && typeof raw.then === "function") raw = await raw;
        return parseStored(raw);
    } catch { return null; }
}

/** 写出后过一会儿再读一次存储:还是本页写的就确认;被同时写入的别的标签页盖掉了就按版本合并,必要时重写 */
function armVerify() {
    clearTimeout(verifyTimer);
    verifyTimer = setTimeout(async () => {
        verifyTimer = 0;
        if (!inflight) return;
        const stored = await readStoredGm();
        if (!inflight) return;
        const v = verOf(stored);
        if (!stored || (v.writer === TAB_WRITER && v.rev === inflight.ver.rev)) { inflight = null; reasserts = 0; return; }
        applyRemote(stored);
        if (inflight && v.rev > inflight.ver.rev) inflight = null;
    }, VERIFY_MS);
}

/**
 * 写入:先读后合并再写。GM 没有原子的比较并交换,这里尽量逼近:写之前读一次存储,别的标签页写过更新的版本就先合并进来
 * (本页没落盘的改动不被盖掉),再以 rev + 1 写出;写出后核对一次(见 armVerify)。写入失败时改动留着,下次重试
 */
export async function saveNow({ flushBackup = false } = {}) {
    if (!ready) return;
    if (!PlainSettings.plugins || Object.keys(PlainSettings.plugins).length === 0) return;
    let stored = null, haveStored = false;
    if (GM.get) {
        stored = await readStoredGm();
        haveStored = true;
        if (stored && cmpVer(verOf(stored), known) > 0) applyRemote(stored);
    }
    let body, toStore;
    try { toStore = persistable(); body = serialize(toStore); } catch (e) { logger.warn("设置序列化失败", e); return; }
    writeBootSnapshot();
    const wrote = [...dirty];
    dirty.clear();
    pendingSave = false;
    const storedBody = stored ? serialize(stored) : null;
    // 存储里已经是这份内容就不写(和存储比,不和本页上次写的比:别的标签页可能改过又改回)
    const same = haveStored ? body === storedBody : body === lastGmBody;
    const writeGm = !!GM.set && !same;
    let ver = known;
    if (writeGm) {
        ver = { rev: known.rev + 1, writer: TAB_WRITER };
        const json = serialize({ ...toStore, [SAVED_AT]: Date.now(), [REV]: ver.rev, [WRITER]: ver.writer });
        try {
            try {
                const r = GM.set(STORAGE_KEY, JSON.parse(json));
                if (r && typeof r.then === "function") await r;
            } catch {
                const r = GM.set(STORAGE_KEY, json);
                if (r && typeof r.then === "function") await r;
            }
        } catch (e) {
            // 没写进去:改动留着下次重试;站点备份也不写,免得备份领先 GM
            logger.warn("写入设置失败", e);
            for (const p of wrote) dirty.add(p);
            pendingSave = true;
            return;
        }
        lastGmBody = body;
        if (cmpVer(ver, known) > 0) known = ver;
        inflight = { ver, base: stored, paths: new Map(wrote.map(p => [p, JSON.parse(serialize({ v: getPath(toStore, p) ?? null }), reviver).v])) };
        armVerify();
        if (useSiteStorage() && body !== lastSiteBody) siteJson = { body, json };
    } else if (useSiteStorage() && body !== lastSiteBody) {
        // GM 里已经是这份:站点备份跟上,版本照抄 GM 的,不自己加一
        siteJson = { body, json: serialize({ ...toStore, [SAVED_AT]: savedAtOf(stored) || Date.now(), [REV]: ver.rev, [WRITER]: ver.writer }) };
    }
    if (!siteJson) { if (flushBackup) await flushSiteBackup(); return; }
    if (flushBackup) await flushSiteBackup();
    else if (!siteTimer) siteTimer = setTimeout(() => { flushSiteBackup(); }, needLsSync() ? 0 : SITE_BACKUP_DELAY);
}

async function flushSiteBackup() {
    clearTimeout(siteTimer);
    siteTimer = 0;
    const pending = siteJson;
    siteJson = null;
    if (!pending) return;
    const ls = W.localStorage || localStorage;
    if (needLsSync()) {
        try { ls.setItem(SITE_STORAGE_KEY, pending.json); } catch (e) { logger.debug("写入 localStorage 备份失败", e); }
    } else {
        // 旧版本写过的 localStorage 副本删掉,免得以后读到过时的一份
        try { if (ls.getItem(SITE_STORAGE_KEY) != null) ls.removeItem(SITE_STORAGE_KEY); } catch { /* 忽略 */ }
    }
    try { await idbSet(SITE_STORAGE_KEY, pending.json); lastSiteBody = pending.body; } catch (e) { logger.debug("写入 IndexedDB 备份失败", e); }
}

let pendingSave = false;
const debouncedSave = debounce(() => { saveNow(); }, 100);
const scheduleSave = Object.assign(() => { pendingSave = true; debouncedSave(); }, { cancel: () => debouncedSave.cancel() });

/** 离开页面时补存;pagehide 覆盖往返缓存和移动端切走,和 beforeunload 一起只写一次 */
export function installUnloadSave() {
    const flush = () => {
        if (!pendingSave && !siteJson) return;
        scheduleSave.cancel();
        saveNow({ flushBackup: true });
    };
    W.addEventListener("beforeunload", flush);
    W.addEventListener("pagehide", flush);
}
