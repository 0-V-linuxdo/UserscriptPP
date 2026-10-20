import { GM } from "../env.js";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function debounce(fn, ms = 100) {
    let t;
    const d = function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
    d.flush = () => { clearTimeout(t); fn(); };
    d.cancel = () => clearTimeout(t);
    return d;
}

export function onlyOnce(fn) {
    let done = false, result;
    return function (...args) {
        if (done) return result;
        done = true;
        return (result = fn.apply(this, args));
    };
}

export const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** showMenu -> "Show Menu", foo_bar-baz -> "Foo Bar Baz" */
export function humanizeKey(key) {
    return String(key)
        .replace(/[-_]+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

export function classNameFactory(prefix = "") {
    return (...names) => names.flat(Infinity).filter(Boolean).map(n => prefix + n).join(" ");
}

export function classes(...names) {
    const out = [];
    for (const n of names.flat(Infinity)) {
        if (!n) continue;
        if (typeof n === "object") { for (const k in n) if (n[k]) out.push(k); }
        else out.push(String(n));
    }
    return out.join(" ");
}

export async function copyToClipboard(text) {
    // 脚本管理器的剪贴板授权不需要页面焦点和用户手势
    if (GM.clipboard) {
        try { const r = GM.clipboard(String(text), "text"); if (r && typeof r.then === "function") await r; return true; } catch { /* 退回网页接口 */ }
    }
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch { /* 忽略 */ }
        ta.remove();
        return ok;
    }
}

export const isObject = v => v !== null && typeof v === "object";

export function safeCall(logger, label, fn, ...args) {
    try {
        return fn(...args);
    } catch (e) {
        logger.error(label, e);
    }
}
