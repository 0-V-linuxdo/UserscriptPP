// 路由工具:单页应用网址变化时派发 routeChange
import { W } from "../env.js";
import { dispatch, subscribe, Events } from "./events.js";

let installed = false;
let last = null;
let parser = null;

/** 站点可提供把网址解析成站点语义的函数(例如会话 ID),结果附在事件数据的 info 上 */
export function setRouteParser(fn) { parser = typeof fn === "function" ? fn : null; }

function check() {
    const url = location.href;
    if (url === last) return;
    const prev = last;
    last = url;
    let info;
    if (parser) { try { info = parser(new URL(url)); } catch { info = undefined; } }
    dispatch(Events.ROUTE_CHANGE, { url, previous: prev, info });
}

/** 只包装一次历史接口;串联别人已有的包装,不覆盖 */
export function installRouteWatcher() {
    if (installed) return;
    installed = true;
    last = location.href;
    const H = W.history;
    for (const name of ["pushState", "replaceState"]) {
        const orig = H[name];
        if (typeof orig !== "function") continue;
        const wrapped = function (...args) {
            const r = orig.apply(this, args);
            try { check(); } catch { /* 忽略 */ }
            return r;
        };
        try { H[name] = wrapped; } catch { /* 只读时退回轮询 */ }
    }
    W.addEventListener("popstate", check);
    W.addEventListener("hashchange", check);
}

export function onRouteChange(fn) {
    installRouteWatcher();
    return subscribe(Events.ROUTE_CHANGE, fn);
}
