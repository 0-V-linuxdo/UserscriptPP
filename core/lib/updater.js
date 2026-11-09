// 更新:检查新版本(读发布地址上的 .meta.js)、立即更新(打开 .user.js,由脚本管理器接手安装)、
// 更新后提示改了什么(构建时把站点目录的 CHANGELOG.md 打进脚本)。
// 没配 updateBase 的构建没有更新地址,只显示更新日志。
import { W, VERSION } from "../env.js";
import { Logger } from "./logger.js";
import { fetchExternal } from "./net.js";
import { Settings, PlainSettings } from "./settings.js";

const logger = new Logger("Updater", "#fda4af");
/** { meta, download } 或 null */
export const UPDATE_INFO = typeof __USPP_UPDATE__ !== "undefined" ? __USPP_UPDATE__ : null;
/** [{ version, date, notes: string[] }],新的在前 */
export const CHANGELOG = typeof __USPP_CHANGELOG__ !== "undefined" ? __USPP_CHANGELOG__ : [];
export const DAY = 24 * 60 * 60 * 1000;

/**
 * 版本比较:主体按数字段比(1.10.0 > 1.9.2;20261106.153012 这类构建时间版本也适用);
 * "-" 后面是预发布段(1.0.0-beta.2),主体相同时带预发布段的更旧,预发布段之间按语义化版本的规则比。返回 -1 / 0 / 1
 */
export function compareVersions(a, b) {
    const split = v => { const s = String(v ?? "").trim().replace(/^v/i, "").split("+")[0]; const i = s.indexOf("-"); return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)]; };
    const [ma, pa] = split(a), [mb, pb] = split(b);
    const na = ma.split(/[^\d]+/).filter(Boolean).map(Number), nb = mb.split(/[^\d]+/).filter(Boolean).map(Number);
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
        const x = na[i] ?? 0, y = nb[i] ?? 0;
        if (x !== y) return x > y ? 1 : -1;
    }
    if (pa === pb) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    const ia = pa.split("."), ib = pb.split(".");
    for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
        const x = ia[i], y = ib[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        if (x === y) continue;
        const dx = /^\d+$/.test(x), dy = /^\d+$/.test(y);
        if (dx && dy) return Number(x) > Number(y) ? 1 : -1;
        if (dx !== dy) return dx ? -1 : 1;
        return x > y ? 1 : -1;
    }
    return 0;
}

/** 从元数据头里取 @version */
export const parseMetaVersion = text => /^\/\/\s*@version\s+(\S+)/m.exec(String(text))?.[1] ?? null;

const state = { checking: false, last: null, listeners: new Set() };
const emit = () => { for (const fn of [...state.listeners]) { try { fn(); } catch { /* 忽略 */ } } };
export const subscribeUpdates = fn => { state.listeners.add(fn); return () => state.listeners.delete(fn); };
/** 最近一次检查的结果:{ at, latest, hasUpdate, error } */
export const lastCheck = () => state.last;
export const isChecking = () => state.checking;
export const canUpdate = () => !!UPDATE_INFO?.meta;

const sys = () => Settings.plugins.Settings;

/** 检查失败后,下次自动检查前要等多久(按连续失败次数);不超过正常的检查间隔 */
export const RETRY_AFTER = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];
let inflight = null;

/**
 * 检查更新。正在检查时再调用,拿到的是同一次检查的结果(不会先返回上一次的结果或 null)。
 * 只有成功的检查才记为"上次检查";失败记下连续失败次数,自动检查按 RETRY_AFTER 退避重试
 */
export function checkForUpdate() {
    if (!canUpdate()) return Promise.resolve({ hasUpdate: false, error: "no-update-url" });
    if (inflight) return inflight;
    state.checking = true;
    emit();
    inflight = (async () => {
        let res;
        try {
            const r = await fetchExternal(`${UPDATE_INFO.meta}${UPDATE_INFO.meta.includes("?") ? "&" : "?"}t=${Date.now()}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const latest = parseMetaVersion(await r.text());
            if (!latest) throw new Error("no @version in meta file");
            res = { at: Date.now(), current: VERSION, latest, hasUpdate: compareVersions(latest, VERSION) > 0, error: null };
        } catch (e) {
            logger.debug("检查更新失败", e);
            res = { at: Date.now(), current: VERSION, latest: null, hasUpdate: false, error: String(e?.message ?? e) };
        }
        try {
            const s = sys();
            if (res.error) {
                s.updateCheckFailures = (Number(PlainSettings.plugins.Settings?.updateCheckFailures) || 0) + 1;
                s.lastUpdateFailedAt = res.at;
            } else {
                s.lastUpdateCheck = res.at;
                if (PlainSettings.plugins.Settings?.updateCheckFailures) s.updateCheckFailures = 0;
            }
        } catch { /* 设置未就绪 */ }
        state.last = res;
        return res;
    })();
    inflight.finally(() => { inflight = null; state.checking = false; emit(); });
    return inflight;
}

/** 打开新版本的 .user.js:脚本管理器会弹出它自己的安装确认页 */
export function installUpdate() {
    if (!UPDATE_INFO?.download) return false;
    const url = `${UPDATE_INFO.download}${UPDATE_INFO.download.includes("?") ? "&" : "?"}t=${Date.now()}`;
    W.open(url, "_blank", "noopener");
    return true;
}

/** 上次运行的版本比这次旧时返回这期间的更新日志条目(新的在前);首次运行返回 null,不提示 */
export function noteRunningVersion() {
    const plain = PlainSettings.plugins.Settings ??= {};
    const prev = typeof plain.lastVersion === "string" ? plain.lastVersion : null;
    if (prev !== VERSION) sys().lastVersion = VERSION;
    if (!prev || compareVersions(VERSION, prev) <= 0) return null;
    const entries = CHANGELOG.filter(e => compareVersions(e.version, prev) > 0 && compareVersions(e.version, VERSION) <= 0);
    return { from: prev, to: VERSION, entries };
}

/** 到期就检查(缺省每天一次);上次失败的按 RETRY_AFTER 提前重试;有新版本时回调 */
export async function maybeAutoCheck(onUpdate, { every = DAY } = {}) {
    if (!canUpdate()) return null;
    const plain = PlainSettings.plugins.Settings ?? {};
    if (plain.autoCheckUpdates === false) return null;
    const fails = Number(plain.updateCheckFailures) || 0;
    if (fails > 0) {
        const wait = Math.min(every, RETRY_AFTER[Math.min(fails, RETRY_AFTER.length) - 1]);
        if (Date.now() - (Number(plain.lastUpdateFailedAt) || 0) < wait) return null;
    } else if (Date.now() - (Number(plain.lastUpdateCheck) || 0) < every) return null;
    const res = await checkForUpdate();
    if (res?.hasUpdate) onUpdate?.(res);
    return res;
}
