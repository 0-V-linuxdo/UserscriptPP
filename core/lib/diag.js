// 诊断开关(只在开发构建里生效):分步关掉启动环节,并记录本脚本对页面的每个动作,用来在真实页面上定位"本脚本在场时别的脚本行为变了"
// 用法:在目标网站的控制台执行
//   localStorage.setItem("UserscriptPP:<脚本ID>:diag", JSON.stringify({ log: true, noFallback: true }))
// 然后硬刷新;读结果:copy(JSON.stringify(uspp_<脚本ID>.diag.report()));清除:localStorage.removeItem(同一个键)
//
// 开关:
//   log            记录动作和时间
//   noTurbopack    不拦截 TURBOPACK(不登记补丁、不挂分块、不监视)
//   noRegistry     拿到运行时后不挂注册表(不补包装已注册的工厂,不包装之后注册的)
//   noForeignWrap  分块里已被别的脚本包装过的工厂原样留下,不再套本脚本的包装
//   noOwnWrap      分块照样经过本脚本的 push,但不包装任何工厂
//   noSet          不重定义 window.TURBOPACK,只在现有值上挂 push(之后运行时换上的新值看不到)
//   noRead         本脚本的 push 不看分块,直接交给原来的 push
//   probeChunks    记下前 5 次 push 的分块形态(属性是数据还是访问器)
//   pushAfter      所有值上本脚本的 push 都先交给原来的 push 再看分块(正式行为只对先装脚本挂过的早期数组这样做)
//   coexistActive  先装的脚本已挂接 TURBOPACK 时仍照常挂接(缺省是让给对方,不挂接)
//   noFallback     补丁被绕过 / 被接管时不通知插件(不启用渲染兜底)
//   noHostPatches  不登记站点设置入口的补丁
//   noSiteStart    不运行站点的 start()
//   disablePlugins 不启动这些插件(含必需插件),例如 ["MyPlugin"]
import { IS_DEV, SCRIPT_ID, W } from "../env.js";

export const DIAG_KEY = `UserscriptPP:${SCRIPT_ID}:diag`;
let cfg = {};
if (IS_DEV) {
    try { cfg = JSON.parse(W.localStorage.getItem(DIAG_KEY) || "{}") || {}; } catch { cfg = {}; }
}
export const diag = Object.freeze({ ...cfg, disablePlugins: Array.isArray(cfg.disablePlugins) ? cfg.disablePlugins.slice() : [] });
export const diagOn = Object.keys(cfg).length > 0;

const events = [];
const counters = Object.create(null);
const now = () => Math.round(typeof performance !== "undefined" ? performance.now() : Date.now());

/** 记一个动作;只在 log 打开时记 */
export function trace(kind, data) {
    if (!diag.log) return;
    if (events.length < 20000) events.push(data === undefined ? [now(), kind] : [now(), kind, data]);
}
/** 只计数的高频动作(例如读取 TURBOPACK) */
export function count(kind) {
    if (!diag.log) return;
    counters[kind] = (counters[kind] || 0) + 1;
}

/** 页面实际加载的脚本分块(和本脚本无关,停用本脚本时可用同样的写法单独取) */
function loadedScripts() {
    try {
        return [...new Set(performance.getEntriesByType("resource").filter(e => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)).map(e => {
            try { return new URL(e.name).pathname; } catch { return e.name; }
        }))].sort();
    } catch { return []; }
}

// 页面加载的脚本:按时间记下,和本脚本的动作对照
if (diag.log) {
    try {
        new PerformanceObserver(list => {
            for (const e of list.getEntries()) if (e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)) {
                let name = e.name;
                try { name = new URL(e.name).pathname; } catch { /* 原样 */ }
                trace("page.script", { name, start: Math.round(e.startTime) });
            }
        }).observe({ type: "resource", buffered: true });
    } catch { /* 不支持 */ }
}

let extra = () => ({});
export function setDiagExtra(fn) { extra = fn; }

export function diagReport() {
    return { script: SCRIPT_ID, config: cfg, at: now(), counters: { ...counters }, scripts: loadedScripts(), ...extra(), events: events.slice() };
}
