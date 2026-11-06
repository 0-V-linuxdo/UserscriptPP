// 插件作用域 ctx:start(ctx) / stop(ctx) 拿到的对象。经 ctx 登记的监听、定时器、补丁、注入点内容等,插件停用时按登记的倒序自动撤掉
import { W } from "../env.js";
import { Logger } from "./logger.js";
import { observe } from "./dom.js";
import { onRouteChange } from "./route.js";
import { onRequest, onResponse, rewriteRequest, rewriteResponse, onWebSocket, onEventSource } from "./network.js";
import { addRenderHook } from "./jsxhook.js";
import { subscribe } from "./events.js";
import { addSlotItem, removeSlotItem, onSlotChange } from "./slots.js";
import { patchMethod } from "./patcher.js";
import { dataStoreFor } from "./datastore.js";

const logger = new Logger("Scope", "#a5b4fc");
const scopes = new Map(); // 插件名 -> 作用域

/** 正在同步执行 start() 的插件名;这期间直接调用的 U.* 也归到它名下(await 之后会丢,文档推荐一律用 ctx) */
let current = null;
export const currentOwner = () => current;
export function runAs(name, fn) {
    const prev = current;
    current = name;
    try { return fn(); } finally { current = prev; }
}

function createScope(name) {
    const list = [];
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    let disposed = false;
    const register = fn => {
        if (typeof fn !== "function") return fn;
        if (disposed) { try { fn(); } catch (e) { logger.error(`${name} 清理出错`, e); } return fn; }
        list.push(fn);
        return fn;
    };
    // 包一层:返回的撤销函数既登记到作用域,也可以提前手动调用(只执行一次)
    const own = off => {
        if (typeof off !== "function") return off;
        let done = false;
        const once = () => { if (done) return; done = true; off(); };
        register(once);
        return once;
    };
    const ctx = {
        plugin: name,
        get signal() { return ac?.signal; },
        get disposed() { return disposed; },
        register,
        observe: (selector, opts) => own(observe(selector, opts)),
        onRouteChange: fn => own(onRouteChange(fn)),
        onRequest: (m, fn) => own(onRequest(m, fn)),
        onResponse: (m, fn) => own(onResponse(m, fn)),
        rewriteRequest: (m, fn) => own(rewriteRequest(m, fn)),
        rewriteResponse: (m, fn) => own(rewriteResponse(m, fn)),
        onWebSocket: (m, hooks) => own(onWebSocket(m, hooks)),
        onEventSource: (m, hooks) => own(onEventSource(m, hooks)),
        addRenderHook: (type, fn) => own(addRenderHook(type, fn)),
        subscribe: (ev, fn) => own(subscribe(ev, fn)),
        onSlotChange: (slot, fn) => own(onSlotChange(slot, fn)),
        addSlotItem: (slot, id, def) => { addSlotItem(slot, id, def); return own(() => removeSlotItem(slot, id)); },
        patch: (obj, method, hooks) => own(patchMethod(obj, method, hooks)),
        listen: (target, type, fn, opts) => {
            if (!target?.addEventListener) return () => { };
            target.addEventListener(type, fn, opts);
            return own(() => target.removeEventListener(type, fn, opts));
        },
        setTimeout: (fn, ms, ...a) => {
            let off = null;
            const id = W.setTimeout(() => { off?.(); try { fn(...a); } catch (e) { logger.error(`${name} 定时器出错`, e); } }, ms);
            off = own(() => W.clearTimeout(id));
            return off;
        },
        setInterval: (fn, ms, ...a) => {
            const id = W.setInterval(() => { try { fn(...a); } catch (e) { logger.error(`${name} 定时器出错`, e); } }, ms);
            return own(() => W.clearInterval(id));
        },
        get data() { return dataStoreFor(name); },
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        try { ac?.abort(); } catch { /* 忽略 */ }
        for (const fn of list.splice(0).reverse()) {
            try { fn(); } catch (e) { logger.error(`${name} 清理出错`, e); }
        }
    };
    return { ctx, dispose, register };
}

/** 插件启动时取一个新作用域(上一次的已在停止时释放) */
export function openScope(name) {
    scopes.get(name)?.dispose();
    const s = createScope(name);
    scopes.set(name, s);
    return s.ctx;
}

/** 插件停止时释放:执行全部登记的清理 */
export function closeScope(name) {
    const s = scopes.get(name);
    if (!s) return;
    scopes.delete(name);
    s.dispose();
}

export const getScope = name => scopes.get(name)?.ctx ?? null;

/** 给"同步执行 start() 期间直接调用 U.*"用:返回的撤销函数登记到当前插件 */
export function ownByCurrent(off) {
    if (!current || typeof off !== "function") return off;
    const s = scopes.get(current);
    if (!s) return off;
    let done = false;
    const once = () => { if (done) return; done = true; off(); };
    s.register(once);
    return once;
}
