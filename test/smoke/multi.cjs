// 同一页面两条基于框架的站点脚本(各自带一份核心):互不影响
// 用法:node multi.cjs <脚本A> <IDA> <脚本B> <IDB>
// 每条脚本在脚本管理器里有自己的 GM 存储和菜单,这里用函数参数给每条脚本一套独立的 GM 替身
const { JSDOM } = require("jsdom");
const fs = require("fs");
const [fileA, idA, fileB, idB] = process.argv.slice(2);
const url = "http://localhost:8080/uspp-example/index.html";
const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="toolbar"></div></body></html>`, { url, runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window;
const errors = [];
w.addEventListener("error", e => errors.push("uncaught: " + (e.error?.stack || e.message)));
const logs = [];
for (const k of ["log", "info", "warn", "error", "debug"]) w.console[k] = (...a) => logs.push(`[${k}] ` + a.map(x => x instanceof Error ? x.stack : String(x)).join(" "));

// 页面自己的 fetch 和 history
const pageFetchCalls = [];
w.fetch = function pageFetch(u) { pageFetchCalls.push(String(u)); return Promise.resolve(new Response("{}")); };
const pagePush = w.history.pushState;

const GM_NAMES = ["GM_getValue", "GM_setValue", "GM_deleteValue", "GM_addValueChangeListener", "GM_removeValueChangeListener", "GM_registerMenuCommand", "GM_unregisterMenuCommand", "GM_setClipboard", "GM_xmlhttpRequest"];
function gmFor() {
    const store = new Map(), menus = [];
    return {
        store, menus,
        api: {
            GM_getValue: (k, d) => (store.has(k) ? store.get(k) : d),
            GM_setValue: (k, v) => store.set(k, v),
            GM_deleteValue: k => store.delete(k),
            GM_addValueChangeListener: () => 1,
            GM_removeValueChangeListener: () => { },
            GM_registerMenuCommand: (name, fn) => { menus.push({ name, fn }); return menus.length; },
            GM_unregisterMenuCommand: id => { if (menus[id - 1]) menus[id - 1].removed = true; },
            GM_setClipboard: () => { },
            GM_xmlhttpRequest: () => ({ abort() { } }),
        },
    };
}
function inject(file, gm) {
    const fn = w.eval(`(function (${GM_NAMES.join(", ")}) {\n${fs.readFileSync(file, "utf8")}\n})`);
    fn(...GM_NAMES.map(n => gm.api[n]));
}

const gmA = gmFor(), gmB = gmFor();
inject(fileA, gmA);
// 两条脚本之间,别的脚本也包了一层 fetch 和 pushState
const foreignSeen = [];
const beforeForeign = w.fetch;
w.fetch = function foreignFetch(...a) { foreignSeen.push(String(a[0])); return beforeForeign.apply(this, a); };
const beforeForeignPush = w.history.pushState;
w.history.pushState = function foreignPush(...a) { foreignSeen.push("push"); return beforeForeignPush.apply(this, a); };
inject(fileB, gmB);
// 同一条脚本再注入一次:不重复运行
inject(fileA, gmA);

const live = gm => gm.menus.filter(m => !m.removed).map(m => m.name);
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(400);
    const A = w[Symbol.for(`uspp:${idA}`)], B = w[Symbol.for(`uspp:${idB}`)];
    const out = {};
    out.started = [A?.scriptId, B?.scriptId, A !== B];
    out.globals = { legacy: "UserscriptPP" in w, a: w[`uspp_${idA}`] === A, b: w[`uspp_${idB}`] === B };
    out.toolbar = [...w.document.querySelectorAll("#toolbar button")].map(b => [...b.attributes].map(x => x.name).filter(n => n.startsWith("data-uspp")).join(","));

    // 网络:两条脚本各自订阅,别的脚本的包装和页面自己的 fetch 都照常被调用
    const hits = [];
    A.onResponse("/api/", c => hits.push("A:" + c.url));
    B.onResponse("/api/", c => hits.push("B:" + c.url));
    const fetchNow = w.fetch;
    await w.fetch("/api/x");
    await sleep(20);
    out.fetch = { hits: hits.sort(), foreign: foreignSeen.filter(x => x !== "push"), page: pageFetchCalls, untouched: w.fetch === fetchNow };

    // 路由:两条脚本都收到网址变化,别的包装和页面原来的 pushState 都在链上
    const routes = [];
    A.onRouteChange(d => routes.push("A:" + new w.URL(d.url).pathname));
    B.onRouteChange(d => routes.push("B:" + new w.URL(d.url).pathname));
    w.history.pushState({}, "", "/uspp-example/next");
    await sleep(10);
    out.route = { routes: routes.sort(), foreign: foreignSeen.includes("push"), pageKept: typeof pagePush === "function" };

    // 设置:各自的 GM 存储和网站存储键;A 写的 Quick CSS 只在 A 的样式里
    A.setQuickCss({ css: "p{outline:1px solid red}", enabled: true });
    A.Settings.plugins.Settings.starredPlugins = ["onlyA"];
    await sleep(300);
    out.settings = {
        aStarred: A.PlainSettings.plugins.Settings.starredPlugins, bStarred: B.PlainSettings.plugins.Settings.starredPlugins ?? [],
        bQuickCss: B.getQuickCss()?.css || "",
        gmA: [...gmA.store.keys()], gmB: [...gmB.store.keys()],
        ls: Object.keys(w.localStorage).sort(),
    };
    const sheetText = sel => [...w.document.querySelectorAll(sel)].map(e => e.textContent).join("") + (w.document.adoptedStyleSheets || []).map(s => [...s.cssRules].map(r => r.cssText).join("")).join("");
    out.styles = { aOwn: /outline/.test(sheetText(`style[data-uspp-${idA}="quick-css"]`)), bHasA: /outline/.test(w.document.querySelector(`style[data-uspp-${idB}="quick-css"]`)?.textContent || "") };

    // 菜单和界面:各自的菜单项、各自的根元素和提示框
    out.menus = { a: live(gmA), b: live(gmB) };
    A.showToast("fromA"); B.showToast("fromB");
    gmA.menus[0]?.fn();
    await sleep(50);
    out.ui = {
        roots: [...w.document.querySelectorAll("*")].map(e => e.tagName.toLowerCase()).filter(t => /^uspp-/.test(t)).filter((t, i, a) => a.indexOf(t) === i).sort(),
        aToast: w.document.querySelector(`uspp-${idA}-toasts`)?.shadowRoot.textContent,
        bToast: w.document.querySelector(`uspp-${idB}-toasts`)?.shadowRoot.textContent,
        aPanel: !!w.document.querySelector(`uspp-${idA}-root`)?.textContent.includes("Plugins"),
        bPanel: !!w.document.querySelector(`uspp-${idB}-root`)?.textContent.includes("Plugins"),
    };
    A.closeAllModals();
    // 关掉 A 的插件不影响 B
    A.stopPlugin("ExampleHello");
    await sleep(20);
    out.stopA = { a: A.plugins.ExampleHello.started, b: B.plugins.ExampleHello.started };
    out.idle = [(await A.countIdleMutations(1000)).count, (await B.countIdleMutations(1000)).count];
    console.log(JSON.stringify(out, null, 1));
    console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
    console.log("LOGS:\n" + logs.filter(l => /^\[(warn|error)\]/.test(l)).join("\n"));
    console.log("INFO:\n" + logs.filter(l => /^\[info\]/.test(l)).join("\n"));
    process.exit(0);
})();
