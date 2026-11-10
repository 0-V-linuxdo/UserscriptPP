// 网络旁路:只包装一次页面的 fetch / XMLHttpRequest(以及按需的 WebSocket / EventSource),串联已有的包装。
// 只读订阅(onRequest / onResponse):响应一律复制后读取,不消费页面自己的响应体,不改请求,不改变页面的时序。
// 改写订阅(rewriteRequest / rewriteResponse):显式登记,处理函数的返回值才会生效;没有改写订阅时行为与只读完全一样。
import { W } from "../env.js";
import { Logger } from "./logger.js";

const logger = new Logger("Network", "#c4b5fd");
const reqSubs = new Set(), resSubs = new Set();     // 只读
const reqRw = new Set(), resRw = new Set();         // 改写
const wsSubs = new Set(), esSubs = new Set();
let installed = false, wsInstalled = false, esInstalled = false;

const test = (matcher, url, method) => {
    try {
        if (!matcher) return true;
        if (typeof matcher === "string") return url.includes(matcher);
        if (matcher instanceof RegExp) { matcher.lastIndex = 0; return matcher.test(url); }
        if (typeof matcher === "function") return !!matcher(url, method);
    } catch { /* 视为不匹配 */ }
    return false;
};
const call = (fn, ctx) => { try { const r = fn(ctx); r?.catch?.(e => logger.error("网络回调出错", e)); } catch (e) { logger.error("网络回调出错", e); } };
const isResponse = r => !!r && typeof r === "object" && typeof r.clone === "function" && typeof r.text === "function" && "status" in r;
const absUrl = u => { try { return new URL(u, location.href).href; } catch { return String(u); } };

/** 生成一个页面里的 Response:对象按 JSON 序列化 */
export function makeResponse(body, init = {}) {
    const R = W.Response || Response;
    if (body != null && typeof body === "object" && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && !(typeof Blob !== "undefined" && body instanceof Blob) && typeof body.getReader !== "function") {
        const headers = new (W.Headers || Headers)(init.headers || {});
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
        return new R(JSON.stringify(body), { status: 200, ...init, headers });
    }
    return new R(body, { status: 200, ...init });
}

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

const resCtx = (res, url, method) => ({
    url, method, status: res.status, headers: res.headers, type: "fetch",
    clone: () => res.clone(),
    text: () => res.clone().text(),
    json: () => res.clone().json(),
    onChunk: cb => readChunks(res.clone(), cb),
});

/** 请求体的文字形式(字符串体原样;其他类型给 null) */
const bodyText = b => (typeof b === "string" ? b : null);

function wrapFetch() {
    const orig = W.fetch;
    if (typeof orig !== "function") return;
    const fireRead = (res, url, method) => {
        for (const s of resSubs) if (test(s.matcher, url, method)) call(s.handler, resCtx(res, url, method));
    };
    const wrapped = function (input, init) {
        let url = "", method = "GET";
        try { url = typeof input === "string" ? input : input?.url ?? String(input); method = (init?.method || input?.method || "GET").toUpperCase(); } catch { /* 忽略 */ }
        for (const s of reqSubs) if (test(s.matcher, url, method)) call(s.handler, { url, method, init, input, type: "fetch" });
        const rq = [...reqRw].filter(s => test(s.matcher, url, method));
        const rs = [...resRw].filter(s => test(s.matcher, url, method));
        const self = this;
        if (!rq.length && !rs.length) {
            const p = orig.apply(self, arguments);
            if (resSubs.size) p.then(res => fireRead(res, url, method), () => { /* 页面自己处理错误 */ });
            return p;
        }
        return (async () => {
            let curInput = input, curInit = init, curUrl = url, early = null;
            for (const s of rq) {
                const ctx = {
                    url: curUrl, method, init: curInit, input: curInput, type: "fetch",
                    body: bodyText(curInit?.body), json: () => JSON.parse(bodyText(curInit?.body) ?? "null"),
                    respond: makeResponse,
                };
                let r;
                try { r = await s.handler(ctx); } catch (e) { logger.error("请求改写出错,跳过", e); continue; }
                if (!r) continue;
                if (isResponse(r)) { early = r; break; }
                if (r.block) throw new TypeError("Failed to fetch");
                if (r.url != null && String(r.url) !== curUrl) {
                    curUrl = String(r.url);
                    curInput = typeof curInput === "string" || curInput instanceof URL || !curInput?.url ? curUrl : new (W.Request || Request)(curUrl, curInput);
                }
                if (r.body !== undefined) curInit = { ...(curInit || {}), body: typeof r.body === "string" ? r.body : JSON.stringify(r.body) };
                if (r.init) curInit = { ...(curInit || {}), ...r.init };
            }
            let res = early ?? await orig.call(self, curInput, curInit);
            for (const s of rs) {
                let r;
                try { r = await s.handler({ ...resCtx(res, curUrl, method), respond: makeResponse }); } catch (e) { logger.error("响应改写出错,跳过", e); continue; }
                if (isResponse(r)) res = r;
            }
            if (resSubs.size) fireRead(res, curUrl, method);
            return res;
        })();
    };
    try { W.fetch = wrapped; } catch (e) { logger.warn("无法包装 fetch", e); }
}

function wrapXhr() {
    const X = W.XMLHttpRequest;
    if (!X?.prototype) return;
    const open = X.prototype.open, send = X.prototype.send;
    X.prototype.open = function (method, url, ...rest) {
        const info = { method: String(method || "GET").toUpperCase(), url: String(url), blocked: false };
        // XHR 的请求改写只支持同步返回(异步无法在 open 之前完成)
        for (const s of reqRw) {
            if (!test(s.matcher, info.url, info.method)) continue;
            let r;
            try { r = s.handler({ url: info.url, method: info.method, type: "xhr", phase: "open", respond: makeResponse }); } catch (e) { logger.error("请求改写出错,跳过", e); continue; }
            if (r?.then) { logger.warn("XHR 请求的改写函数必须同步返回,已忽略"); continue; }
            if (r?.block) info.blocked = true;
            else if (r?.url != null) info.url = String(r.url);
        }
        this.__usppReq = info;
        return open.call(this, method, info.url, ...rest);
    };
    X.prototype.send = function (body) {
        const info = this.__usppReq;
        if (info) {
            if (info.blocked) {
                // 拦截:不发出请求,按网络错误通知页面
                const xhr = this;
                setTimeout(() => { try { xhr.abort(); } catch { /* 忽略 */ } try { xhr.dispatchEvent(new (W.ProgressEvent || Event)("error")); xhr.dispatchEvent(new (W.ProgressEvent || Event)("loadend")); } catch { /* 忽略 */ } }, 0);
                return undefined;
            }
            for (const s of reqRw) {
                if (!test(s.matcher, info.url, info.method) || typeof body !== "string") continue;
                let r;
                try { r = s.handler({ url: info.url, method: info.method, type: "xhr", phase: "send", body, json: () => JSON.parse(body), respond: makeResponse }); } catch (e) { logger.error("请求改写出错,跳过", e); continue; }
                if (r?.then) continue;
                if (r?.body !== undefined) body = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
            }
            for (const s of reqSubs) if (test(s.matcher, info.url, info.method)) call(s.handler, { ...info, body, type: "xhr" });
            const rs = [...resRw].filter(s => test(s.matcher, info.url, info.method));
            if (rs.length) installXhrRewrite(this, info, rs);
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
        return send.call(this, body);
    };
}

/** XHR 响应改写:在这个实例上覆盖 responseText / response 的读取,第一次在完成后读取时同步算出改写结果 */
function installXhrRewrite(xhr, info, subs) {
    const proto = Object.getPrototypeOf(xhr);
    const getText = Object.getOwnPropertyDescriptor(W.XMLHttpRequest.prototype, "responseText")?.get;
    const getResp = Object.getOwnPropertyDescriptor(W.XMLHttpRequest.prototype, "response")?.get;
    if (!getText || !getResp) return;
    let computed = null;
    const compute = () => {
        if (computed) return computed;
        if (xhr.readyState !== 4) return null;
        const rt = xhr.responseType;
        if (rt !== "" && rt !== "text" && rt !== "json") return null;
        let text = rt === "json" ? JSON.stringify(getResp.call(xhr)) : getText.call(xhr);
        for (const s of subs) {
            let r;
            try { r = s.handler({ ...info, status: xhr.status, type: "xhr", text: () => text, json: () => JSON.parse(text) }); } catch (e) { logger.error("响应改写出错,跳过", e); continue; }
            if (r?.then) { logger.warn("XHR 响应的改写函数必须同步返回,已忽略"); continue; }
            if (r === undefined || r === null) continue;
            text = typeof r === "string" ? r : JSON.stringify(r);
        }
        return (computed = { text, rt });
    };
    try {
        Object.defineProperty(xhr, "responseText", { configurable: true, get() { const c = compute(); return c && c.rt !== "json" ? c.text : getText.call(this); } });
        Object.defineProperty(xhr, "response", { configurable: true, get() { const c = compute(); if (!c) return getResp.call(this); try { return c.rt === "json" ? JSON.parse(c.text) : c.text; } catch { return null; } } });
    } catch (e) { logger.debug("无法改写 XHR 响应", e, proto); }
}

export function installNetworkHooks() {
    if (installed) return;
    installed = true;
    wrapFetch();
    wrapXhr();
}
export const isNetworkHooked = () => installed;

const addSub = (set, matcher, handler) => {
    installNetworkHooks();
    const s = { matcher, handler };
    set.add(s);
    return () => set.delete(s);
};
export const onRequest = (matcher, handler) => addSub(reqSubs, matcher, handler);
export const onResponse = (matcher, handler) => addSub(resSubs, matcher, handler);
/** 处理函数返回 { url, init, body } 改写请求、{ block: true } 拦截、或一个 Response 直接应答;可以是 async(XHR 只认同步结果) */
export const rewriteRequest = (matcher, handler) => addSub(reqRw, matcher, handler);
/** 处理函数返回一个 Response 替换响应(XHR:同步返回字符串或对象);不返回则不改 */
export const rewriteResponse = (matcher, handler) => addSub(resRw, matcher, handler);

// ---------- WebSocket / EventSource ----------
/** 消息事件:在本实例最先登记的监听里处理;返回 false 拦下(页面的监听和 onmessage 都收不到),返回其他值替换 data */
// 钩子按每条消息现查(不在 socket 创建时冻结):插件停了就不再调用它的钩子,后来启用的插件也能挂上已经打开的 socket
const liveSubs = (set, url, kind, hook) => { const out = []; for (const s of set) if (s.hooks[hook] && test(s.matcher, url, kind)) out.push(s); return out; };
function hookMessages(target, url, subsSet, kind) {
    target.addEventListener("message", e => {
        let data = e.data, changed = false;
        for (const s of liveSubs(subsSet, url, kind, "message")) {
            if (!s.hooks.message) continue;
            let r;
            try { r = s.hooks.message(data, target); } catch (err) { logger.error(`${kind} 消息处理出错`, err); continue; }
            if (r === false) { e.stopImmediatePropagation(); return; }
            if (r !== undefined) { data = r; changed = true; }
        }
        if (changed) { try { Object.defineProperty(e, "data", { value: data, configurable: true }); } catch { /* 忽略 */ } }
    });
}

function wrapConstructor(name, subsSet, onCreate) {
    const Orig = W[name];
    if (typeof Orig !== "function") return false;
    const P = new Proxy(Orig, {
        construct(target, args, newTarget) {
            const obj = Reflect.construct(target, args, newTarget === P ? target : newTarget);
            try {
                onCreate(obj, absUrl(args[0]));
            } catch (e) { logger.error(`${name} 包装出错`, e); }
            return obj;
        },
    });
    try { W[name] = P; return true; } catch (e) { logger.warn(`无法包装 ${name}`, e); return false; }
}

/** hooks:open(socket, url)、send(data, socket) 返回 false 不发出 / 其他值替换、message(data, socket) 返回 false 拦下 / 其他值替换 */
export function onWebSocket(matcher, hooks = {}) {
    if (!wsInstalled) {
        wsInstalled = true;
        wrapConstructor("WebSocket", wsSubs, (ws, url) => {
            hookMessages(ws, url, wsSubs, "WebSocket");
            const send = ws.send;
            Object.defineProperty(ws, "send", {
                configurable: true, writable: true,
                value: function (data) {
                    for (const s of liveSubs(wsSubs, url, "WebSocket", "send")) {
                        let r;
                        try { r = s.hooks.send(data, ws); } catch (e) { logger.error("WebSocket 发送处理出错", e); continue; }
                        if (r === false) return undefined;
                        if (r !== undefined) data = r;
                    }
                    return send.call(this, data);
                },
            });
            for (const s of liveSubs(wsSubs, url, "WebSocket", "open")) { try { s.hooks.open(ws, url); } catch (e) { logger.error("WebSocket open 处理出错", e); } }
        });
    }
    const s = { matcher, hooks };
    wsSubs.add(s);
    return () => wsSubs.delete(s);
}

/** hooks:open(source, url)、message(data, source) 返回 false 拦下 / 其他值替换 */
export function onEventSource(matcher, hooks = {}) {
    if (!esInstalled) {
        esInstalled = true;
        wrapConstructor("EventSource", esSubs, (es, url) => {
            hookMessages(es, url, esSubs, "EventSource");
            for (const s of liveSubs(esSubs, url, "EventSource", "open")) { try { s.hooks.open(es, url); } catch (e) { logger.error("EventSource open 处理出错", e); } }
        });
    }
    const s = { matcher, hooks };
    esSubs.add(s);
    return () => esSubs.delete(s);
}
