// 拦截器:站点声明可拦截的动作(例如 beforeSend),插件按登记顺序依次处理,可以改值或取消。
// 单个拦截器出错或超时时跳过它,用当前值继续,并记日志
import { Logger } from "./logger.js";

const logger = new Logger("Interceptors", "#fca5a5");
const chains = new Map(); // 名字 -> [{ id, fn, order }]
let declared = new Set();

export function setSiteInterceptors(list) { declared = new Set(Array.isArray(list) ? list : []); }
export const isKnownInterceptor = name => declared.has(name);
export const getInterceptorNames = () => [...declared];

export function addInterceptor(name, fn, { id = "", order = 0 } = {}) {
    if (typeof fn !== "function") return () => { };
    if (!declared.has(name)) logger.debug(`登记了当前站点没有声明的拦截器 ${name}`);
    let list = chains.get(name);
    if (!list) chains.set(name, list = []);
    const entry = { id, fn, order };
    list.push(entry);
    list.sort((a, b) => a.order - b.order);
    return () => { const i = list.indexOf(entry); if (i >= 0) list.splice(i, 1); };
}

export const hasInterceptors = name => !!chains.get(name)?.length;

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`超过 ${ms} 毫秒`)), ms);
    Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});

/**
 * 依次执行 name 的拦截器。拦截器收到当前值,返回新值替换、返回 { cancel: true } 取消、返回 undefined 不改。
 * 返回 { value, cancelled, by }。
 */
export async function runInterceptors(name, value, { timeout = 3000 } = {}) {
    let cur = value;
    for (const { id, fn } of [...(chains.get(name) || [])]) {
        let r;
        try { r = await withTimeout(fn(cur), timeout); } catch (e) { logger.error(`拦截器 ${name}(${id})出错或超时,已跳过`, e); continue; }
        if (r === undefined) continue;
        if (r && typeof r === "object" && r.cancel === true) return { value: cur, cancelled: true, by: id };
        cur = r;
    }
    return { value: cur, cancelled: false, by: null };
}
