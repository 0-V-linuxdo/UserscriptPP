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
import { guard, reportPluginError } from "./plugin-errors.js";

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
    // Set 保持插入顺序;提前撤销或定时器到点后,条目连同闭包从这里删掉,长开的标签页不会越积越多
    const list = new Set();
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    let disposed = false, suspended = false;
    const live = () => !disposed && !suspended;
    const register = fn => {
        if (typeof fn !== "function") return fn;
        if (disposed) { try { fn(); } catch (e) { logger.error(`${name} 清理出错`, e); } return fn; }
        list.add(fn);
        return fn;
    };
    const unregister = fn => list.delete(fn);
    // 包一层:返回的撤销函数既登记到作用域,也可以提前手动调用(只执行一次)
    const own = off => {
        if (typeof off !== "function") return off;
        let done = false;
        const once = () => { if (done) return; done = true; list.delete(once); off(); };
        register(once);
        return once;
    };
    const g = (where, fn) => guard(name, where, fn, false, live);
    const t = (where, fn) => guard(name, where, fn, true, live);
    // 方法补丁的 instead:插件停了就直接调用原方法(不能返回 undefined 顶替原方法的结果)
    const insteadOf = fn => typeof fn === "function" ? guard(name, "patch:instead", (args, next, self) => live() ? fn(args, next, self) : next(...args), true) : fn;
    const wrapHooks = (kind, hooks) => hooks && typeof hooks === "object"
        ? Object.fromEntries(Object.entries(hooks).map(([k, v]) => [k, t(`${kind}:${k}`, v)])) : hooks;
    // 注入点内容的点击处理(onClick / onSelect)出错也归到插件
    const wrapItem = (slot, def) => def && typeof def === "object"
        ? { ...def, ...Object.fromEntries(["onClick", "onSelect"].filter(k => typeof def[k] === "function").map(k => [k, g(`${slot}:${k}`, def[k])])) } : def;
    const ctx = {
        plugin: name,
        get signal() { return ac?.signal; },
        get disposed() { return disposed; },
        /** 插件是否还在运行(没停止、没被熔断);异步工作完成后可以据此决定要不要继续 */
        get live() { return live(); },
        get pending() { return list.size; },
        register,
        // 插件给的回调都包一层,出错记到本插件名下(见 plugin-errors.js)。返回值有意义的(网络改写、渲染钩子、方法补丁)照常抛给调用方
        observe: (selector, opts = {}) => own(observe(selector, { ...opts, added: g("observe", opts.added), removed: g("observe", opts.removed) })),
        onRouteChange: fn => own(onRouteChange(g("route", fn))),
        onRequest: (m, fn) => own(onRequest(m, g("onRequest", fn))),
        onResponse: (m, fn) => own(onResponse(m, g("onResponse", fn))),
        rewriteRequest: (m, fn) => own(rewriteRequest(m, t("rewriteRequest", fn))),
        rewriteResponse: (m, fn) => own(rewriteResponse(m, t("rewriteResponse", fn))),
        onWebSocket: (m, hooks) => own(onWebSocket(m, wrapHooks("WebSocket", hooks))),
        onEventSource: (m, hooks) => own(onEventSource(m, wrapHooks("EventSource", hooks))),
        addRenderHook: (type, fn) => own(addRenderHook(type, t("renderHook", fn))),
        subscribe: (ev, fn) => own(subscribe(ev, g(`event:${ev}`, fn))),
        onSlotChange: (slot, fn) => own(onSlotChange(slot, g(`slot:${slot}`, fn))),
        addSlotItem: (slot, id, def) => { addSlotItem(slot, id, wrapItem(slot, def)); return own(() => removeSlotItem(slot, id)); },
        patch: (obj, method, hooks) => own(patchMethod(obj, method, hooks && typeof hooks === "object"
            ? Object.fromEntries(Object.entries(hooks).map(([k, v]) => [k, k === "instead" ? insteadOf(v) : t(`patch:${method}`, v)])) : hooks)),
        listen: (target, type, fn, opts) => {
            if (!target?.addEventListener) return () => { };
            const wrapped = typeof fn === "function" ? g(`listen:${type}`, fn) : fn;
            target.addEventListener(type, wrapped, opts);
            return own(() => target.removeEventListener(type, wrapped, opts));
        },
        setTimeout: (fn, ms, ...a) => {
            let off = null;
            const run = g("timer", fn);
            const id = W.setTimeout(() => { off?.(); run(...a); }, ms);
            off = own(() => W.clearTimeout(id));
            return off;
        },
        setInterval: (fn, ms, ...a) => {
            const run = g("interval", fn);
            const id = W.setInterval(() => run(...a), ms);
            return own(() => W.clearInterval(id));
        },
        /** 插件自己捕获的错误也可以记到自己名下 */
        reportError: (err, where = "reported") => reportPluginError(name, where, err),
        get data() { return dataStoreFor(name); },
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        try { ac?.abort(); } catch { /* 忽略 */ }
        const fns = [...list].reverse();
        list.clear();
        for (const fn of fns) {
            try { fn(); } catch (e) { logger.error(`${name} 清理出错`, e); }
        }
    };
    // 熔断:先让本作用域的回调全部短路,真正的停止和清理稍后统一做
    const suspend = () => { suspended = true; };
    return { ctx, dispose, register, unregister, suspend, live };
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
/** 让插件的回调立即短路(熔断时用;之后照常停止插件) */
export const suspendScope = name => scopes.get(name)?.suspend();
/** 插件的作用域是否还活着 */
export const scopeLive = name => !!scopes.get(name)?.live();

/** 给"同步执行 start() 期间直接调用 U.*"用:返回的撤销函数登记到当前插件 */
export function ownByCurrent(off) {
    if (!current || typeof off !== "function") return off;
    const s = scopes.get(current);
    if (!s) return off;
    let done = false;
    const once = () => { if (done) return; done = true; s.unregister(once); off(); };
    s.register(once);
    return once;
}
