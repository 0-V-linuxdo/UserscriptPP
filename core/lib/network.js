// 网络旁路:只包装一次页面的 fetch 和 XMLHttpRequest;响应一律复制后读取,不消费页面自己的响应体,默认不改请求
import { W } from "../env.js";
import { Logger } from "./logger.js";

const logger = new Logger("Network", "#c4b5fd");
const reqSubs = new Set(), resSubs = new Set();
let installed = false;

const test = (matcher, url, method) => {
    try {
        if (!matcher) return true;
        if (typeof matcher === "string") return url.includes(matcher);
        if (matcher instanceof RegExp) return matcher.test(url);
        if (typeof matcher === "function") return !!matcher(url, method);
    } catch { /* 视为不匹配 */ }
    return false;
};
const call = (fn, ctx) => { try { const r = fn(ctx); r?.catch?.(e => logger.error("网络回调出错", e)); } catch (e) { logger.error("网络回调出错", e); } };

/** 逐块读取一个(已复制的)响应体;用于流式响应(SSE) */
async function readChunks(res, onChunk) {
    const reader = res.body?.getReader?.();
    if (!reader) { onChunk(await res.text(), true); return; }
    const dec = new TextDecoder();
    for (;;) {
        const { value, done } = await reader.read();
        if (done) { onChunk("", true); break; }
        onChunk(dec.decode(value, { stream: true }), false);
    }
}

function wrapFetch() {
    const orig = W.fetch;
    if (typeof orig !== "function") return;
    const wrapped = function (input, init) {
        let url = "", method = "GET";
        try { url = typeof input === "string" ? input : input?.url ?? String(input); method = (init?.method || input?.method || "GET").toUpperCase(); } catch { /* 忽略 */ }
        for (const s of reqSubs) if (test(s.matcher, url, method)) call(s.handler, { url, method, init, input });
        const p = orig.apply(this, arguments);
        if (resSubs.size) p.then(res => {
            for (const s of resSubs) if (test(s.matcher, url, method)) {
                call(s.handler, {
                    url, method, status: res.status, headers: res.headers, type: "fetch",
                    clone: () => res.clone(),
                    text: () => res.clone().text(),
                    json: () => res.clone().json(),
                    onChunk: cb => readChunks(res.clone(), cb),
                });
            }
        }, () => { /* 页面自己处理错误 */ });
        return p;
    };
    try { W.fetch = wrapped; } catch (e) { logger.warn("无法包装 fetch", e); }
}

function wrapXhr() {
    const X = W.XMLHttpRequest;
    if (!X?.prototype) return;
    const open = X.prototype.open, send = X.prototype.send;
    X.prototype.open = function (method, url) {
        this.__usppReq = { method: String(method || "GET").toUpperCase(), url: String(url) };
        return open.apply(this, arguments);
    };
    X.prototype.send = function (body) {
        const info = this.__usppReq;
        if (info) {
            for (const s of reqSubs) if (test(s.matcher, info.url, info.method)) call(s.handler, { ...info, body, type: "xhr" });
            if (resSubs.size) this.addEventListener("load", () => {
                for (const s of resSubs) if (test(s.matcher, info.url, info.method)) {
                    // responseType 为 json 时 responseText 不可读,直接取 response
                    const rt = this.responseType;
                    const text = () => Promise.resolve(rt === "" || rt === "text" ? this.responseText : rt === "json" ? JSON.stringify(this.response) : "");
                    const json = () => (rt === "json" ? Promise.resolve(this.response) : text().then(JSON.parse));
                    call(s.handler, { ...info, status: this.status, type: "xhr", text, json, clone: () => null, onChunk: cb => text().then(t => cb(t, true)) });
                }
            });
        }
        return send.apply(this, arguments);
    };
}

export function installNetworkHooks() {
    if (installed) return;
    installed = true;
    wrapFetch();
    wrapXhr();
}
export const isNetworkHooked = () => installed;

export function onRequest(matcher, handler) {
    installNetworkHooks();
    const s = { matcher, handler };
    reqSubs.add(s);
    return () => reqSubs.delete(s);
}

export function onResponse(matcher, handler) {
    installNetworkHooks();
    const s = { matcher, handler };
    resSubs.add(s);
    return () => resSubs.delete(s);
}
