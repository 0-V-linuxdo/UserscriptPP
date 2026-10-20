// 事件:核心事件 + 当前站点声明的事件,插件用同一个 subscribe 订阅
import { Logger } from "./logger.js";

const logger = new Logger("Events", "#fde68a");
const handlers = new Map();

export const Events = Object.freeze({
    PLUGIN_TOGGLE: "pluginToggle",
    PLUGIN_PIN: "pluginPin",
    PLUGIN_STAR: "pluginStar",
    RELOAD_NEEDED: "reloadNeeded",
    SETTINGS_SYNC: "settingsSync",
    SITE_READY: "siteReady",
    ROUTE_CHANGE: "routeChange",
});
const CORE = new Set(Object.values(Events));
let siteEvents = new Set();

/** 当前站点在定义里声明的事件名 */
export function setSiteEvents(list) { siteEvents = new Set(Array.isArray(list) ? list : []); }
export const isKnownEvent = name => CORE.has(name) || siteEvents.has(name);

export function subscribe(event, handler) {
    if (!isKnownEvent(event)) logger.debug(`订阅了当前站点没有声明的事件 ${event}`);
    let set = handlers.get(event);
    if (!set) handlers.set(event, set = new Set());
    set.add(handler);
    return () => set.delete(handler);
}

export function dispatch(event, data) {
    const set = handlers.get(event);
    if (!set) return;
    for (const h of [...set]) {
        try { h(data); } catch (e) { logger.error(`事件 ${event} 的处理函数出错`, e); }
    }
}
