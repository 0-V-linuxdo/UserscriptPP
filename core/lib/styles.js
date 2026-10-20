// 样式管理:默认用可构造样式表(adoptedStyleSheets),不受页面 CSP 的内联样式限制,也不往页面里插节点;
// 站点声明 styleHost: "element" 时放在 <head> 里的 <uspp-styles> 容器中(便于在开发者工具里查看和覆盖)
import { Logger } from "./logger.js";
import { getSite } from "./sites.js";

const logger = new Logger("Styles", "#f9a8d4");
const styles = new Map(); // name -> { css, enabled, el }
let container = null;
let pendingDom = false;

const useSheets = (() => {
    let v = null;
    return () => {
        if (v === null) {
            try { v = getSite().styleHost !== "element" && "adoptedStyleSheets" in Document.prototype && typeof CSSStyleSheet.prototype.replaceSync === "function"; } catch { v = false; }
        }
        return v;
    };
})();

const ourSheets = new WeakSet();
function syncSheet(name) {
    const s = styles.get(name);
    const doc = document;
    if (s) {
        if (!s.sheet) { s.sheet = new CSSStyleSheet(); ourSheets.add(s.sheet); }
        if (s.sheetCss !== s.css) {
            try { s.sheet.replaceSync(s.css); } catch (e) { logger.warn(`样式 ${name} 解析失败`, e); }
            s.sheetCss = s.css;
        }
    }
    // 保留页面自己的样式表,本系统的按注册顺序放在最后
    const others = doc.adoptedStyleSheets.filter(x => !ourSheets.has(x));
    const ours = [...styles.values()].filter(x => x.enabled && x.sheet).map(x => x.sheet);
    doc.adoptedStyleSheets = [...others, ...ours];
}

function ensureContainer() {
    if (!document.head) {
        if (!pendingDom) {
            pendingDom = true;
            const go = () => { pendingDom = false; rebuild(); };
            if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
            else queueMicrotask(go);
            // head 可能早于 DOMContentLoaded 出现
            const mo = new MutationObserver(() => { if (document.head) { mo.disconnect(); go(); } });
            mo.observe(document.documentElement || document, { childList: true, subtree: true });
        }
        return null;
    }
    if (container && container.isConnected) return container;
    container = document.createElement("uspp-styles");
    container.style.display = "none";
    document.head.appendChild(container);
    // 容器被移除时,下次注册会重建;这里也主动恢复
    return container;
}

function rebuild() {
    const c = ensureContainer();
    if (!c) return;
    for (const [name, s] of styles) {
        if (!s.enabled) { s.el?.remove(); continue; }
        if (!s.el || s.el.parentNode !== c) {
            s.el = document.createElement("style");
            s.el.setAttribute("data-uspp", name);
            s.el.textContent = s.css;
            c.appendChild(s.el);
        }
    }
}

function sync(name) {
    if (useSheets()) return syncSheet(name);
    const s = styles.get(name);
    if (!s) return;
    const c = ensureContainer();
    if (!c) return;
    if (!container.isConnected) return rebuild();
    if (!s.enabled) { s.el?.remove(); return; }
    if (!s.el || s.el.parentNode !== c) {
        // 容器可能被页面移除后重建,先整体恢复
        if (s.el && s.el.parentNode !== c) return rebuild();
        s.el = document.createElement("style");
        s.el.setAttribute("data-uspp", name);
        c.appendChild(s.el);
    }
    if (s.el.textContent !== s.css) s.el.textContent = s.css;
}

export function registerStyle(name, css, enabled = true) {
    const s = styles.get(name);
    if (s) { s.css = css; if (enabled) s.enabled = true; }
    else styles.set(name, { css, enabled, el: null });
    if (!useSheets() && container && !container.isConnected) { container = null; rebuild(); }
    else sync(name);
}

export function enableStyle(name) {
    const s = styles.get(name);
    if (!s) { logger.warn(`样式 ${name} 未注册`); return false; }
    if (s.enabled) return false;
    s.enabled = true;
    sync(name);
    return true;
}

export function disableStyle(name) {
    const s = styles.get(name);
    if (!s || !s.enabled) return false;
    s.enabled = false;
    s.el?.remove();
    s.el = null;
    if (useSheets()) syncSheet(name);
    return true;
}

export function unregisterStyle(name) {
    const s = styles.get(name);
    if (!s) return false;
    s.el?.remove();
    styles.delete(name);
    if (useSheets()) syncSheet(null);
    return true;
}

export const isStyleEnabled = name => !!styles.get(name)?.enabled;
export const hasStyle = name => styles.has(name);
