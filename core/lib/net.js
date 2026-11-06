/* global __USPP_CONNECT__ */
import { GM, W } from "../env.js";

/** 构建时写进 @connect 的主机(scripts/build.mjs 的 connectHosts);"*" 表示任意主机 */
const CONNECT = typeof __USPP_CONNECT__ !== "undefined" ? __USPP_CONNECT__ : ["*"];
export const allowedHosts = () => CONNECT.slice();

/** 和 @connect 同样的规则:"*" 任意主机,域名同时匹配它的子域名;当前网站自己总是允许(脚本管理器对同源请求也不要求 @connect) */
export function hostAllowed(host, list = CONNECT) {
    const hn = String(host || "").toLowerCase();
    if (!hn) return false;
    const self = (() => { try { return W.location.hostname.toLowerCase(); } catch { return ""; } })();
    if (hn === self) return true;
    return list.some(raw => {
        const h = String(raw).toLowerCase();
        return h === "*" || (h === "self" && hn === self) || hn === h || hn.endsWith("." + h);
    });
}

// 被拦下的请求(诊断信息里列出);只记主机和插件名,不记完整地址
const blocked = [];
export const blockedRequests = () => blocked.slice();

/** 不在允许列表里时返回拒绝原因,否则 null。plugin / pluginHosts:经插件作用域发出的请求,还要在插件声明的 connect 里 */
function denyReason(url, plugin, pluginHosts) {
    let u, base;
    try { base = W.location.href; } catch { /* 没有页面地址时只认绝对地址 */ }
    try { u = new URL(url, base); } catch { return `invalid URL: ${String(url).slice(0, 100)}`; }
    if (!/^https?:$/.test(u.protocol)) return `only http(s) URLs are allowed (${u.protocol})`;
    const host = u.hostname;
    let why = null;
    if (!hostAllowed(host)) why = `${host} is not in this script's allowed hosts (${CONNECT.join(", ") || "none"})`;
    else if (plugin && pluginHosts && !hostAllowed(host, pluginHosts)) why = `${host} is not in ${plugin}'s declared hosts (${pluginHosts.join(", ") || "none"})`;
    if (why) {
        if (blocked.length >= 50) blocked.shift();
        blocked.push({ host, plugin: plugin || null, at: new Date().toISOString() });
    }
    return why;
}

/** 插件作用域里的 fetchExternal:插件声明了 connect 时只能访问这些主机(同时也要在脚本的 @connect 里) */
export function fetchExternalFor(plugin, hosts) {
    const list = Array.isArray(hosts) ? hosts.map(String) : null;
    return (url, opts) => request(url, opts, plugin, list);
}

/**
 * 走 GM_xmlhttpRequest(绕过跨域),30 秒超时,返回标准 Response。
 * 只能访问脚本 @connect 里的主机:各脚本管理器对 @connect 的执行尺度不一,这里再按同一份列表把一道关。
 */
export function fetchExternal(url, opts) {
    return request(url, opts, null, null);
}

function request(url, { timeout = 30000 } = {}, plugin, pluginHosts) {
    const why = denyReason(url, plugin, pluginHosts);
    if (why) return Promise.reject(new Error(`Request blocked: ${why}`));
    if (!GM.xhr) return W.fetch(url);
    return new Promise((resolve, reject) => {
        GM.xhr({
            method: "GET",
            url,
            timeout,
            responseType: "text",
            onload: r => {
                const headers = new Headers();
                for (const line of String(r.responseHeaders || "").split(/\r?\n/)) {
                    const i = line.indexOf(":");
                    if (i > 0) { try { headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim()); } catch { /* 非法头 */ } }
                }
                const status = r.status || 200;
                const body = status === 204 || status === 304 ? null : (r.responseText ?? r.response ?? "");
                try {
                    resolve(new Response(body, { status: status < 200 || status > 599 ? 200 : status, statusText: r.statusText || "", headers }));
                } catch (e) { reject(e); }
            },
            onerror: () => reject(new Error("网络错误")),
            ontimeout: () => reject(new Error("请求超时")),
            onabort: () => reject(new Error("请求被中止")),
        });
    });
}
