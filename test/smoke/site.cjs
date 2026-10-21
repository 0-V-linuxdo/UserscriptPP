// 其他网站冒烟:通用站点只有核心,不碰打包器,不往网站存储写设置;另测运行时注册站点(F4)和示例站点
// 用法:node site.cjs <脚本> <网址>;USPP_ID=<脚本 ID>
const { JSDOM } = require("jsdom");
const fs = require("fs");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const url = process.argv[3] || "https://example.com/page";
const ID = process.env.USPP_ID || "example";
const SK = `UserscriptPP:${ID}:settings`, KEY = Symbol.for(`uspp:${ID}`);
const px = `uspp-${ID}-`, da = `data-uspp-${ID}`;
const dom = new JSDOM(`<!doctype html><html><head></head><body><p>hi</p><div id="toolbar"></div></body></html>`, { url, runScripts: "dangerously", pretendToBeVisual: true });
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
w.GM_unregisterMenuCommand = id => { if (menus[id - 1]) menus[id - 1].removed = true; };
// 本脚本的 GM 数据里有已不在这条脚本里的插件的数据:启动后清理
store.set("UserscriptPPSettings", { plugins: { GrokChatBar: { enabled: true }, SomeGrokPlugin: { enabled: true, x: 1 } } });
w.eval(bundle);
const liveMenus = () => menus.filter(m => !m.removed).map(m => m.name);
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(300);
    const P = w[KEY];
    const out = {};
    const d = Object.getOwnPropertyDescriptor(w, "TURBOPACK");
    out.turbopackTouched = !!d;
    out.fetchWrapped = w.fetch !== undefined && /uspp/i.test(String(w.fetch));
    out.globals = { legacy: "UserscriptPP" in w, debug: w[`uspp_${ID.replace(/[^a-z0-9]/g, "_")}`] === P };
    out.site = P.site.id;
    out.buildSites = P.buildSites;
    out.plugins = Object.keys(P.plugins);
    out.started = Object.values(P.plugins).map(p => `${p.name}:${p.started}`);
    out.menus = liveMenus();
    // Quick CSS 写入后只对这个网站生效
    P.setQuickCss({ css: "p{outline:1px solid red}", enabled: true });
    await sleep(10);
    out.quickCss = /outline/.test(w.document.querySelector(`style[${da}="quick-css"]`)?.textContent || "") || (w.document.adoptedStyleSheets || []).some(s => [...s.cssRules].some(r => r.cssText.includes("outline")));
    out.find = P.findByProps("anything");
    out.aliasNoop = (() => { try { P.addChatBarButton("x", {}); return typeof P.common; } catch (e) { return "throws " + e.message; } })();
    P.Settings.plugins.Settings.starredPlugins = ["x"];
    await sleep(300);
    out.siteStorage = w.localStorage.getItem(SK);
    const saved = store.get("UserscriptPPSettings");
    out.staleCleaned = !saved.plugins.GrokChatBar && !saved.plugins.SomeGrokPlugin;
    out.here = saved.plugins.Settings.sites?.[new w.URL(url).hostname]?.customCSS;
    // 菜单命令打开框架设置面板
    menus[0]?.fn();
    await sleep(50);
    out.panel = w.document.querySelector(`${px}root`)?.textContent.slice(0, 300) ?? null;
    P.closeAllModals();
    P.showToast("hello");
    out.toast = w.document.querySelector(`${px}toasts`)?.shadowRoot.textContent;
    if (P.site.id === "generic") {
        // F4:运行时注册一个无打包器站点和它的插件,往悬浮按钮区和菜单命令里加东西
        let clicks = 0;
        out.registered = P.registerSite({ id: "news", name: "News", matches: [`*://${new w.URL(url).hostname}/*`] });
        out.switched = P.site.id;
        P.registerPlugin(P.definePlugin({
            name: "NewsProbe", description: "x", authors: ["t"],
            slots: { floating: { label: "NewsBtn", onClick: () => clicks++ }, menuCommand: { label: "News cmd", onSelect: () => clicks++ } },
        }));
        P.startPlugin("NewsProbe");
        await sleep(50);
        const btn = [...w.document.querySelectorAll(`${px}root button`)].find(b => b.textContent.includes("NewsBtn"));
        btn?.click();
        menus.find(m => m.name === "News cmd" && !m.removed)?.fn();
        out.f4 = { site: P.plugins.NewsProbe?.site, button: !!btn, menu: liveMenus().includes("News cmd"), clicks };
        P.stopPlugin("NewsProbe");
        await sleep(50);
        out.f4.after = { button: [...w.document.querySelectorAll(`${px}root button`)].some(b => b.textContent.includes("NewsBtn")), menu: liveMenus().includes("News cmd") };
    }
    if (P.site.id === "example") {
        await sleep(200);
        const b = w.document.querySelector(`#toolbar [${px.replace("uspp-", "data-uspp-")}toolbar-item]`);
        b?.click();
        await sleep(10);
        out.example = { button: b?.textContent, toast: w.document.querySelector(`${px}toasts`)?.shadowRoot.textContent, menu: liveMenus().includes("Example: say hello") };
    }
    out.idle = await P.countIdleMutations(1500);
    console.log(JSON.stringify(out, null, 1));
    console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
    console.log("LOGS:\n" + logs.filter(l => /^\[(warn|error)\]/.test(l)).join("\n"));
    process.exit(0);
})();
