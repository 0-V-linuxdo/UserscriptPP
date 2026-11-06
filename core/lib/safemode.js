// 安全模式:页面可能被某个插件弄坏时,只启动必需插件,不加载主题和 Quick CSS。
// 自动进入:启动时在 GM 存储里记"正在启动",站点就绪 10 秒后清掉;两分钟内连续两次启动都没清掉,下一次进入。
// 站点已就绪、本次也没有插件启动失败时,10 秒内关掉或刷新页面(pagehide)也算正常结束,不计入。
// 手动进入:菜单命令"以安全模式重新加载",或网址里带 #uspp-safe。
import { W, GM } from "../env.js";
import { Logger } from "./logger.js";

const logger = new Logger("SafeMode", "#fca5a5");
export const BOOT_KEY = "UserscriptPPBoot";
const RAPID_MS = 2 * 60 * 1000;
const mem = new Map();
const read = () => { try { const v = GM.get ? GM.get(BOOT_KEY, null) : mem.get(BOOT_KEY); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const write = v => { try { if (GM.set) GM.set(BOOT_KEY, v); else mem.set(BOOT_KEY, v); } catch { /* 忽略 */ } };

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
