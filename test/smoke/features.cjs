const uiOf = (d, tag) => { const h = d.querySelector(tag); const sr = h?.shadowRoot; return sr ? (sr.querySelector(`[class$="shadow-mount"]`) ?? sr) : h; };
// 插件 API 层和体验功能的冒烟:作用域自动清理、方法补丁器、网络改写、设置校验、插件数据、渲染型注入点、菜单补丁、
// 拦截器、命令和快捷键、功能搜索栏、设置页登记、通知、失败汇总、诊断信息;MODE=safe / crash 时测安全模式
// 用法:node features.cjs <脚本>;USPP_ID=<脚本 ID>
const { JSDOM } = require("jsdom");
const fs = require("fs");
const http = require("http");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const ID = process.env.USPP_ID || "example";
const MODE = process.env.MODE || "normal";
const KEY = Symbol.for(`uspp:${ID}`);
const px = `uspp-${ID}-`;

(async () => {
    // XHR 用的本地服务
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", c => { body += c; });
        req.on("end", () => { res.setHeader("access-control-allow-origin", "*"); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ path: req.url, body })); });
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;

    const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="app"><button id="b">x</button><input id="field"></div></body></html>`, { url: process.env.URL || "https://example.com/page", runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window;
    const errors = [];
    w.addEventListener("error", e => errors.push("uncaught: " + (e.error?.stack || e.message)));
    const logs = [];
    for (const k of ["log", "info", "warn", "error", "debug"]) w.console[k] = (...a) => logs.push(`[${k}] ` + a.map(x => x instanceof Error ? x.stack : String(x)).join(" "));
    const store = new Map();
    const menus = [];
    w.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
    w.GM_setValue = (k, v) => store.set(k, v);
    w.GM_deleteValue = k => store.delete(k);
    w.GM_addValueChangeListener = () => 1;
    w.GM_registerMenuCommand = (name, fn) => { menus.push({ name, fn }); return menus.length; };
    w.GM_unregisterMenuCommand = () => { };
    const sysNotes = [];
    w.GM_notification = o => sysNotes.push(o.title);
    if (MODE === "safe") store.set("UserscriptPPBoot", { force: true });
    if (MODE === "crash") store.set("UserscriptPPBoot", { pending: 2, at: Date.now() - 1000, lastPlugin: "Breaker" });
    // 上一次启动也没等满 10 秒就关了:这一次在站点就绪后、10 秒内关页面,不应再计入
    if (MODE === "pagehide") store.set("UserscriptPPBoot", { pending: 1, at: Date.now() - 1000 });
    // 页面的 fetch:回显地址和请求体
    w.Response = globalThis.Response; w.Headers = globalThis.Headers; w.Request = globalThis.Request;
    const pageFetch = async (u, init) => new globalThis.Response(JSON.stringify({ url: String(u?.url ?? u), body: init?.body ?? null }), { headers: { "content-type": "application/json" } });
    w.fetch = pageFetch;
    // 仿 WebSocket:send 记下来,emit 模拟收到消息
    class FakeWS extends w.EventTarget {
        constructor(url) { super(); this.url = url; this.sent = []; FakeWS.last = this; }
        send(d) { this.sent.push(d); }
        emit(data) { const e = new w.MessageEvent("message", { data }); this.dispatchEvent(e); this.onmessage?.(e); }
    }
    w.WebSocket = FakeWS;
    w.eval(bundle);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(300);
    const U = w[KEY].api;
    const out = { mode: MODE, safe: U.isSafeMode() };
    const doc = w.document;
    const rootText = () => uiOf(doc, `${px}root`)?.textContent ?? "";

    if (MODE === "pagehide") {
        // 就绪之前关页面仍然计入
        w.dispatchEvent(new w.Event("pagehide"));
        out.pendingEarly = store.get("UserscriptPPBoot")?.pending;
        await Promise.race([U.onceReady, sleep(6000)]);
        out.pendingBefore = store.get("UserscriptPPBoot")?.pending;
        w.dispatchEvent(new w.Event("pagehide"));
        out.boot = store.get("UserscriptPPBoot");
        finish();
        return;
    }
    if (MODE !== "normal") {
        U.registerPlugin(U.definePlugin({ name: "Optional", description: "x", authors: ["t"], enabledByDefault: true, start() { out.optionalStarted = true; } }));
        await sleep(100);
        out.started = Object.values(U.plugins).map(p => `${p.name}:${p.started}`);
        out.notice = uiOf(doc, `${px}root`)?.querySelector(`.${px}notice`)?.textContent ?? null;
        out.quickCssApplied = !!doc.querySelector(`style[data-uspp-${ID}="quick-css"]`);
        out.boot = store.get("UserscriptPPBoot");
        finish();
        return;
    }

    // ---------- 1.1 作用域自动清理 ----------
    {
        const hits = { observe: 0, interval: 0, listen: 0, event: 0, direct: 0, timeout: 0, registered: 0, aborted: false };
        U.registerPlugin(U.definePlugin({
            name: "ScopeProbe", description: "x", authors: ["t"],
            start(ctx) {
                ctx.observe(".probe", { added: () => hits.observe++ });
                ctx.setInterval(() => hits.interval++, 20);
                ctx.listen(doc, "probe-ev", () => hits.listen++);
                ctx.subscribe("siteReady", () => hits.event++);
                ctx.setTimeout(() => hits.timeout++, 400);
                ctx.register(() => hits.registered++);
                ctx.signal.addEventListener("abort", () => { hits.aborted = true; });
                // start 同步执行期间直接调用 U.* 也归到本插件
                U.observe(".probe-direct", { added: () => hits.direct++ });
                hits.ctxPlugin = ctx.plugin;
            },
        }));
        U.startPlugin("ScopeProbe");
        const add = cls => { const d = doc.createElement("div"); d.className = cls; doc.body.append(d); };
        add("probe"); add("probe-direct"); doc.dispatchEvent(new w.Event("probe-ev"));
        await sleep(120);
        const before = { ...hits };
        U.stopPlugin("ScopeProbe");
        const frozen = { ...hits };
        add("probe"); add("probe-direct"); doc.dispatchEvent(new w.Event("probe-ev")); U.dispatch("siteReady", {});
        await sleep(500);
        out.scope = { before, after: { ...hits }, frozen };
    }

    // ---------- 1.1b 作用域清理列表不只增不减(第 33 条) ----------
    {
        let ctxRef = null;
        U.registerPlugin(U.definePlugin({ name: "ScopeLeak", description: "x", authors: ["t"], start(ctx) { ctxRef = ctx; } }));
        U.startPlugin("ScopeLeak");
        const base = ctxRef.pending;
        for (let i = 0; i < 50; i++) { ctxRef.setTimeout(() => { }, 0); ctxRef.observe(".leak", { added() { } })(); ctxRef.listen(doc, "leak", () => { })(); }
        const afterManual = ctxRef.pending - base;
        await sleep(30);
        let late = 0;
        ctxRef.setTimeout(() => late++, 0);
        const off = ctxRef.setInterval(() => { }, 1000);
        const kept = ctxRef.pending - base;
        off();
        await sleep(30);
        out.scopeShrink = { afterManual, afterTimers: ctxRef.pending - base, kept, late };
        U.stopPlugin("ScopeLeak");
    }

    // ---------- 1.2 方法补丁器 ----------
    {
        const obj = { greet(n) { return `hi ${n}`; } };
        const orig = obj.greet;
        const offA = U.patchMethod(obj, "greet", { before(args) { args[0] = args[0].toUpperCase(); } });
        const offB = U.patchMethod(obj, "greet", { after(args, r) { return r + "!"; } });
        const offC = U.patchMethod(obj, "greet", { instead(args, next) { return `[${next()}]`; } });
        const r1 = obj.greet("bob");
        // 第三方脚本在我们之后又包了一层
        const ours = obj.greet;
        const theirs = function (...a) { return "3p:" + ours.apply(this, a); };
        obj.greet = theirs;
        const r2 = obj.greet("amy");
        offA(); offB(); offC();
        const r3 = obj.greet("joe");
        const keptTheirs = obj.greet === theirs;
        // 没有第三方包装时,撤销后恢复原方法
        const o2 = { f() { return 1; } };
        const f0 = o2.f;
        const off = U.patchMethod(o2, "f", { after: () => 2 });
        const p1 = o2.f(), nameKept = o2.f.name === "f", str = String(o2.f) === String(f0);
        off();
        // 补丁抛错不影响原方法
        const o3 = { g() { return "ok"; } };
        U.patchMethod(o3, "g", { before() { throw new Error("boom"); } });
        // 补丁跟着插件停用撤销
        const o4 = { h() { return "h"; } };
        U.registerPlugin(U.definePlugin({ name: "PatchProbe", description: "x", authors: ["t"], start(ctx) { ctx.patch(o4, "h", { after: () => "patched" }); } }));
        U.startPlugin("PatchProbe");
        const h1 = o4.h();
        U.stopPlugin("PatchProbe");
        out.patcher = { r1, r2, r3, keptTheirs, restored: o2.f === f0, p1, nameKept, str, safe: o3.g(), h1, h2: o4.h(), origUntouched: orig("x") === "hi x" };
        logs.splice(0); // 预期的 boom 日志
    }

    // ---------- 1.3 网络改写 ----------
    {
        const r0 = await (await w.fetch("https://api.test/plain")).json();
        const offs = [
            U.rewriteRequest("/rw-url", () => ({ url: "https://api.test/changed" })),
            U.rewriteRequest("/rw-body", async ctx => ({ body: { ...ctx.json(), added: 1 } })),
            U.rewriteRequest("/rw-block", () => ({ block: true })),
            U.rewriteRequest("/rw-respond", ctx => ctx.respond({ fake: true })),
            U.rewriteResponse("/rw-change", async ctx => { const j = await ctx.json(); return ctx.respond({ ...j, extra: "yes" }); }),
        ];
        const readSeen = [];
        offs.push(U.onResponse("/rw-", ctx => { readSeen.push(ctx.url); }));
        const j1 = await (await w.fetch("https://api.test/rw-url")).json();
        const j2 = await (await w.fetch("https://api.test/rw-body", { method: "POST", body: JSON.stringify({ a: 1 }) })).json();
        let blocked = false;
        try { await w.fetch("https://api.test/rw-block"); } catch (e) { blocked = e instanceof TypeError || e?.name === "TypeError"; }
        const j4 = await (await w.fetch("https://api.test/rw-respond")).json();
        const j5 = await (await w.fetch("https://api.test/rw-change")).json();
        // 没有匹配的改写时,页面拿到的就是原 fetch 的 Promise(不额外经过异步)
        const pRaw = w.fetch("https://api.test/nothing");
        const direct = typeof pRaw.then === "function";
        await pRaw;
        // XHR
        const xhr = (url, body, method = "POST") => new Promise(resolve => {
            const x = new w.XMLHttpRequest();
            x.open(method, url);
            x.onload = () => resolve({ status: x.status, text: x.responseText });
            x.onerror = () => resolve({ error: true });
            x.send(body);
        });
        offs.push(U.rewriteRequest("/xhr-url", ctx => (ctx.phase === "open" ? { url: ctx.url.replace("xhr-url", "xhr-moved") } : undefined)));
        offs.push(U.rewriteRequest("/xhr-body", ctx => (ctx.phase === "send" ? { body: ctx.body + "+more" } : undefined)));
        offs.push(U.rewriteRequest("/xhr-block", () => ({ block: true })));
        offs.push(U.rewriteResponse("/xhr-res", ctx => ({ ...ctx.json(), patched: true })));
        const base = `http://127.0.0.1:${port}`;
        const x1 = await xhr(`${base}/xhr-url`, "a");
        const x2 = await xhr(`${base}/xhr-body`, "b");
        const x3 = await xhr(`${base}/xhr-block`, "c");
        const x4 = await xhr(`${base}/xhr-res`, "d");
        // WebSocket
        const wsLog = [];
        offs.push(U.onWebSocket("wss://chat", {
            open: (s, url) => wsLog.push("open " + url),
            send: d => (d === "drop" ? false : d === "edit" ? "edited" : undefined),
            message: d => (d === "hide" ? false : d === "swap" ? "swapped" : undefined),
        }));
        const ws = new w.WebSocket("wss://chat/x");
        const got = [];
        ws.addEventListener("message", e => got.push(e.data));
        ws.send("keep"); ws.send("drop"); ws.send("edit");
        ws.emit("plain"); ws.emit("hide"); ws.emit("swap");
        offs.forEach(o => o());
        const after = await (await w.fetch("https://api.test/rw-url")).json();
        out.network = { r0, j1: j1.url, j2: j2.body, blocked, j4, j5, direct, after: after.url, readSeen: readSeen.length, x1: x1.text && JSON.parse(x1.text).path, x2: x2.text && JSON.parse(x2.text).body, x3, x4: x4.text && JSON.parse(x4.text), ws: { log: wsLog, sent: ws.sent, got, instance: ws instanceof w.WebSocket } };
    }

    // ---------- 1.4 设置校验 + "关于"区 ----------
    {
        let settings;
        U.registerPlugin(U.definePlugin({
            name: "CheckProbe", description: "x", authors: ["t"],
            settings: settings = U.definePluginSettings({
                on: { type: U.OptionType.BOOLEAN, default: false, description: "Master" },
                lang: { type: U.OptionType.STRING, default: "en", description: "Lang" },
                count: { type: U.OptionType.NUMBER, default: 5, description: "1-100" },
            }, {
                lang: { disabled: () => !settings.store.on },
                count: { isValid: v => (v >= 1 && v <= 100) || "Must be between 1 and 100." },
            }),
            about: () => U.react.h("p", { className: "about-probe" }, "About this plugin"),
        }));
        U.openPluginSettings("CheckProbe");
        await sleep(80);
        const q = s => uiOf(doc, `${px}root`)?.querySelector(`[data-uspp-${ID}-setting="${s}"]`);
        const langDisabled1 = q("lang")?.querySelector("fieldset")?.disabled;
        const input = q("count")?.querySelector("input");
        const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); };
        type(input, "500");
        await sleep(50);
        const err = q("count")?.textContent.includes("Must be between 1 and 100.");
        const stored1 = U.PlainSettings.plugins.CheckProbe.count;
        type(input, "42");
        await sleep(50);
        const stored2 = U.PlainSettings.plugins.CheckProbe.count;
        U.Settings.plugins.CheckProbe.on = true;
        await sleep(50);
        const langDisabled2 = q("lang")?.querySelector("fieldset")?.disabled;
        out.checks = { langDisabled1, langDisabled2, err, stored1, stored2, errGone: !q("count")?.textContent.includes("Must be"), about: !!uiOf(doc, `${px}root`)?.querySelector(`.about-probe`) };
        U.closeAllModals();
    }

    // ---------- 1.5 插件数据 ----------
    {
        let ctxData;
        U.registerPlugin(U.definePlugin({ name: "DataProbe", description: "x", authors: ["t"], start(ctx) { ctxData = ctx.data; } }));
        U.startPlugin("DataProbe");
        await ctxData.set("history", [1, 2, 3]);
        await ctxData.global.set("shared", { a: 1 });
        const v = await ctxData.get("history");
        const missing = await ctxData.get("nope", "fallback");
        const keys = await ctxData.keys();
        const gkeys = await ctxData.global.keys();
        const settingsHasIt = JSON.stringify(U.PlainSettings).includes("history");
        const exp = await U.exportData(["DataProbe"]);
        await ctxData.del("history");
        await U.importData(exp);
        const back = await U.DataStore.for("DataProbe").get("history");
        out.data = { v, missing, keys, gkeys, settingsHasIt, exp, back, gmKey: [...store.keys()].some(k => k.startsWith("data:DataProbe")) };
        logs.splice(0); // jsdom 没有 IndexedDB:退回内存的 warn
    }

    // ---------- 2.1 渲染型注入点 / 2.2 菜单补丁 / 2.3 拦截器 ----------
    {
        U.registerPlugin(U.definePlugin({
            name: "SlotProbe", description: "x", authors: ["t"],
            slots: {
                accessory: { render: ({ who }) => U.react.h("span", { className: "acc" }, `hello ${who}`) },
                broken: { render: () => { throw new Error("render boom"); } },
                menu: { patch(items) { return items.filter(i => i.id !== "delete").concat({ id: "mine", label: "Mine" }); } },
                bar: { label: "Btn", onClick: () => { out.barClicked = true; } },
            },
            interceptors: {
                beforeSend: v => ({ ...v, text: v.text.trim() }),
            },
        }));
        U.startPlugin("SlotProbe");
        const host = doc.createElement("div");
        doc.body.append(host);
        const hd = U.renderSlot("accessory", host, { who: "a" });
        await sleep(50);
        const t1 = host.textContent;
        hd.update({ who: "b" });
        await sleep(50);
        const t2 = host.textContent;
        const host2 = doc.createElement("div");
        doc.body.append(host2);
        U.renderSlot("broken", host2, {});
        const host3 = doc.createElement("div");
        doc.body.append(host3);
        U.renderSlot("bar", host3, {});
        await sleep(50);
        host3.querySelector("button")?.click();
        host.remove();
        await sleep(250);
        const menu = U.applyMenuPatches("menu", [{ id: "rename" }, { id: "delete" }], {});
        const menuItemsVisible = U.getSlotItems("menu").length;
        U.addInterceptor("beforeSend", v => (v.text.includes("secret") ? { cancel: true } : undefined), { id: "Guard" });
        U.addInterceptor("beforeSend", () => { throw new Error("bad"); }, { id: "Bad" });
        const i1 = await U.runInterceptors("beforeSend", { text: "  hi  " });
        const i2 = await U.runInterceptors("beforeSend", { text: "my secret" });
        const i3 = await (async () => { const off = U.addInterceptor("slow", () => new Promise(() => { })); const r = await U.runInterceptors("slow", 1, { timeout: 50 }); off(); return r; })();
        U.stopPlugin("SlotProbe");
        const i4 = await U.runInterceptors("beforeSend", { text: "  x  " });
        out.slots = { t1, t2, brokenEmpty: host2.textContent === "", barClicked: !!out.barClicked, menu: menu.map(i => i.id), menuItemsVisible, i1, i2: { cancelled: i2.cancelled, by: i2.by }, i3, i4 };
        logs.splice(0);
    }

    // ---------- 3.2 命令、快捷键、功能搜索栏 ----------
    {
        let runs = 0;
        U.registerPlugin(U.definePlugin({
            name: "CmdProbe", description: "x", authors: ["t"],
            commands: [{ id: "go", name: "Do the thing", keywords: ["probe"], defaultKey: "Alt+Shift+K", run: () => { runs++; } }],
        }));
        U.startPlugin("CmdProbe");
        const key = (k, opts = {}, target = doc.body) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, code: `Key${k.toUpperCase()}`, bubbles: true, cancelable: true, ...opts }));
        key("k", { altKey: true, shiftKey: true });
        await sleep(20);
        const r1 = runs;
        // 用户改键
        U.Settings.plugins.Settings.keybinds = { "CmdProbe.go": "Ctrl+J" };
        key("k", { altKey: true, shiftKey: true });
        key("j", { ctrlKey: true });
        await sleep(20);
        const r2 = runs;
        // 输入框里不带修饰键的快捷键不触发
        U.Settings.plugins.Settings.keybinds = { "CmdProbe.go": "Q" };
        key("q", {}, doc.getElementById("field"));
        key("q");
        await sleep(20);
        const r3 = runs;
        // 搜索栏:Alt+Shift+P 打开,输入后回车执行
        U.Settings.plugins.Settings.keybinds = {};
        key("p", { altKey: true, shiftKey: true });
        await sleep(80);
        const pal = uiOf(doc, `${px}root`)?.querySelector(`[data-uspp-${ID}-palette]`);
        const inp = pal?.querySelector("input");
        if (inp) { inp.value = "do thing"; inp.dispatchEvent(new w.Event("input", { bubbles: true })); }
        await sleep(50);
        const first = pal?.querySelector(`[data-uspp-${ID}-palette-item]`)?.getAttribute(`data-uspp-${ID}-palette-item`);
        inp?.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await sleep(50);
        const r4 = runs;
        // 搜索设置项
        U.openPalette();
        await sleep(50);
        const inp2 = uiOf(doc, `${px}root`)?.querySelector(`[data-uspp-${ID}-palette] input`);
        inp2.value = "debug logs"; inp2.dispatchEvent(new w.Event("input", { bubbles: true }));
        await sleep(50);
        const firstSetting = uiOf(doc, `${px}root`)?.querySelector(`[data-uspp-${ID}-palette-item]`)?.getAttribute(`data-uspp-${ID}-palette-item`);
        U.closeAllModals();
        // Keybinds 页列出命令
        U.openSettingsPanel({ tab: "keybinds" });
        await sleep(80);
        const kbPage = uiOf(doc, `${px}root`)?.querySelector(`[data-uspp-${ID}-page="keybinds"]`)?.textContent ?? "";
        U.closeAllModals();
        U.stopPlugin("CmdProbe");
        key("k", { altKey: true, shiftKey: true });
        await sleep(20);
        out.commands = { r1, r2, r3, first, r4, firstSetting, kb: kbPage.includes("Do the thing") && kbPage.includes("Alt+Shift+K"), afterStop: runs, ids: U.getCommands().map(c => c.id) };
    }

    // ---------- 3.3 设置页登记 / 3.4 通知 / 3.5 失败汇总 / 3.1 诊断 ----------
    {
        U.registerPlugin(U.definePlugin({
            name: "PageProbe", description: "x", authors: ["t"],
            settingsPages: [{ id: "rules", label: "Rules", component: () => U.react.h("div", { className: "rules-page" }, "My rules") }],
        }));
        U.startPlugin("PageProbe");
        U.openSettingsPanel({ tab: "rules" });
        await sleep(80);
        const nav1 = [...(uiOf(doc, `${px}root`)?.querySelectorAll(`[data-uspp-${ID}-panel-tab]`) ?? [])].map(b => b.textContent);
        const shown = !!uiOf(doc, `${px}root`)?.querySelector(`.rules-page`);
        U.stopPlugin("PageProbe");
        await sleep(50);
        const nav2 = [...(uiOf(doc, `${px}root`)?.querySelectorAll(`[data-uspp-${ID}-panel-tab]`) ?? [])].map(b => b.textContent);
        U.closeAllModals();
        let clicked = 0;
        U.notify({ title: "Saved", body: "All good", onClick: () => clicked++, system: true });
        await sleep(30);
        const card = uiOf(doc, `${px}root`)?.querySelector(`.${px}notify`);
        const cardText = card?.textContent;
        card?.click();
        await sleep(30);
        U.registerPlugin(U.definePlugin({ name: "Breaker", description: "x", authors: ["t"], enabledByDefault: true, start() { throw new Error("kaboom"); } }));
        U.startPlugin("Breaker");
        U.openFailedPlugins();
        await sleep(50);
        const failedText = uiOf(doc, `${px}root`)?.querySelector(`[data-uspp-${ID}-failed="Breaker"]`)?.textContent ?? "";
        U.closeAllModals();
        const diag = U.collectDiagnostics();
        out.misc = {
            nav1, shown, nav2, cardText, clicked, history: U.getNotificationHistory().map(n => n.title), sysNotes,
            failed: failedText.includes("kaboom"), startError: U.plugins.Breaker.startError?.message,
            diag: { name: diag.includes("Userscript++ Example"), failed: diag.includes("Breaker: kaboom"), noValues: !diag.includes("keybinds") },
            boot: store.get("UserscriptPPBoot"),
        };
        logs.splice(0);
    }

    // ---------- 备份导入:逐项校验、预览、撤销 ----------
    {
        const ps = U.definePluginSettings({
            greeting: { type: U.OptionType.STRING, default: "hi" },
            mode: { type: U.OptionType.SELECT, options: [{ label: "A", value: "a", default: true }, { label: "B", value: "b" }] },
        });
        U.registerPlugin(U.definePlugin({ name: "ImportProbe", description: "x", authors: ["t"], enabledByDefault: true, settings: ps }));
        const H = () => U.PlainSettings.plugins.ImportProbe;
        U.Settings.plugins.ImportProbe.greeting = "mine";
        await sleep(150);
        const file = { plugins: { ImportProbe: { enabled: "yes", greeting: 42, mode: "b" }, Settings: { debugLogs: true, starredPlugins: ["Imported"] }, Gone: { x: 1 } } };
        const pv = U.previewImport(file);
        await U.importSettings(file);
        const afterImport = { greeting: H().greeting ?? null, mode: H().mode, enabledType: typeof H().enabled, debugLogs: U.PlainSettings.plugins.Settings.debugLogs, starred: U.PlainSettings.plugins.Settings.starredPlugins, gone: !!U.PlainSettings.plugins.Gone };
        const last = await U.lastImport();
        const undone = await U.undoImport();
        out.importCheck = {
            invalid: pv.invalid.map(x => `${x.plugin}.${x.key}`).sort(), afterImport, hasUndo: !!last,
            undone, restored: { greeting: H().greeting, debugLogs: U.PlainSettings.plugins.Settings.debugLogs ?? false },
            again: await U.undoImport(), undoStored: store.has("UserscriptPPImportUndo") && !!store.get("UserscriptPPImportUndo"),
        };
        logs.splice(0);
    }

    // ---------- 运行期错误归到插件、熔断 ----------
    {
        U.registerPlugin(U.definePlugin({
            name: "Flaky", description: "x", authors: ["t"],
            async start(ctx) {
                ctx.listen(doc, "flaky-ev", () => { throw new Error("listen boom"); });
                ctx.setTimeout(async () => { await 0; throw new Error("async timer boom"); }, 0);
                ctx.reportError(new Error("own boom"), "custom");
                await 0;
                throw new Error("late start boom");
            },
        }));
        U.startPlugin("Flaky");
        await sleep(30);
        const before = U.pluginErrorStats().find(e => e.name === "Flaky");
        for (let i = 0; i < 12; i++) doc.dispatchEvent(new w.Event("flaky-ev"));
        await sleep(30);
        const after = U.pluginErrorStats().find(e => e.name === "Flaky");
        U.openSettings();
        await sleep(80);
        [...(uiOf(doc, `${px}root`)?.querySelectorAll("button, [role=tab]") ?? [])].find(b => b.textContent === "All")?.click();
        await sleep(50);
        const badge = uiOf(doc, `${px}root`)?.querySelector(`[data-uspp-${ID}-plugin-errors="Flaky"]`)?.textContent ?? null;
        U.closeAllModals();
        out.runtimeErrors = {
            before: before && { count: before.count, tripped: before.tripped },
            after: after && { count: after.count, tripped: after.tripped, where: after.last?.where },
            started: U.plugins.Flaky.started, startError: U.plugins.Flaky.startError ?? null,
            notice: U.getNotificationHistory().some(n => n.title === "Flaky was turned off"),
            badge, diag: U.collectDiagnostics().includes("Runtime errors: Flaky ×"),
        };
        logs.splice(0);
    }

    // ---------- 开关与实际运行:意图 / 期望 / 实际 ----------
    {
        const runs = name => !!U.plugins[name]?.started;
        // 出错太多被停掉的插件:开关显示为关;点一下是重新启动,不把用户的开关改成关
        const tripped = { phase: U.pluginPhase("Flaky") ?? null };
        U.togglePlugin("Flaky");
        tripped.restarted = runs("Flaky");
        tripped.intent = U.PlainSettings.plugins.Flaky.enabled;
        U.stopPlugin("Flaky");
        // 依赖:A 依赖 B;打开 A 时 B 跟着运行但不写进 B 的设置,关掉 A 后 B 停下
        let bStops = 0;
        let bctx = null;
        U.registerPlugin(U.definePlugin({ name: "DepB", description: "x", authors: ["t"], start(ctx) { bctx = ctx; }, stop() { bStops++; } }));
        U.registerPlugin(U.definePlugin({ name: "DepA", description: "x", authors: ["t"], dependencies: ["DepB"], start() { } }));
        U.startPlugin("DepA");
        const dep = { a: runs("DepA"), b: runs("DepB"), bStored: U.PlainSettings.plugins.DepB.enabled ?? null, locked: U.togglePlugin("DepB") === false && runs("DepB") };
        U.stopPlugin("DepA");
        Object.assign(dep, { aAfter: runs("DepA"), bAfter: runs("DepB"), bStops });
        // 开关从别处改的(别的标签页同步、导入):本页跟着启停
        U.Settings.plugins.DepA.enabled = true;
        dep.syncedOn = runs("DepA") && runs("DepB");
        U.Settings.plugins.DepA.enabled = false;
        dep.syncedOff = !runs("DepA") && !runs("DepB");
        // 依赖被熔断:依赖它的也停下,并且不会被悄悄重启
        U.startPlugin("DepA");
        for (let i = 0; i < 10; i++) bctx.reportError(new Error("dep boom"), "test");
        dep.trippedDep = { a: runs("DepA"), b: runs("DepB"), phaseA: U.pluginPhase("DepA") ?? null };
        U.stopPlugin("DepA");
        // 启动到一半失败:调用 stop 收尾
        let halfStops = 0;
        U.registerPlugin(U.definePlugin({ name: "Half", description: "x", authors: ["t"], start() { throw new Error("half"); }, stop() { halfStops++; } }));
        U.startPlugin("Half");
        out.lifecycle = { tripped, dep, half: { stops: halfStops, phase: U.pluginPhase("Half") ?? null } };
        logs.splice(0);
    }
    finish();

    function finish() {
        server.close();
        process.stdout.write(JSON.stringify(out, null, 1) + "\nERRORS:" + (errors.length ? errors.join("\n") : "none") + "\nLOGS:\n" + logs.filter(l => !l.startsWith("[debug]") && !l.startsWith("[info]")).join("\n") + "\n");
        process.exit(0);
    }
})().catch(e => { console.error(e); process.exit(1); });
