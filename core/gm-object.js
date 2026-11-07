// 脚本管理器的 GM 对象(GM.xxx 异步接口)。单独放一个模块:env.js 自己导出的 GM 会遮住同名全局
/* global GM */
export const GM_OBJECT = typeof GM !== "undefined" && GM && typeof GM === "object" ? GM : null;
