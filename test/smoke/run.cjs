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
const M = {
    1: `(e,t,n)=>{t.exports=window.__React}`,
    2: `(e,t,n)=>{t.exports=window.__Jsx}`,
    3: `(e,t,n)=>{t.exports=window.__RDC}`,
    4: `(e,t,n)=>{t.exports=window.__RD}`,
    10: `e=>{"use strict";var t=e.r(2);let t3=[{id:"account",group:"general",icon:null,visible:()=>!0,component:()=>null}];e.s(["NAV_GROUPS",0,["general","grok","payments","data","other","team-management"],"TAB_REGISTRY",0,t3],10)}`,
    11: `e=>{"use strict";var y={logError(){}};let eE=(k,d)=>d;let el=e=>{switch(e.id){case"account":return eE("settings-tab.account","Account");default:return(0,y.logError)("SettingsDialog:tabLabel",\`No label for settings tab \${e.id}\`),e.id}};let ec=e=>{switch(e){case"general":return eE("settings-nav-group.general","General");case"other":return eE("settings-nav-group.other","Other")}};e.s(["tabLabel",0,el,"groupLabel",0,ec],11)}`,
    12: `e=>{"use strict";var t=e.r(2),h=e.r(20),d=e.r(21),ei=e.r(21);let _=(k,d)=>d;function Avatar(){let eB=null,eY=()=>{};return(0,t.jsxs)("div",{children:[(0,t.jsxs)(h.DropdownMenuSub,{children:[(0,t.jsxs)(h.DropdownMenuSubTrigger,{ref:eB,children:[(0,t.jsx)("span",{className:"me-2 flex",children:(0,t.jsx)(d.SupportIcon,{size:4,color:"var(--fg-secondary)"})}),_("user-dropdown.help","Help")]})]}),(0,t.jsxs)(h.DropdownMenuItem,{onClick:eY,children:[(0,t.jsx)("span",{className:"inline-flex me-2 text-fg-secondary",children:(0,t.jsx)(ei.SignoutIcon,{size:4})}),_("user-dropdown.sign-out","Sign Out")]})]})}e.s(["AvatarDropdownMenu",0,Avatar],12)}`,
    13: `e=>{"use strict";var t=e.r(2),S=e.r(20);function C(o){let E={id:o.id,route:{conversationId:o.id},menuExtras:[{id:"del"}]},U=null,L=null;return(0,t.jsx)(S.AppSidebarRow,{...E,extraRight:U,status:L,inset:"text"})}e.s(["ConversationItem",0,C],13)}`,
    14: `e=>{"use strict";var t=e.r(2),j=e.r(20),er={useReportStore:{getState:()=>({openReportDialog(){}})}};let eZ=(k,d)=>d;function R(o){let tw=o.r;return(0,t.jsx)(j.DropdownMenuContent,{align:"end",children:(0,t.jsx)(j.DropdownMenuItem,{onClick:()=>{er.useReportStore.getState().openReportDialog({responseId:tw.responseId,x:1})},children:eZ("response-action.report","Report")})})}function R2(o){let s=o.r,eQ=[{type:"report",label:"Report"}];return(0,t.jsxs)(j.DropdownMenuContent,{side:"bottom",align:"end",sideOffset:6,onPointerDown:()=>{},children:[eQ.map((n,o)=>(0,t.jsx)(j.DropdownMenuItem,{onClick:()=>{er.useReportStore.getState().openReportDialog({responseId:s.responseId})},children:n.label},o)),null]})}let lbl="response-action.more-actions",tag="more-actions-dropdown";e.s(["MoreActions",0,R,"MoreActions2",0,R2],14)}`,
    15: `e=>{"use strict";var t=e.r(2),eC={ModeSelect:()=>null};function Q(){return(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{"data-query-bar-mode-select":!0,children:(0,t.jsx)(eC.ModeSelect,{compact:!0,enableModeSwitchHotkey:!0})},"mode-select"),null]})}e.s(["QueryBar",0,Q],15)}`,
    16: `e=>{"use strict";var t=e.r(2);let en=o=>o.children;function I(o){let op=!1,i9=1,ty=2,t_=3,tN=4,ne=5,tM=6,tO=7,tw=8,nt=9;let tT=(0,t.jsxs)(en,{collapsed:op,children:[i9,ty,t_,tN,ne,tM,tO,tw,nt]});return tT}e.s(["ImagineToolbar",0,I],16)}`,
    20: `e=>{"use strict";var t=e.r(2);let mk=n=>{let c=o=>(0,t.jsx)("div",{"data-c":n,children:o.children});return c};e.s(["DropdownMenuSub",0,mk("sub"),"DropdownMenuSubTrigger",0,mk("subtrigger"),"DropdownMenuSubContent",0,mk("subcontent"),"DropdownMenuItem",0,o=>(0,t.jsx)("div",{role:"menuitem",onClick:o.onClick,children:o.children}),"DropdownMenuContent",0,mk("content"),"DROPDOWN_MENU_ICON_CLASSES",0,"x","AppSidebarRow",0,o=>(0,t.jsx)("div",{"data-extras":(o.menuExtras||[]).map(x=>x.id).join(","),children:"row"})],20)}`,
    21: `e=>{"use strict";e.s(["SupportIcon",0,()=>null,"SignoutIcon",0,()=>null],21)}`,
    30: `e=>{"use strict";let st={open:!1,tab:"account"};let l=new Set;let u=()=>st;u.getState=()=>({...st,setOpen:v=>{st={...st,open:v}},setTab:v=>{st={...st,tab:v}},openTab:v=>{st={...st,open:!0,tab:v}}});u.setState=()=>{};u.subscribe=f=>(l.add(f),()=>l.delete(f));e.s(["useSettingsDialogStore",0,u],30)}`,
    33: `e=>{"use strict";let q=[{queryKey:["subscriptions"],state:{dataUpdatedAt:1,data:{bestSubscription:"SUBSCRIPTION_TIER_SUPER_GROK_PRO",isEnterpriseUser:!1,hasXSubscription:!1,activeSubscriptions:[{tier:"SUBSCRIPTION_TIER_SUPER_GROK_PRO",status:"SUBSCRIPTION_STATUS_ACTIVE"},{tier:"SUBSCRIPTION_TIER_X_PREMIUM",status:"SUBSCRIPTION_STATUS_CANCELED",billingProvider:"x"}]}}}];let mk=()=>({getQueryCache:()=>({getAll:()=>q}),getQueryData:()=>null,setQueryData(){}});e.s(["makeQueryClient",0,mk],33)}`,
    32: `e=>{"use strict";let st={conversations:{c1:{nodes:{old:{role:"assistant",status:"complete"}}}}};let l=new Set;let u=()=>st;u.getState=()=>st;u.setState=f=>{st={...st,...(typeof f==="function"?f(st):f)};l.forEach(x=>x(st))};u.subscribe=f=>(l.add(f),()=>l.delete(f));e.s(["useMessageStore",0,u],32)}`,
    31: `e=>{"use strict";let u=()=>({});u.getState=()=>({});u.setState=()=>{};u.subscribe=()=>()=>{};e.s(["useRoutingStore",0,u],31)}`,
};
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
    const loadOrder = process.env.LATE ? [1, 2, 3, 4, 21, 10, 11, 12, 15, 16, 30] : [1, 2, 3, 4, 20, 21, 10, 11, 12, 13, 14, 15, 16, 30];
    for (const id of loadOrder) { try { req(id); } catch (e) { errors.push("require " + id + ": " + e.stack); } }
    await sleep(50);
    if (process.env.LATE) { req(20); req(13); req(14); await sleep(2500); }
    req(31); req(32); req(33);
    await sleep(400);
    // 接管要看完宽限期(之后的分块是否仍经过本脚本)才认定;共存的几种顺序也等完,确认没有被误判成接管
    await sleep(1500);
    const P = w[KEY];
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
        out.modal = w.document.querySelector(`${px}root`)?.textContent.slice(0, 300);
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
    await sleep(300);
    const remote = JSON.parse(JSON.stringify(P.PlainSettings));
    remote.plugins.Settings.pinnedPlugins = ["RemotePin"];
    remote.plugins.Settings.sites.grok.customCSS = "remote{}";
    P.setQuickCss({ css: "local{}" });
    const seen = [];
    P.SettingsStore.addPrefixChangeListener("plugins.Settings.pinnedPlugins", v => seen.push(v));
    valueListeners.filter(l => l.k === "UserscriptPPSettings").forEach(l => l.fn("UserscriptPPSettings", null, remote, true));
    out.crossTab = { pinned: P.PlainSettings.plugins.Settings.pinnedPlugins, css: P.getQuickCss().css, notified: seen.length };
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
    const subs = P.common.getSubscriptions();
    out.subs = { tier: subs.highestTier, name: subs.highestTierName, subscribed: subs.isSubscribed, x: subs.hasXSubscription, active: subs.active.length };
    if (order === "takeover" || P.patchReport().stats.yielded) {
        // 站点自己的设置入口不可用:脚本管理器菜单打开框架面板
        P.closeAllModals();
        menus[0]?.fn();
        await sleep(1200);
        out.stillForeign = (() => { const d = Object.getOwnPropertyDescriptor(w, "TURBOPACK"); return !!d.get && String(d.get).includes("return cur") && w.TURBOPACK.push.name === "handleChunkPush"; })();
        out.menuPanel = !!w.document.querySelector(`${px}root`)?.textContent.includes("Plugins");
    }
    out.writable = (() => { try { w[KEY] = 1; } catch { } return w[KEY] === P; })();
    out.globals = { legacy: "UserscriptPP" in w, debug: w[`uspp_${ID.replace(/[^a-z0-9]/g, "_")}`] === P };
    console.log(JSON.stringify(out, null, 1));
    console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
    console.log("LOGS:\n" + logs.filter(l => !l.startsWith("[debug]")).join("\n"));
    process.exit(0);
})();
