// 安全模式:页面可能被某个插件弄坏时,只启动必需插件,不加载主题和 Quick CSS。
// 自动进入:启动时在本标签页的 sessionStorage 里记"正在启动",站点就绪 10 秒后清掉;同一个标签页两分钟内连续两次启动都没清掉,下一次进入。
// 记录按标签页分开(和 Firefox / Chromium 按"一个实例"计数一样):同时打开几个标签页是几次互不相干的正常启动,不算连续失败。
// sessionStorage 刷新后还在、关掉标签页就没了,正好是"这个标签页的上一次启动"。
// 站点已就绪、本次也没有插件启动失败时,10 秒内关掉或刷新页面(pagehide)也算正常结束,不计入。
// 手动进入:菜单命令"以安全模式重新加载"(只对本标签页),或网址里带 #uspp-safe。
import { W, GM, SCRIPT_ID } from "../env.js";
import { Logger } from "./logger.js";

const logger = new Logger("SafeMode", "#fca5a5");
/** 旧版本放在 GM 存储里、所有标签页共用的记录;新版本不再用,启动时删掉 */
export const LEGACY_BOOT_KEY = "UserscriptPPBoot";
/** 本标签页的启动记录(sessionStorage,带脚本 id:同一页面上的几条脚本各记各的) */
export const BOOT_KEY = `UserscriptPPBoot:${SCRIPT_ID}`;
const RAPID_MS = 2 * 60 * 1000;
const mem = new Map();
let storageOk = true;
const ss = () => { try { return W.sessionStorage || null; } catch { return null; } };
const read = () => {
    try {
        const s = ss();
        if (!s) { storageOk = false; return mem.get(BOOT_KEY) || {}; }
        const v = JSON.parse(s.getItem(BOOT_KEY) || "null");
        return v && typeof v === "object" ? v : {};
    } catch { storageOk = false; return mem.get(BOOT_KEY) || {}; }
};
const write = v => {
    mem.set(BOOT_KEY, v);
    try { const s = ss(); if (s) s.setItem(BOOT_KEY, JSON.stringify(v)); else storageOk = false; } catch { storageOk = false; }
};
/** sessionStorage 不能用(隐私模式、站点禁用)时自动安全模式不起作用,诊断信息里注明 */
export const bootTrackingAvailable = () => storageOk;

let active = false, reason = null, previous = {};
// 本次启动的记录留一份在内存里,写存储时不必先读一遍
let state = {};
let failedThisBoot = false, healthy = false;
export const isSafeMode = () => active;
export const safeModeReason = () => reason;
/** 上次没完成的启动里最后一个启动中 / 抛错的插件 */
export const lastBootInfo = () => ({ lastPlugin: previous.lastPlugin ?? null, failed: previous.failed ?? [] });

const save = v => { state = v; write(v); };

/** 入口最早调用:决定本次是否进入安全模式,并记下"正在启动" */
export function beginBoot() {
    previous = read();
    try { if (GM.del && GM.get && GM.get(LEGACY_BOOT_KEY, null) != null) GM.del(LEGACY_BOOT_KEY); } catch { /* 忽略 */ }
    const now = Date.now();
    const hash = (() => { try { return W.location.hash.includes("uspp-safe"); } catch { return false; } })();
    const rapid = previous.pending && now - (previous.at || 0) < RAPID_MS;
    const pending = rapid ? (previous.pending || 0) : 0;
    if (previous.force) { active = true; reason = "manual"; }
    else if (hash) { active = true; reason = "url"; }
    else if (pending >= 2) { active = true; reason = "crash"; }
    save({ pending: active ? 0 : pending + 1, at: now, lastPlugin: null, failed: [] });
    if (active) logger.warn(`已进入安全模式(${reason}):只启动必需插件`);
}

/** 站点就绪后调用:10 秒后视为正常启动;在这之前页面被关掉或刷新,只要本次没有插件启动失败也视为正常 */
export function markBootHealthy(delay = 10000) {
    const done = () => {
        if (healthy) return;
        healthy = true;
        if (state.pending) save({ ...state, pending: 0 });
    };
    setTimeout(done, delay);
    try { W.addEventListener("pagehide", () => { if (!failedThisBoot) done(); }, { once: true }); } catch { /* 忽略 */ }
}

/** 记下正在启动的插件:启动中卡死时,下次能说出是谁。只在还没确认正常启动时写 */
export function noteStarting(name) {
    if (!state.pending || state.lastPlugin === name) return;
    save({ ...state, lastPlugin: name });
}
export function noteFailed(name) {
    failedThisBoot = true;
    save({ ...state, failed: [...new Set([...(state.failed || []), name])].slice(-10) });
}

export function reloadInSafeMode() { save({ ...state, force: true }); W.location.reload(); }
export function exitSafeMode() {
    write({ pending: 0, at: Date.now() });
    try { if (W.location.hash.includes("uspp-safe")) W.location.hash = ""; } catch { /* 忽略 */ }
    W.location.reload();
}
