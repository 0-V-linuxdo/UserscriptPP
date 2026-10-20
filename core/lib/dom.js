// DOM 工具:共用一个 MutationObserver 的元素观察、等待元素、幂等写入(自身写入不触发自身)
import { Logger } from "./logger.js";

const logger = new Logger("DOM", "#a7f3d0");
const subs = new Set(); // { selector, added, removed, root }
let mo = null;
let pendingAdded = new Set(), pendingRemoved = new Set();
let scheduled = false;
const selfNodes = new WeakSet();   // 框架插入的节点
const selfWrites = new WeakMap();  // 节点 -> Set<属性名 | "#text">

const raf = cb => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : setTimeout(cb, 16));

function isSelfRecord(r) {
    if (r.type === "childList") {
        const nodes = [...r.addedNodes, ...r.removedNodes];
        return nodes.length > 0 && nodes.every(n => selfNodes.has(n));
    }
    const set = selfWrites.get(r.target);
    if (!set) return false;
    if (r.type === "attributes") return set.has(r.attributeName);
    return set.has("#text");
}

function collect(records) {
    for (const r of records) {
        if (isSelfRecord(r)) continue;
        if (r.type !== "childList") continue;
        for (const n of r.addedNodes) if (n.nodeType === 1) pendingAdded.add(n);
        for (const n of r.removedNodes) if (n.nodeType === 1) pendingRemoved.add(n);
    }
    if ((pendingAdded.size || pendingRemoved.size) && !scheduled) { scheduled = true; raf(flush); }
}

function matchesIn(node, selector) {
    const out = [];
    try {
        if (node.matches?.(selector)) out.push(node);
        if (node.querySelectorAll) out.push(...node.querySelectorAll(selector));
    } catch { /* 选择器无效 */ }
    return out;
}

function flush() {
    scheduled = false;
    const added = [...pendingAdded].filter(n => n.isConnected), removed = [...pendingRemoved].filter(n => !n.isConnected);
    pendingAdded = new Set(); pendingRemoved = new Set();
    for (const s of [...subs]) {
        if (s.added) {
            const hits = new Set();
            for (const n of added) for (const m of matchesIn(n, s.selector)) if (!s.root || s.root.contains(m)) hits.add(m);
            for (const el of hits) { try { s.added(el); } catch (e) { logger.error("observe 回调出错", e); } }
        }
        if (s.removed) {
            const hits = new Set();
            for (const n of removed) for (const m of matchesIn(n, s.selector)) hits.add(m);
            for (const el of hits) { try { s.removed(el); } catch (e) { logger.error("observe 回调出错", e); } }
        }
    }
}

function ensureObserver() {
    if (mo) return;
    const target = document.documentElement || document;
    mo = new MutationObserver(collect);
    mo.observe(target, { childList: true, subtree: true });
}

/** 观察匹配选择器的元素出现 / 消失;已存在的元素在下一帧按"出现"通知一次。返回退订函数 */
export function observe(selector, { added, removed, root } = {}) {
    const s = { selector, added, removed, root };
    subs.add(s);
    ensureObserver();
    if (added) raf(() => {
        if (!subs.has(s)) return;
        for (const el of matchesIn(root || document, selector)) { try { added(el); } catch (e) { logger.error("observe 回调出错", e); } }
    });
    return () => subs.delete(s);
}

/** 元素已存在立即完成,否则等它出现;超时返回 null */
export function waitForElement(selector, { root, timeout = 0 } = {}) {
    const now = (root || document).querySelector?.(selector);
    if (now) return Promise.resolve(now);
    return new Promise(resolve => {
        let timer = 0;
        const off = observe(selector, { root, added: el => { off(); clearTimeout(timer); resolve(el); } });
        if (timeout > 0) timer = setTimeout(() => { off(); resolve(null); }, timeout);
    });
}

// ---------- 写入工具:值不变时不写 DOM;写入产生的变更不触发观察回调 ----------
function markWrite(el, key) {
    let set = selfWrites.get(el);
    if (!set) selfWrites.set(el, set = new Set());
    set.add(key);
    // 立即取走本次写入产生的记录,别人的记录照常处理
    if (mo) collect(mo.takeRecords());
}

export function setAttr(el, name, value) {
    if (!el) return false;
    if (value == null || value === false) {
        if (!el.hasAttribute(name)) return false;
        el.removeAttribute(name);
    } else {
        const v = value === true ? "" : String(value);
        if (el.getAttribute(name) === v) return false;
        el.setAttribute(name, v);
    }
    markWrite(el, name);
    return true;
}

export function setText(el, text) {
    if (!el) return false;
    const v = String(text ?? "");
    if (el.textContent === v) return false;
    el.textContent = v;
    markWrite(el, "#text");
    for (const n of el.childNodes) selfNodes.add(n);
    return true;
}

export function toggleClass(el, name, force) {
    if (!el) return false;
    const has = el.classList.contains(name);
    const want = force === undefined ? !has : !!force;
    if (has === want) return false;
    el.classList.toggle(name, want);
    markWrite(el, "class");
    return true;
}

export function setStyle(el, prop, value) {
    if (!el) return false;
    const v = value == null ? "" : String(value);
    if (el.style.getPropertyValue(prop) === v) return false;
    if (v) el.style.setProperty(prop, v); else el.style.removeProperty(prop);
    markWrite(el, "style");
    return true;
}

/** 插入框架自己的节点(只插一次;已在原位时不动) */
export function mount(parent, node, before = null) {
    if (!parent || !node) return node;
    selfNodes.add(node);
    if (node.parentNode === parent && (before == null ? node === parent.lastChild || node.nextSibling == null : node.nextSibling === before)) return node;
    parent.insertBefore(node, before);
    if (mo) collect(mo.takeRecords());
    return node;
}

export function unmount(node) {
    if (!node?.parentNode) return;
    selfNodes.add(node);
    node.remove();
    if (mo) collect(mo.takeRecords());
}

export const isSelfNode = n => selfNodes.has(n);
