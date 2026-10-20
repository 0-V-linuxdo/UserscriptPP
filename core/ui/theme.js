// 核心界面的明暗:站点 theme() 优先,否则按 prefers-color-scheme 和页面背景色推断
import { getSite } from "../lib/sites.js";
import { setAttr } from "../lib/dom.js";

function luminance(color) {
    const m = /rgba?\(([^)]+)\)/.exec(color || "");
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (!(a > 0)) return null;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function detectTheme() {
    const site = getSite();
    if (typeof site.theme === "function") {
        try { const t = site.theme(); if (t === "dark" || t === "light") return t; } catch { /* 退回推断 */ }
    }
    for (const el of [document.body, document.documentElement]) {
        if (!el) continue;
        const l = luminance(getComputedStyle(el).backgroundColor);
        if (l != null) return l < 0.5 ? "dark" : "light";
    }
    try { return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
}

export const currentTheme = () => document.documentElement?.getAttribute("data-uspp-theme") || detectTheme();

let installed = false;
export function installThemeWatcher() {
    if (installed) return;
    installed = true;
    const update = () => { if (document.documentElement) setAttr(document.documentElement, "data-uspp-theme", detectTheme()); };
    update();
    try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update); } catch { /* 忽略 */ }
    // 站点切换明暗通常改 <html> / <body> 的 class、style 或 data 属性
    let t = 0;
    const later = () => { clearTimeout(t); t = setTimeout(update, 50); };
    const mo = new MutationObserver(recs => { if (recs.some(r => r.attributeName !== "data-uspp-theme")) later(); });
    const watch = () => {
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-color-mode"] });
        if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    };
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", () => { watch(); update(); }, { once: true });
}
