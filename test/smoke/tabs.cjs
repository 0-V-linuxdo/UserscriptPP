// 多标签页:几个 jsdom 窗口共用一个"脚本管理器后台"。和 Violentmonkey / Tampermonkey 一样,每个标签页读写自己的本地缓存,
// 写入异步送到后台,后台按到达顺序存下并广播给其他标签页(带 remote=true 的值变化通知)。
// 用法:node tabs.cjs <脚本> <场景>;PROFILE=adguard 时没有值变化监听,读写直接走后台
const { JSDOM } = require("jsdom");
const fs = require("fs");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const scenario = process.argv[3];
const url = "http://localhost:8080/uspp-example/index.html";
const ID = process.env.USPP_ID || "example";
const KEY = Symbol.for(`uspp:${ID}`);
const SK = "UserscriptPPSettings";
const adguard = process.env.PROFILE === "adguard";
const HOP = 5; // 标签页 → 后台、后台 → 标签页各 5 ms
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const background = new Map();
let backgroundWrites = 0;
const tabs = [];
const errors = [];

function openTab(name) {
    const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="toolbar"></div></body></html>`, { url, runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window;
    w.addEventListener("error", e => errors.push(`${name} uncaught: ` + (e.error?.stack || e.message)));
    for (const k of ["log", "info", "debug"]) w.console[k] = () => { };
    w.console.warn = w.console.error = (...a) => errors.push(`${name}: ` + a.map(x => x instanceof Error ? x.stack : String(x)).join(" "));
    const cache = new Map([...background].map(([k, v]) => [k, clone(v)]));
    const listeners = [];
    const tab = { name, w, cache, listeners };
    if (adguard) {
        w.GM_getValue = (k, d) => background.has(k) ? clone(background.get(k)) : d;
        w.GM_setValue = (k, v) => { background.set(k, clone(v)); if (k === SK) backgroundWrites++; };
    } else {
        w.GM_getValue = (k, d) => cache.has(k) ? clone(cache.get(k)) : d;
        w.GM_setValue = (k, v) => {
            cache.set(k, clone(v));
            const sent = clone(v);
            setTimeout(() => {
                background.set(k, sent);
                if (k === SK) backgroundWrites++;
                for (const t of tabs) {
                    if (t === tab) continue;
                    setTimeout(() => {
                        const old = t.cache.get(k);
                        t.cache.set(k, clone(sent));
                        for (const l of t.listeners) if (l.k === k) l.fn(k, old, clone(sent), true);
                    }, HOP);
                }
            }, HOP);
        };
        w.GM_addValueChangeListener = (k, fn) => { listeners.push({ k, fn }); return listeners.length; };
    }
    w.GM_deleteValue = k => { cache.delete(k); background.delete(k); };
    w.GM_registerMenuCommand = () => 1;
    if (adguard) {
        w.GM_info = { scriptHandler: "AdGuard", version: "7.20" };
        w.unsafeWindow = w; w.GM_xmlhttpRequest = () => ({ abort() { } });
        w.GM = { info: w.GM_info, notification: () => Promise.resolve() };
    }
    w.eval(bundle);
    tab.P = w[KEY].api;
    tabs.push(tab);
    return tab;
}

const stored = () => { const v = background.get(SK); return typeof v === "string" ? JSON.parse(v) : v; };
const sysOf = t => t.P.PlainSettings.plugins.Settings;

(async () => {
    const out = {};
    const a = openTab("A"), b = openTab("B");
    await sleep(400);
    if (scenario === "concurrent") {
        // 同一刻各改一个不同的项:两项都要留下,两页一致
        a.P.Settings.plugins.Settings.probeA = "a";
        b.P.Settings.plugins.Settings.probeB = "b";
        await sleep(1500);
        const s = stored().plugins.Settings;
        out.stored = { probeA: s.probeA ?? null, probeB: s.probeB ?? null };
        out.A = { probeA: sysOf(a).probeA ?? null, probeB: sysOf(a).probeB ?? null };
        out.B = { probeA: sysOf(b).probeA ?? null, probeB: sysOf(b).probeB ?? null };
    } else if (scenario === "conflict") {
        // 同一刻改同一项:所有标签页和存储收敛到同一个值
        a.P.Settings.plugins.Settings.probe = "from-A";
        b.P.Settings.plugins.Settings.probe = "from-B";
        await sleep(1500);
        out.values = [stored().plugins.Settings.probe, sysOf(a).probe, sysOf(b).probe];
        out.converged = new Set(out.values).size === 1;
    } else if (scenario === "registered") {
        // 另一页(别的站点,没有这个插件)导入一份没有它的旧备份:本页已注册、正在用的插件设置重置为默认值,不删条目
        a.P.registerPlugin(a.P.definePlugin({ name: "RegProbe", description: "x", authors: ["t"], settings: a.P.definePluginSettings({ mode: { type: a.P.OptionType.STRING, default: "auto" } }) }));
        a.P.Settings.plugins.RegProbe.mode = "dark";
        await sleep(800);
        const before = b.P.PlainSettings.plugins.RegProbe?.mode;
        const backup = clone(b.P.PlainSettings);
        delete backup.plugins.RegProbe;
        await b.P.importSettings(backup);
        await sleep(800);
        let read;
        try { read = a.P.plugins.RegProbe.settings.store.mode; } catch (e) { read = "throws " + e.message; }
        out.registered = { before, entry: "RegProbe" in a.P.PlainSettings.plugins, read, stored: stored().plugins.RegProbe?.mode ?? null };
    }
    out.writes = backgroundWrites;
    console.log(JSON.stringify(out, null, 1));
    console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
    console.log("LOGS:");
    process.exit(0);
})();
