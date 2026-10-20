// 运行环境:页面真实 window 与脚本管理器 API
/* global unsafeWindow, GM_getValue, GM_setValue, GM_deleteValue, GM_xmlhttpRequest, GM_addValueChangeListener, GM_removeValueChangeListener, GM_registerMenuCommand, GM_unregisterMenuCommand, GM_setClipboard */

export const W = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;

export const GM = {
    get: typeof GM_getValue === "function" ? GM_getValue : null,
    set: typeof GM_setValue === "function" ? GM_setValue : null,
    del: typeof GM_deleteValue === "function" ? GM_deleteValue : null,
    xhr: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null,
    addListener: typeof GM_addValueChangeListener === "function" ? GM_addValueChangeListener : null,
    removeListener: typeof GM_removeValueChangeListener === "function" ? GM_removeValueChangeListener : null,
    menu: typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : null,
    unmenu: typeof GM_unregisterMenuCommand === "function" ? GM_unregisterMenuCommand : null,
    clipboard: typeof GM_setClipboard === "function" ? GM_setClipboard : null,
};

export const VERSION = typeof __USPP_VERSION__ !== "undefined" ? __USPP_VERSION__ : "0.0.0";
export const IS_DEV = typeof __USPP_DEV__ !== "undefined" ? __USPP_DEV__ : false;
export const BUILD_TYPE = IS_DEV ? "development" : "production";

export const isChromium = () => !!W.chrome;
