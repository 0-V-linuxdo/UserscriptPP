// 运行环境:页面真实 window 与脚本管理器 API
/* global unsafeWindow, GM_getValue, GM_setValue, GM_deleteValue, GM_xmlhttpRequest, GM_addValueChangeListener, GM_removeValueChangeListener, GM_registerMenuCommand, GM_unregisterMenuCommand, GM_setClipboard, GM_notification, GM_info */

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
    notification: typeof GM_notification === "function" ? GM_notification : null,
    info: typeof GM_info !== "undefined" ? GM_info : null,
};

/** 构建这条脚本所用的 Userscript++ 框架版本(框架 package.json 的 version) */
export const FRAMEWORK_VERSION = typeof __USPP_FRAMEWORK__ !== "undefined" ? __USPP_FRAMEWORK__ : "0.0.0";
export const VERSION = typeof __USPP_VERSION__ !== "undefined" ? __USPP_VERSION__ : "0.0.0";
export const IS_DEV = typeof __USPP_DEV__ !== "undefined" ? __USPP_DEV__ : false;
/** --hot 构建时是本机热重载服务的地址,否则为 null */
export const HOT_URL = typeof __USPP_HOT__ !== "undefined" ? __USPP_HOT__ : null;
export const BUILD_TYPE = IS_DEV ? "development" : "production";

export const isChromium = () => !!W.chrome;

// 本条脚本自己的身份(构建时由站点目录的 userscript.json 给出)。页面上留下的名字都带 SCRIPT_ID,两条基于框架的脚本互不干扰
const SCRIPT = typeof __USPP_SCRIPT__ !== "undefined" ? __USPP_SCRIPT__ : { id: "dev", name: "Userscript++ script", global: null };
export const SCRIPT_ID = SCRIPT.id;
export const SCRIPT_NAME = SCRIPT.name;
/** 控制台调试用的全局名字(开发构建缺省开启,发布构建缺省关闭);null 表示不挂 */
export const GLOBAL_NAME = SCRIPT.global || null;
/** userscript.json 的 supportURL(提问题的地方);没配时为 null,"Report a problem" 命令不出现 */
export const SUPPORT_URL = SCRIPT.supportURL || null;
/** 实例挂在 window 的这个 Symbol 上(不占用普通全局名字);补丁代码通过 INSTANCE_EXPR 找到本实例 */
export const INSTANCE_KEY = Symbol.for(`uspp:${SCRIPT_ID}`);
export const INSTANCE_EXPR = `window[Symbol.for(${JSON.stringify(`uspp:${SCRIPT_ID}`)})]`;
/** 公开接口版本:有不兼容改动时递增 */
export const API_VERSION = 1;
