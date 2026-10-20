import { GM, W } from "../env.js";

/** 走 GM_xmlhttpRequest(绕过跨域),30 秒超时,返回标准 Response */
export function fetchExternal(url, { timeout = 30000 } = {}) {
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
