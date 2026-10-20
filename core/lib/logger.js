import { IS_DEV } from "../env.js";

const COLORS = { log: "#a78bfa", info: "#38bdf8", warn: "#f59e0b", error: "#ef4444", debug: "#9ca3af" };

export class Logger {
    constructor(name, color = "#a78bfa") {
        this.name = name;
        this.color = color;
    }
    _out(level, args) {
        if (level === "debug" && !IS_DEV) return;
        const fn = console[level] || console.log;
        fn.call(console,
            `%c Userscript++ %c %c ${this.name} `,
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
