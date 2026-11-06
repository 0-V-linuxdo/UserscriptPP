const uiOf = (d, tag) => { const h = d.querySelector(tag); const sr = h?.shadowRoot; return sr ? (sr.querySelector(`[class$="shadow-mount"]`) ?? sr) : h; };
// 本地冒烟:jsdom + 仿 Turbopack 运行时 + 仿 Grok 模块
const { JSDOM } = require("jsdom");
const fs = require("fs");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const order = process.argv[3] || "first"; // first | foreignInner | foreignOuter
// 构建时页面上的名字都带脚本 ID
const ID = process.env.USPP_ID || "grok";
const SK = `UserscriptPP:${ID}:settings`, KEY = Symbol.for(`uspp:${ID}`);
const px = `uspp-${ID}-`, us = `uspp_${ID}_`, da = `data-uspp-${ID}`;
const dom = new JSDOM(`<!doctype html><html><head><script nonce="abc"></script></head><body></body></html>`, { url: "https://grok.com/", runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window;
for (const k of ["window","document","navigator","HTMLElement","HTMLIFrameElement","Node","Element","Event","MouseEvent","KeyboardEvent","getComputedStyle","requestAnimationFrame","cancelAnimationFrame"]) { try { globalThis[k] = k==="window"?w:w[k]; } catch {} }
const errors = [];
w.addEventListener("error", e => errors.push("uncaught: " + (e.error?.stack || e.message)));
const origErr = w.console.error;
const logs = [];
for (const k of ["log", "info", "warn", "error", "debug"]) w.console[k] = (...a) => logs.push(`[${k}] ` + a.map(x => x instanceof Error ? x.stack : typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()).join(" "));
const store = new Map();
const valueListeners = [];
const menus = [];
w.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
w.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); valueListeners.filter(l => l.k === k).forEach(l => l.fn(k, old, v, false)); };
w.GM_deleteValue = k => store.delete(k);
w.GM_addValueChangeListener = (k, fn) => valueListeners.push({ k, fn });
w.GM_removeValueChangeListener = () => { };
w.GM_registerMenuCommand = (name, fn) => menus.push({ name, fn });
// 薄副本在 GM 里,厚副本在 localStorage 里:应以厚副本为主
store.set("UserscriptPPSettings", { plugins: { Settings: { enabled: false } } });
if (process.env.DIAG) w.localStorage.setItem(`UserscriptPP:${ID}:diag`, process.env.DIAG);
w.localStorage.setItem(SK, JSON.stringify({ plugins: { Settings: { starredPlugins: ["Thick"], sites: { grok: { themes: [{ url: "local-thick", name: "Thick", local: true, css: "i{}", enabled: false }] } } }, ContextMenuAPI: {} } }));
w.GM_xmlhttpRequest = o => { setTimeout(() => o.onload({ status: 200, statusText: "OK", responseText: "/** @name Online T\n @author A */ body{color:red}", responseHeaders: "", finalUrl: o.url }), 5); return { abort() { } }; };
w.chrome = {}; w.Response = globalThis.Response;
w.__React = require("react");
w.__Jsx = { ...require("react/jsx-runtime") };
w.__RDC = require("react-dom/client");
w.__RD = require("react-dom");
w.TURBOPACK = w.eval("[]"); // 页面自己的数组(页面的执行环境)

// 别人的补丁器(模拟另一个用户脚本)
function foreignWrap(f) {
    const g = function (...a) { return f.apply(this, a); };
    g.toString = () => Function.prototype.toString.call(f);
    return g;
}
if (order === "foreignFirst") {
    // 它第一次执行模块时拿到运行时注册表,也挂上注册表的 set:之后注册的工厂由它包装;记下每个模块被它处理的次数
    const regVisits = w.__foreignRegVisits = {};
    let hooked = false;
    const hookReg = ctx => {
        if (hooked || !ctx) return;
        const reg = Object.getPrototypeOf(ctx).M;
        if (!reg) return;
        hooked = true;
        const prev = reg.set;
        reg.set = function (id, f) { regVisits[id] = (regVisits[id] || 0) + 1; return prev.call(this, id, typeof f === "function" ? foreignWrapReg(f) : f); };
    };
    const foreignWrapReg = f => { const g = function (ctx, ...a) { hookReg(ctx); return f.call(this, ctx, ...a); }; g.toString = () => String(f.toString()); return g; };
    w.__foreignHookReg = hookReg;
    // 别人先装:访问器 + 包装 push,把每个工厂换成自己的包装
    // 每次读取都确认值上还有自有的 push 数据属性,没有(例如被改成访问器)就当作自己还没挂上,重新挂一层;
    // 记下每个分块被它处理的次数:本脚本在场不应让它多处理

    let cur = w.TURBOPACK;
    const visits = w.__foreignVisits = {};
    const OURS = Symbol.for(`uspp.${ID}.factory`);
    w.__foreignSawOurs = 0;
    const wrapChunk = c => { visits[String(c[0])] = (visits[String(c[0])] || 0) + 1; for (let i = 1; i < c.length; i++) if (typeof c[i] === "function") { if (c[i][OURS]) w.__foreignSawOurs++; const inner = foreignWrap(c[i]); const fid = c[i - 1]; const ts = inner.toString; inner.toString = () => { if (!registry.has(fid)) w.__foreignEarlyToString = (w.__foreignEarlyToString || 0) + 1; return ts(); }; c[i] = function (ctx, ...a) { hookReg(ctx); return inner.call(this, ctx, ...a); }; c[i].toString = () => String(inner.toString()); } };
    const inst = v => {
        if (!v) return v;
        const d = Object.getOwnPropertyDescriptor(v, "push");
        if (v.$$f && d && typeof d.value === "function") return v;
        if (Array.isArray(v) && !v.$$f) v.forEach(wrapChunk);
        v.$$f = 1;
        const p = v.push;
        const mine = function (...cs) { cs.forEach(wrapChunk); return p.apply(this, cs); };
        mine.$$foreign = 1;
        v.push = mine;
        return v;
    };
    inst(cur);
    Object.defineProperty(w, "TURBOPACK", { configurable: true, get: () => inst(cur), set: v => { cur = inst(v); } });
}

w.eval(bundle);

if (order === "foreignAfter") {
    // 别人后装:替换 TURBOPACK 访问器,但串联现有访问器;执行时绕过内层包装(直接执行自己编译的原文)
    const d = Object.getOwnPropertyDescriptor(w, "TURBOPACK");
    const unwrap = f => { const src = String(f); return w.eval("(" + src + ")"); };
    const wrapChunk = c => { for (let i = 1; i < c.length; i++) if (typeof c[i] === "function") { const inner = c[i]; const own = unwrap(inner); c[i] = function (...a) { return own.apply(this, a); }; c[i].toString = () => Function.prototype.toString.call(own); } };
    const inst = v => { if (v && !v.$$f) { v.$$f = 1; const p = v.push; v.push = function (...cs) { cs.forEach(wrapChunk); return p.apply(this, cs); }; } return v; };
    Object.defineProperty(w, "TURBOPACK", { configurable: true, get: () => inst(d.get.call(w)), set: v => d.set.call(w, inst(v)) });
}

if (order === "takeover") {
    // 别人后装且不串联(和 Void++ 后装时看到的一样):取走现有的值,换掉它的 push,自己处理分块后直接用数组原生 push;
    // 再把 TURBOPACK 重定义成自己的 getter,运行时设置的新值也自己收下,不交给本脚本
    let cur = w.TURBOPACK;
    const wrapChunk = c => { for (let i = 1; i < c.length; i++) if (typeof c[i] === "function") c[i] = foreignWrap(c[i]); };
    const own = v => {
        if (!v) return v;
        const base = Array.isArray(v) ? w.Array.prototype.push : v.push;
        v.push = function handleChunkPush(...cs) { cs.forEach(wrapChunk); return base.apply(this, cs); };
        return v;
    };
    own(cur);
    Object.defineProperty(w, "TURBOPACK", { configurable: true, get: function () { return cur; }, set: v => { cur = own(v); } });
}

// ---------- 仿 Grok 模块(源码文本决定补丁是否命中) ----------
const { lazy: LAZY, ...M } = require("./grok-modules.cjs");
// LATE=1:头像菜单不在模块顶层取下拉组件,下拉组件模块要晚些才执行
if (process.env.LATE) M[12] = M[12].replace("h=e.r(20),", "").replace("function Avatar(){", "function Avatar(){let h=e.r(20);");
const factories = Object.fromEntries(Object.entries(M).map(([id, src]) => [id, w.eval("(" + src + ")")]));

// ---------- 仿运行时 ----------
const registry = new w.Map(), cache = {};
class Ctx { constructor(m, e) { this.m = m; this.e = e; } }
Ctx.prototype.M = registry; Ctx.prototype.c = cache;
Ctx.prototype.r = function (id) {
    if (cache[id]) return cache[id].exports;
    const f = registry.get(id); if (!f) throw new Error("no module " + id);
    const mod = { exports: {}, id }; cache[id] = mod;
    f.call(mod.exports, new Ctx(mod, mod.exports), mod, mod.exports);
    return mod.exports;
};
Ctx.prototype.s = function (arr) {
    for (let i = 0; i < arr.length;) { const n = arr[i]; if (arr[i + 1] === 0) { const v = arr[i + 2]; Object.defineProperty(this.e, n, { get: () => v, enumerable: true }); i += 3; } else { Object.defineProperty(this.e, n, { get: arr[i + 1], enumerable: true }); i += 2; } }
};
// 加载分块:页面里取回分块文件再执行(这里直接把懒分块推给 TURBOPACK)
const lazyChunkText = `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["static/chunks/lazy-x.js",${Object.entries(LAZY).map(([id, src]) => `${id},${src}`).join(",")}]);`;
w.__lazyLoads = 0;
Ctx.prototype.l = function (path) { w.__lazyLoads++; w.TURBOPACK.push([path, ...Object.entries(LAZY).flatMap(([id, src]) => [+id, w.eval("(" + src + ")")])]); return Promise.resolve(); };
Ctx.prototype.A = function (id) { return Promise.resolve(this.r(id)); };
w.__fetched = [];
w.fetch = async u => { w.__fetched.push(String(u)); return String(u).endsWith("/_next/static/chunks/lazy-x.js") ? { ok: true, status: 200, text: async () => lazyChunkText } : { ok: false, status: 404, text: async () => "" }; };
const F = c => { for (let i = 1; i < c.length; i++) { const v = c[i]; if (typeof v === "function") registry.has(c[i - 1]) || registry.set(c[i - 1], v); } };

// 早期分块在运行时启动前推入数组
// LATE=1 时下拉组件模块不经分块推入,只出现在运行时缓存里(相当于被别的脚本直接执行)
const ids = Object.keys(factories).map(Number).filter(id => !(process.env.LATE && id === 20));
w.TURBOPACK.push(["static/chunks/a.js", ...ids.slice(0, 6).flatMap(id => [id, factories[id]])]);
// 运行时启动:处理已有分块,替换为 {push:F}
const pending = w.TURBOPACK.slice ? w.TURBOPACK.slice() : [];
w.TURBOPACK = { push: F };
for (const c of pending) F(c);
w.TURBOPACK.push(["static/chunks/b.js", ...ids.slice(6).flatMap(id => [id, factories[id]])]);
if (process.env.LATE) registry.set(20, factories[20]);

const root = new Ctx({ exports: {} }, {});
const req = id => root.r(id);
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // LATE=1:头像菜单模块先于下拉组件模块被执行(兜底触发时组件还取不到)
    const loadOrder = process.env.LATE ? [1, 2, 3, 4, 21, 10, 11, 12, 15, 16, 30, 42] : [1, 2, 3, 4, 20, 21, 10, 11, 12, 13, 14, 15, 16, 30, 42];
    for (const id of loadOrder) { try { req(id); } catch (e) { errors.push("require " + id + ": " + e.stack); } }
    await sleep(50);
    if (process.env.LATE) { req(20); req(13); req(14); await sleep(2500); }
    req(31); req(32); req(33);
    await sleep(400);
    // 接管要看完宽限期(之后的分块是否仍经过本脚本)才认定;共存的几种顺序也等完,确认没有被误判成接管
    await sleep(1500);
    const P = w[KEY].api;
    const out = {};
    if (process.env.DUMP) { console.log("DUMP" + JSON.stringify(P.patches.map(p => ({ plugin: p.plugin, find: (Array.isArray(p.find) ? p.find : [p.find]).map(f => f instanceof w.RegExp ? { re: f.source } : f), rep: p.replacement.map(r => [r.match.source, r.match.flags]) })))); process.exit(0); }
    if (process.env.DIAG) { const r = P.diag.report(); out.diag = { config: r.config, kinds: [...new Set(r.events.map(e => e[1]))].sort(), plugins: r.plugins, fallbacks: r.stats.injectionFallbacks, runtimeCache: r.runtimeCache, counters: r.counters }; }
    out.foreignVisits = w.__foreignVisits || null;
    out.foreignRegVisits = w.__foreignRegVisits || null;
    out.foreignSawOurs = w.__foreignSawOurs ?? null;
    out.foreignEarlyToString = w.__foreignEarlyToString || 0;
    out.dbgPatches = P.patches.map(p=>p.plugin+':'+String(p.rawFind)+':'+p.consumed+':'+p.checkOnly);
    const rep = P.patchReport();
    out.stats = rep.stats; out.orphaned = rep.orphaned;
    out.statuses = rep.results.map(r => `${r.plugin} ${r.find} -> ${r.replacements.map(x => x.status).join(",")}`);
    out.plugins = Object.values(P.plugins).map(p => `${p.name}:${p.started}`);
    const reg = req(10);
    out.groups = reg.NAV_GROUPS; out.tabs = reg.TAB_REGISTRY.map(t => t.id);
    const dlg = req(11);
    out.groupLabel = dlg.groupLabel(`${us}settings`);
    const tl = dlg.tabLabel({ id: `${us}themes_tab` }); out.tabLabel = typeof tl === "string" ? tl : "<element>";
    const { renderToStaticMarkup } = require("react-dom/server");
    const R = w.__React;
    P.addContextMenuItem("user", "u1", { label: "ProbeUser", onSelect() { } });
    try { out.avatar = renderToStaticMarkup(R.createElement(req(12).AvatarDropdownMenu)).slice(0, 3000); } catch (e) { errors.push("avatar render: " + e.stack); }
    P.addContextMenuItem("conversation", "t1", { label: "Probe", onSelect() { } });
    try { out.conv = renderToStaticMarkup(R.createElement(req(13).ConversationItem, { id: "c1" })); } catch (e) { errors.push("conv: " + e.stack); }
    try { out.more = renderToStaticMarkup(R.createElement(req(14).MoreActions, { r: { responseId: "r1" } })).slice(0, 300); } catch (e) { errors.push("more: " + e.stack); }
    // 菜单补丁:插件改 Grok 原生的会话菜单项(去掉 del)
    P.addSlotItem("conversationMenu", "patch1", { patch: items => items.filter(i => i.id !== "del") });
    try { out.convPatched = renderToStaticMarkup(R.createElement(req(13).ConversationItem, { id: "c1" })); } catch (e) { errors.push("conv patched: " + e.stack); }
    P.removeSlotItem("conversationMenu", "patch1");
    // 发送前拦截器:改写 / 取消发送请求;没有拦截器时请求不经过改写
    {
        const sent = [];
        const offSeen = P.rewriteRequest(u => u.includes("/rest/app-chat/"), ctx => { sent.push(ctx.body); });
        const send = msg => w.fetch("https://grok.com/rest/app-chat/conversations/new", { method: "POST", body: JSON.stringify({ message: msg, modelName: "m" }) }).then(() => "sent", e => "blocked:" + e.name);
        const r0 = await send("  plain  ");
        P.registerPlugin(P.definePlugin({ name: "SendProbe", description: "x", authors: ["t"], interceptors: { beforeSend: v => (v.text.includes("stop") ? { cancel: true } : { ...v, text: v.text.trim().toUpperCase() }) } }));
        P.startPlugin("SendProbe");
        const r1 = await send("  hello  ");
        const r2 = await send("please stop");
        P.stopPlugin("SendProbe");
        offSeen();
        out.beforeSend = { r0, r1, r2, bodies: sent.map(b => JSON.parse(b).message) };
        w.__fetched = w.__fetched.filter(u => !u.includes("/rest/"));
    }
    // 每条回复下方的渲染型注入点
    {
        const resp = w.document.createElement("div");
        resp.id = "response-r9";
        w.document.body.append(resp);
        P.addSlotItem("messageAccessory", "acc1", { render: ({ responseId }) => R.createElement("i", { className: "acc-probe" }, `acc ${responseId}`) });
        await sleep(200);
        out.accessory = resp.querySelector(".acc-probe")?.textContent ?? null;
        P.removeSlotItem("messageAccessory", "acc1");
        await sleep(100);
        out.accessoryAfter = resp.querySelector(`[${da}-message-accessory]`) ? "left" : "removed";
        resp.remove();
    }
    P.addChatBarButton("b1", { icon: "★", tooltip: "Probe", onClick() { } });
    try { out.query = renderToStaticMarkup(R.createElement(req(15).QueryBar)).slice(0, 400); } catch (e) { errors.push("query: " + e.stack); }
    try { out.imagine = renderToStaticMarkup(R.createElement(req(16).ImagineToolbar)).slice(0, 400); } catch (e) { errors.push("imagine: " + e.stack); }
    // 旧插件字段 chatBarButton / contextMenuItems(验收探针的写法)映射到 Grok 的注入点
    P.registerPlugin(P.definePlugin({
        name: "AliasProbe", description: "x", authors: ["t"],
        chatBarButton: { tooltip: "AliasBtn", icon: "A", onClick() { } },
        contextMenuItems: { conversation: { label: "AliasConv", onSelect() { } }, user: [{ label: "AliasUser1", onSelect() { } }, { label: "AliasUser2", onSelect() { } }] },
    }));
    P.startPlugin(P.plugins.AliasProbe);
    const markup = () => [renderToStaticMarkup(R.createElement(req(15).QueryBar)), renderToStaticMarkup(R.createElement(req(13).ConversationItem, { id: "c1" })), renderToStaticMarkup(R.createElement(req(12).AvatarDropdownMenu))].join("|");
    try {
        const on = markup();
        out.aliasSite = P.plugins.AliasProbe.site;
        // 聊天栏在补丁被绕过时靠 Grok 导出的 ModeSelect 兜底,仿模块没有导出它,所以只在独占时检查渲染
        out.aliasOn = [P.getSlotItems("chatBar").some(x => x.id === "AliasProbe" && x.tooltip === "AliasBtn"), ...[`${px}AliasProbe`, "AliasUser1", "AliasUser2"].map(x => on.includes(x))];
        out.aliasBtnRendered = on.includes("AliasBtn");
        P.stopPlugin("AliasProbe");
        const off = markup();
        out.aliasOff = [P.getSlotItems("chatBar").some(x => x.id === "AliasProbe") || off.includes("AliasBtn"), ...[`${px}AliasProbe`, "AliasUser1"].map(x => off.includes(x))];
    } catch (e) { errors.push("alias: " + e.stack); }
    out.site = P.site.id;
    out.buildSites = P.buildSites;
    // 渲染设置页到真实 DOM
    const host = w.document.createElement("div"); w.document.body.appendChild(host);
    const rr = w.__RDC.createRoot(host);
    for (const t of reg.TAB_REGISTRY.filter(t => t.id.startsWith(us))) {
        try { w.__RD.flushSync(() => rr.render(R.createElement(t.component))); out["page:" + t.id] = host.textContent.slice(0, 250); } catch (e) { errors.push("page " + t.id + ": " + e.stack); }
    }
    // 设置对话框里打开插件配置
    try {
        const pluginsTab = reg.TAB_REGISTRY.find(t => t.id === `${us}plugins_tab`);
        if (!pluginsTab) throw "skip";
        w.__RD.flushSync(() => rr.render(R.createElement(pluginsTab.component)));
        const allTab = [...host.querySelectorAll("button[role=tab]")].find(b => b.textContent === "All");
        w.__RD.flushSync(() => allTab.click());
        out.allPage = host.textContent.slice(0, 300);
        const cfg = host.querySelector('[aria-label="config"]');
        w.__RD.flushSync(() => cfg.click());
        await sleep(50);
        out.modal = uiOf(w.document, `${px}root`)?.textContent.slice(0, 300);
    } catch (e) { if (e !== "skip" || !(order === "takeover" || P.patchReport().stats.yielded)) errors.push("plugin modal: " + (e.stack || e)); }
    // Quick CSS 与本地主题
    P.setQuickCss({ css: "body{outline:3px solid red}", enabled: true });
    await sleep(10);
    out.quickCss = w.document.querySelector(`${px}styles style[${da}="quick-css"]`)?.textContent;
    const th = P.addLocalTheme("Mine", "a{color:blue}"); P.enableTheme(th.url);
    out.themeStyle = !!w.document.querySelector(`${px}styles style[${da}="theme:${th.url}"]`);
    try { await P.addTheme("http://x/a.css"); } catch (e) { out.badUrl = e.message; }
    try { await P.addTheme("https://x/a.txt"); } catch (e) { out.badExt = e.message; }
    out.online = await P.addTheme("https://x.example/my-theme.css?v=1").then(t => t.name + "/" + t.enabled, e => "ERR " + e.message);
    await sleep(300);
    out.saved = [...store.keys()];
    // 控制台注册并启动的插件,开关状态要跟着变
    P.registerPlugin(P.definePlugin({ name: "ConsoleProbe", description: "x", authors: ["t"], start() { } }));
    P.startPlugin(P.plugins.ConsoleProbe);
    const afterStart = P.isPluginEnabled("ConsoleProbe");
    P.stopPlugin("ConsoleProbe");
    out.consoleToggle = [afterStart, P.isPluginEnabled("ConsoleProbe"), P.plugins.ConsoleProbe.started];
    // 新版消息树:助手节点从 streaming 变为 complete 时触发一次 streamEnd
    const ends = []; P.subscribe("streamEnd", d => ends.push(d.responseId));
    const ms = req(32).useMessageStore;
    const setNode = (id, n) => ms.setState(s => ({ conversations: { ...s.conversations, c1: { nodes: { ...s.conversations.c1.nodes, [id]: n } } } }));
    setNode("u1", { role: "user", status: "complete" });
    setNode("r1", { role: "assistant", status: "streaming", inflightResponseId: "r1" });
    setNode("r1", { role: "assistant", status: "streaming", inflightResponseId: "r1", outputChunks: ["a"] });
    setNode("r1", { role: "assistant", status: "complete", inflightResponseId: "r1" });
    setNode("r1", { role: "assistant", status: "complete", inflightResponseId: "r1", x: 1 });
    out.streamEnds = ends;
    // 读取合并
    out.loaded = { starred: P.PlainSettings.plugins.Settings.starredPlugins, thick: P.getThemes().some(t => t.name === "Thick") };
    out.menus = menus.map(m => m.name);
    // 多标签页:别的标签页保存的设置合并进来;本页未落盘的改动不被覆盖
    P.Settings.plugins.Settings.sites.grok.zapMe = "x";
    await sleep(300);
    const remote = JSON.parse(JSON.stringify(P.PlainSettings));
    remote.plugins.Settings.pinnedPlugins = ["RemotePin"];
    remote.plugins.Settings.sites.grok.customCSS = "remote{}";
    // 别的标签页删了一个键(要跟着删);整份插件条目缺了(不删,可能是没装这个插件的旧版本)
    delete remote.plugins.Settings.sites.grok.zapMe;
    delete remote.plugins.GrokMessages;
    P.setQuickCss({ css: "local{}" });
    P.Settings.plugins.Settings.sites.grok.keepMe = 1; // 本页刚加、还没落盘:不被删
    const deletions = [];
    P.SettingsStore.addPrefixChangeListener("plugins.Settings.sites.grok.zapMe", v => deletions.push(v === undefined ? "deleted" : v));
    const seen = [];
    P.SettingsStore.addPrefixChangeListener("plugins.Settings.pinnedPlugins", v => seen.push(v));
    valueListeners.filter(l => l.k === "UserscriptPPSettings").forEach(l => l.fn("UserscriptPPSettings", null, remote, true));
    out.crossTab = { pinned: P.PlainSettings.plugins.Settings.pinnedPlugins, css: P.getQuickCss().css, notified: seen.length };
    const g = P.PlainSettings.plugins.Settings.sites.grok;
    out.crossTabDelete = { deleted: !("zapMe" in g), notified: deletions, keptDirty: g.keepMe, pluginKept: "GrokMessages" in P.PlainSettings.plugins };
    // 备份:敏感设置默认不导出,导入时文件里为空则保留本机的
    P.registerPlugin(P.definePlugin({ name: "SecretProbe", description: "x", authors: ["t"], settings: P.definePluginSettings({ token: { type: P.OptionType.STRING, default: "", sensitive: true }, color: { type: P.OptionType.STRING, default: "" } }) }));
    P.Settings.plugins.SecretProbe.token = "s3cret"; P.Settings.plugins.SecretProbe.color = "red";
    const exp = P.exportSettings();
    const backup = P.parseBackup(JSON.stringify(exp));
    backup.settings.plugins.SecretProbe.color = "blue";
    backup.settings.plugins.Settings.sites.grok.customCSS = "imported{}";
    backup.settings.plugins.Settings.sites.grok.customCSSEnabled = true;
    await P.importSettings(backup.settings);
    out.importedCss = w.document.querySelector(`${px}styles style[${da}="quick-css"]`)?.textContent;
    out.backup = { exportedToken: "token" in (exp.settings.plugins.SecretProbe || {}), token: P.PlainSettings.plugins.SecretProbe.token, color: P.PlainSettings.plugins.SecretProbe.color, format: exp.format };
    // 查询客户端不在模块导出里,只在 React 树里的 provider 上(和当前 Grok 一样)
    // 和当前 Grok 一样:根挂在 document 本身上(不在 body 下),body 下带 React 容器的只有别的根(框架自己的界面根等)
    const qHost = w.document.createElement("div"); w.document.documentElement.appendChild(qHost);
    const Prov = ({ client, children }) => children;
    w.__RD.flushSync(() => w.__RDC.createRoot(qHost).render(w.__React.createElement(Prov, { client: req(33).makeQueryClient() }, w.__React.createElement("span", null, "q"))));
    for (const k of Object.keys(qHost)) if (k.startsWith("__reactContainer$")) { w.document[k] = qHost[k]; delete qHost[k]; }
    out.bodyHasOwnRoot = !!w.document.querySelector(`body > ${px}root`);
    out.uiInShadow = !!w.document.querySelector(`${px}root`)?.shadowRoot?.querySelector(`[class$="shadow-mount"]`);
    const subs = P.common.getSubscriptions();
    out.subs = { tier: subs.highestTier, name: subs.highestTierName, subscribed: subs.isSubscribed, x: subs.hasXSubscription, active: subs.active.length };
    if (order === "takeover" || P.patchReport().stats.yielded) {
        // 站点自己的设置入口不可用:脚本管理器菜单打开框架面板
        P.closeAllModals();
        menus[0]?.fn();
        await sleep(1200);
        out.stillForeign = (() => { const d = Object.getOwnPropertyDescriptor(w, "TURBOPACK"); return !!d.get && String(d.get).includes("return cur") && w.TURBOPACK.push.name === "handleChunkPush"; })();
        out.menuPanel = !!uiOf(w.document, `${px}root`)?.textContent.includes("Plugins");
    }
    if (order === "first" && !process.env.LATE) {
        // 补丁检查器(开发构建):注册表里的模块 + 爬到的懒分块;查找器登记
        P.findByPropsLazy("NoSuchExport");
        P.findByProps("AvatarDropdownMenu");
        const chk = await P.checkPatches({ log: false });
        out.check = { summary: chk.summary, statuses: chk.results.map(r => `${r.plugin}#${r.index}:${r.status}`), crawl: chk.crawl && { chunks: chk.crawl.chunks, failed: chk.crawl.failed.length }, has41: chk.summary.modules, fetched: w.__fetched, finders: chk.finders.map(f => f.finder), timings: (P.patchReport().timings || []).length };
        // CSS 类名、批量查找
        out.css = P.findCssClasses("button", "icon");
        out.bulk = P.findBulk(P.filters.byProps("AvatarDropdownMenu"), P.filters.byProps("NAV_GROUPS"), P.filters.byProps("Nope")).map(x => (x ? Object.keys(x)[0] : null));
        // 导出注入:已执行的模块立即补上;懒分块里的模块执行时补上
        const undo = P.injectExports('"SignoutIcon"', { InjectedIcon: ex => typeof ex.SignoutIcon });
        const undo2 = P.injectExports('"LazyThing"', { LazyUpper: ex => ex.LazyThing.toUpperCase() });
        out.inject = { now: req(21).InjectedIcon, keep: typeof req(21).SignoutIcon };
        // 懒加载分块
        out.lazyBefore = P.findByProps("LazyThing") ? "found" : null;
        const lzThing = P.webpack.lazy.byProps("LazyThing");
        const lzInj = P.findByPropsLazy("InjectedLater");
        out.lazyInc = { before: lzThing.LazyThing ?? null, injBefore: lzInj.InjectedLater ?? null };
        out.lazyLoaded = await P.extractAndLoadChunks(['"lazy-entry"']);
        const lazyMod = P.findByProps("LazyThing");
        out.lazyAfter = lazyMod?.LazyThing ?? null;
        out.lazyInjected = lazyMod?.LazyUpper ?? null;
        out.lazyLoads = w.__lazyLoads;
        out.imported = (await P.importModule(41))?.LazyThing ?? null;
        out.lazyInc.after = lzThing.LazyThing ?? null;
        const undo3 = P.injectExports('"SignoutIcon"', { InjectedLater: () => 7 });
        out.lazyInc.injAfter = lzInj.InjectedLater ?? null;
        undo3();
        out.ns = { same: P.webpack.findByProps === P.findByProps, dom: P.dom.observe === P.observe, net: P.net.onRequest === P.onRequest,
            lazyKeys: Object.keys(P.webpack.lazy).length, lazySame: P.webpack.lazy.byProps === P.findByPropsLazy, frozen: Object.isFrozen(P.ui), settings: P.settings.Settings === P.Settings };
        undo(); undo2();
        // 组件库:布局 / 排版 / 提示 / 颜色 / 批量选择,CSS 语法高亮编辑器
        const K = P.components, hh = P.react.h;
        const sel = P.createSelectionStore();
        const kitHost = w.document.createElement("div"); w.document.body.appendChild(kitHost);
        const kitRoot = w.__RDC.createRoot(kitHost);
        const Kit = () => hh(K.Flex, { direction: "column", gap: 4 },
            hh(K.SectionHeader, { title: "Sec", description: "desc" }),
            hh(K.Grid, { columns: 2 }, hh(K.Text, { weight: "bold" }, "T1"), hh(K.Paragraph, null, "P1")),
            hh(K.InfoHint, { type: "warn", title: "Heads up" }, "hint"),
            hh(K.ErrorCard, { error: new Error("boom") }),
            hh(K.ColorSettingRow, { title: "Accent", value: "#ff0000", onChange() { } }),
            hh(K.SelectionCheckbox, { selection: sel, id: "a" }),
            hh(K.SelectionActionBar, { selection: sel, noun: "chat", allIds: ["a", "b"], onDelete() { } }),
            hh(K.CodeEditor, { value: "body { color: #fff; } /* c */", language: "css", onChange() { } }),
            hh(K.Textarea, { value: "x\ny", onChange() { } }));
        w.__RD.flushSync(() => kitRoot.render(hh(Kit)));
        const before = kitHost.textContent;
        w.__RD.flushSync(() => sel.add("a"));
        await sleep(20);
        out.kit = {
            text: before.includes("Sec") && before.includes("T1") && before.includes("Heads up") && before.includes("boom"),
            barBefore: before.includes("selected"), barAfter: kitHost.textContent.includes("1 chat selected"),
            checked: kitHost.querySelector("input[type=checkbox]").checked,
            hl: [...kitHost.querySelectorAll("pre span")].map(x => x.className.replace(/^uspp-grok-hl-/, "")).filter((v, i, a) => a.indexOf(v) === i).sort(),
            color: kitHost.querySelector("input[type=color]")?.value,
            textarea: kitHost.querySelectorAll("textarea").length,
        };
        kitRoot.unmount();
        // 多行字符串设置:插件设置对话框里是多行输入框
        P.registerPlugin({ name: "MultiProbe", description: "multi", authors: [], settings: P.definePluginSettings({ notes: { type: P.OptionType.STRING, multiline: true, description: "Notes", default: "line1" } }) });
        P.openPluginSettings("MultiProbe");
        await sleep(300);
        out.multiline = [...(uiOf(w.document, `${px}root`)?.querySelectorAll(`textarea`) ?? [])].some(t => t.value === "line1");
        P.closeAllModals();
        out.injectUndone = "InjectedIcon" in req(21);
        out.apiKeys = Object.keys(P);
    }
    out.writable = (() => { try { w[KEY] = 1; } catch { } return w[KEY]?.api === P; })();
    // 页面桥:只有补丁里引用过的 $self.<名字>,拿不到插件定义上的别的东西,也没有框架接口
    const B = w[KEY], menusSelf = B.plugins.GrokMenus;
    out.bridge = {
        keys: Object.keys(B).sort(),
        noApi: ["fetchExternal", "Settings", "PlainSettings", "importSettings", "DataStore"].filter(k => k in B),
        selfMethod: typeof menusSelf.renderUserItems,
        selfStable: menusSelf.renderUserItems === menusSelf.renderUserItems,
        selfHidden: [menusSelf.settings, menusSelf.start, menusSelf.patches].map(v => typeof v),
        hostSelf: typeof B.site.settingsHost.navGroups,
        frozen: (() => { try { B.plugins.GrokMenus.x = 1; B.extra = 1; } catch { } return B.plugins.GrokMenus.x === undefined && B.extra === undefined; })(),
    };
    out.globals = { legacy: "UserscriptPP" in w, debug: w[`uspp_${ID.replace(/[^a-z0-9]/g, "_")}`] === P };
    console.log(JSON.stringify(out, null, 1));
    console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
    console.log("LOGS:\n" + logs.filter(l => !l.startsWith("[debug]")).join("\n"));
    process.exit(0);
})();
