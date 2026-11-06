/* global __USPP_DEV__ */
import { SCRIPT_NAME } from "../env.js";

const COLORS = { log: "#a78bfa", info: "#38bdf8", warn: "#f59e0b", error: "#ef4444", debug: "#9ca3af" };

// 发布构建里也能打开 debug(设置里的"输出调试日志");最近的 warn / error 留给诊断信息
let debugOn = __USPP_DEV__;
export function setDebugLogs(on) { debugOn = __USPP_DEV__ || !!on; }
const recent = [];
export const recentLogs = () => recent.slice();
const brief = a => { try { return a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : JSON.stringify(a)?.slice(0, 300) ?? String(a); } catch { return String(a); } };

export class Logger {
    constructor(name, color = "#a78bfa") {
        this.name = name;
        this.color = color;
    }
    _out(level, args) {
        if (level === "debug" && !debugOn) return;
        if (level === "warn" || level === "error") {
            recent.push({ at: new Date().toISOString(), level, source: this.name, text: args.map(brief).join(" ").slice(0, 500) });
            if (recent.length > 20) recent.shift();
        }
        const fn = console[level] || console.log;
        fn.call(console,
            `%c ${SCRIPT_NAME} %c %c ${this.name} `,
            `background:${COLORS[level]};color:#000;border-radius:4px 0 0 4px;font-weight:bold`,
            "",
            `background:${this.color};color:#000;border-radius:0 4px 4px 0`,
            ...args);
    }
    log(...a) { this._out("log", a); }
    info(...a) { this._out("info", a); }
    warn(...a) { this._out("warn", a); }
    error(...a) { this._out("error", a); }
    debug(...a) { this._out("debug", a); }
}
