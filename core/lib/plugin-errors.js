// 插件运行期错误:经 ctx 登记的回调、事件和设置处理函数出错时按插件计数(启动失败另见失败汇总)。
// 短时间内出错太多的插件本页先停掉(熔断),刷新后照常启动;Plugins 页卡片和诊断信息里列出错误数和最近一条
import { Logger } from "./logger.js";

const logger = new Logger("Plugins", "#a7f3d0");
const stats = new Map(); // 插件名 -> { count, last: { where, message, at }, recent: [时间] }
const listeners = new Set();
/** 熔断:BREAKER_WINDOW_MS 内出错 BREAKER_LIMIT 次 */
export const BREAKER_LIMIT = 10, BREAKER_WINDOW_MS = 30000;
let breaker = null; // (插件名, 统计) => 停掉插件;由 plugins.js 注入,避免循环引用

export const setBreaker = fn => { breaker = fn; };
export const onPluginError = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const tripListeners = new Set();
/** 插件被熔断停掉时通知(入口据此提示用户) */
export const onPluginTripped = fn => { tripListeners.add(fn); return () => tripListeners.delete(fn); };

/** 记一次插件的运行期错误;where 说明出在哪(例如 "timer"、"listen:click") */
export function reportPluginError(plugin, where, err) {
    if (!plugin) { logger.error(`${where} 出错`, err); return; }
    let s = stats.get(plugin);
    if (!s) stats.set(plugin, s = { count: 0, last: null, recent: [], tripped: false });
    const now = Date.now();
    s.count++;
    s.last = { where, message: String(err?.message ?? err).slice(0, 300), at: now };
    s.recent = [...s.recent.filter(t => now - t < BREAKER_WINDOW_MS), now];
    logger.error(`${plugin}(${where})出错`, err);
    for (const fn of [...listeners]) { try { fn(plugin, s); } catch { /* 忽略 */ } }
    if (!s.tripped && s.recent.length >= BREAKER_LIMIT && breaker) {
        s.tripped = true;
        let stopped = false;
        try { stopped = breaker(plugin, s) !== false; } catch (e) { logger.error(`停用 ${plugin} 失败`, e); }
        if (stopped) {
            logger.warn(`${plugin} 在 ${BREAKER_WINDOW_MS / 1000} 秒内出错 ${BREAKER_LIMIT} 次,本页已停用`);
            for (const fn of [...tripListeners]) { try { fn(plugin, s); } catch { /* 忽略 */ } }
        } else s.tripped = false;
    }
}

/**
 * 包一层:同步异常和返回的 Promise 被拒都记到插件名下。rethrow 为 true 时照常抛出(调用方要据此跳过),否则吞掉。
 * live 给出时,插件已停止(或刚被熔断、正在停止)就不再调用,直接返回 undefined:和 DOM 事件规范里监听器的 removed 标志一样,
 * 派发途中被停掉的插件,同一轮里后面的回调也不再执行
 */
export function guard(plugin, where, fn, rethrow = false, live = null) {
    if (typeof fn !== "function" || !plugin) return fn;
    return function (...a) {
        if (live && !live()) return undefined;
        let r;
        try { r = fn.apply(this, a); } catch (e) { reportPluginError(plugin, where, e); if (rethrow) throw e; return undefined; }
        if (r && typeof r.then === "function") {
            // 迟到的拒绝:插件这一次运行已经结束(停了又启动是新的一次)就不再记到它头上,免得把重启后的插件熔断掉
            const report = e => { if (!live || live()) reportPluginError(plugin, where, e); };
            return rethrow ? r.then(undefined, e => { report(e); throw e; }) : r.then(undefined, report);
        }
        return r;
    };
}

/** 各插件的运行期错误:[{ name, count, last, tripped }],错误多的在前 */
export function pluginErrorStats() {
    return [...stats.entries()].map(([name, s]) => ({ name, count: s.count, last: s.last, tripped: s.tripped })).sort((a, b) => b.count - a.count);
}
export const pluginErrorsOf = name => { const s = stats.get(name); return s ? { count: s.count, last: s.last, tripped: s.tripped } : null; };
/** 插件重新启动(用户手动打开、热替换)后,熔断重新计 */
export function resetBreaker(name) { const s = stats.get(name); if (s) { s.recent = []; s.tripped = false; } }
