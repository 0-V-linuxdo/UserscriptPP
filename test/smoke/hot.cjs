// 热重载冒烟:加载 --hot 开发构建,GM_xmlhttpRequest 接到本机的热重载服务;父进程改文件,这里看页面上的变化
// 输出:READY(已连上) / REPLACED(插件已原地替换) / 最后一行 JSON 结果
const { JSDOM } = require("jsdom");
const fs = require("fs");
const http = require("http");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const ID = process.env.USPP_ID || "example";
const KEY = Symbol.for(`uspp:${ID}`);
const px = `uspp-${ID}-`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="app"></div></body></html>`, { url: "http://localhost:8080/uspp-example/index.html", runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window;
    const errors = [];
    w.addEventListener("error", e => errors.push("uncaught: " + (e.error?.stack || e.message)));
    const logs = [];
    for (const k of ["log", "info", "warn", "error", "debug"]) w.console[k] = (...a) => logs.push(`[${k}] ` + a.map(x => x instanceof Error ? x.stack : String(x)).join(" "));
    const store = new Map();
    w.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
    w.GM_setValue = (k, v) => store.set(k, v);
    w.GM_deleteValue = k => store.delete(k);
    w.GM_addValueChangeListener = () => 1;
    w.GM_registerMenuCommand = () => 1;
    w.GM_unregisterMenuCommand = () => { };
    let polls = 0;
    w.GM_xmlhttpRequest = o => {
        polls++;
        const req = http.get(o.url, res => {
            let text = "";
            res.on("data", c => { text += c; });
            res.on("end", () => o.onload?.({ status: res.statusCode, responseText: text }));
        });
        req.setTimeout(o.timeout || 30000, () => { req.destroy(); o.ontimeout?.(); });
        req.on("error", () => o.onerror?.());
    };
    w.eval(bundle);
    const U = w[KEY];
    const doc = w.document;
    const waitFor = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(50); } return false; };
    const counter = () => doc.querySelector(`[data-${px}tsx-counter]`)?.textContent ?? null;
    await waitFor(() => counter() && polls >= 2);
    const out = { before: counter() };
    // 点两下,确认是 JSX 组件在工作
    doc.querySelector(`[data-${px}tsx-counter]`).click();
    await sleep(50);
    out.clicked = counter();
    console.log("READY");
    out.replaced = await waitFor(() => /^Taps/.test(counter() || ""));
    out.after = counter();
    out.hosts = doc.querySelectorAll(`[data-${px}tsx-host]`).length;
    out.started = U.plugins.ExampleTsx.started;
    out.toast = [...doc.querySelectorAll(`${px}toasts`)].some(t => t.shadowRoot?.textContent.includes("Reloaded ExampleTsx"));
    console.log("REPLACED");
    out.full = await waitFor(() => (doc.querySelector(`${px}root`)?.textContent ?? "").includes("Dev build rebuilt"));
    out.errors = errors;
    out.logs = logs.filter(l => /^\[(warn|error)\]/.test(l));
    console.log(JSON.stringify(out));
    process.exit(0);
})();
