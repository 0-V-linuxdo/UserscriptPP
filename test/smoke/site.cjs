// 其他网站冒烟:通用站点只有核心,不碰打包器,不往网站存储写设置;另测运行时注册站点(F4)和示例站点
const { JSDOM } = require("jsdom");
const fs = require("fs");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const url = process.argv[3] || "https://example.com/page";
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
// 共享的 GM 设置:旧版布局(主题和 Quick CSS 在顶层)、Grok 专用插件的数据
store.set("UserscriptPPSettings", { plugins: { Settings: { customCSS: "p{color:red}", customCSSMatches: ["*"], themes: [{ url: "local-g", name: "GrokOnly", local: true, css: "b{}", enabled: true }] }, GrokChatBar: { enabled: true }, SomeGrokPlugin: { enabled: true, x: 1 } } });
w.eval(bundle);
const liveMenus = () => menus.filter(m => !m.removed).map(m => m.name);
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(300);
    const P = w.UserscriptPP;
    const out = {};
    const d = Object.getOwnPropertyDescriptor(w, "TURBOPACK");
    out.turbopackTouched = !!d;
    out.fetchWrapped = w.fetch !== undefined && /uspp/i.test(String(w.fetch));
    out.site = P.site.id;
    out.plugins = Object.keys(P.plugins);
    out.started = Object.values(P.plugins).map(p => `${p.name}:${p.started}`);
    out.menus = liveMenus();
    // 旧版顶层的主题和 Quick CSS 已搬进 Grok 分区,在这里不生效
    out.grokTheme = !!w.document.querySelector('style[data-uspp="theme:local-g"]') || (w.document.adoptedStyleSheets || []).some(s => [...s.cssRules].some(r => r.cssText.startsWith("b")));
    // Quick CSS 写入后只对这个网站生效
    P.setQuickCss({ css: "p{outline:1px solid red}", enabled: true });
    await sleep(10);
    out.quickCss = /outline/.test(w.document.querySelector('style[data-uspp="quick-css"]')?.textContent || "") || (w.document.adoptedStyleSheets || []).some(s => [...s.cssRules].some(r => r.cssText.includes("outline")));
    out.find = P.findByProps("anything");
    out.aliasNoop = (() => { try { P.addChatBarButton("x", {}); return typeof P.common; } catch (e) { return "throws " + e.message; } })();
    P.Settings.plugins.Settings.starredPlugins = ["x"];
    await sleep(300);
    out.siteStorage = w.localStorage.getItem("UserscriptPPSettings");
    const saved = store.get("UserscriptPPSettings");
    out.keptGrokData = !!saved.plugins.GrokChatBar?.enabled;
    out.migrated = { grokThemes: (saved.plugins.Settings.sites?.grok?.themes || []).map(t => t.name), grokCss: saved.plugins.Settings.sites?.grok?.customCSS, topLevel: "customCSS" in saved.plugins.Settings, here: saved.plugins.Settings.sites?.[new w.URL(url).hostname]?.customCSS };
    // 菜单命令打开框架设置面板
    menus[0]?.fn();
    await sleep(50);
    out.panel = w.document.querySelector("uspp-root")?.textContent.slice(0, 300) ?? null;
    P.closeAllModals();
    P.showToast("hello");
    out.toast = w.document.querySelector("uspp-toasts")?.shadowRoot.textContent;
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
        const btn = [...w.document.querySelectorAll("uspp-root button")].find(b => b.textContent.includes("NewsBtn"));
        btn?.click();
        menus.find(m => m.name === "News cmd" && !m.removed)?.fn();
        out.f4 = { site: P.plugins.NewsProbe?.site, button: !!btn, menu: liveMenus().includes("News cmd"), clicks };
        P.stopPlugin("NewsProbe");
        await sleep(50);
        out.f4.after = { button: [...w.document.querySelectorAll("uspp-root button")].some(b => b.textContent.includes("NewsBtn")), menu: liveMenus().includes("News cmd") };
    }
    if (P.site.id === "example") {
        await sleep(200);
        const b = w.document.querySelector("#toolbar [data-uspp-toolbar-item]");
        b?.click();
        await sleep(10);
        out.example = { button: b?.textContent, toast: w.document.querySelector("uspp-toasts")?.shadowRoot.textContent, menu: liveMenus().includes("Example: say hello") };
    }
    out.idle = await P.countIdleMutations(1500);
    console.log(JSON.stringify(out, null, 1));
    console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
    console.log("LOGS:\n" + logs.filter(l => /^\[(warn|error)\]/.test(l)).join("\n"));
    process.exit(0);
})();
