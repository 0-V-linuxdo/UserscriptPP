const uiOf = (d, tag) => { const h = d.querySelector(tag); const sr = h?.shadowRoot; return sr ? (sr.querySelector(`[class$="shadow-mount"]`) ?? sr) : h; };
// 更新冒烟:上次运行的是旧版本 -> 提示更新日志;到期自动检查 -> 发现新版本 -> 点通知打开 .user.js;Updates 页显示状态
// 用法:node updater.cjs <脚本>;USPP_ID、LAST(上次运行的版本)、CHECKED(上次检查时间,毫秒)
const { JSDOM } = require("jsdom");
const fs = require("fs");
const http = require("http");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const ID = process.env.USPP_ID || "upd";
const KEY = Symbol.for(`uspp:${ID}`);
const px = `uspp-${ID}-`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="toolbar"></div></body></html>`, { url: "http://localhost:8080/uspp-example/index.html", runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window;
    const errors = [];
    w.addEventListener("error", e => errors.push("uncaught: " + (e.error?.stack || e.message)));
    const logs = [];
    for (const k of ["log", "info", "warn", "error", "debug"]) w.console[k] = (...a) => logs.push(`[${k}] ` + a.map(x => x instanceof Error ? x.stack : String(x)).join(" "));
    const store = new Map();
    const sys = {};
    if (process.env.LAST) sys.lastVersion = process.env.LAST;
    if (process.env.CHECKED) sys.lastUpdateCheck = Number(process.env.CHECKED);
    if (process.env.FAILS) { sys.updateCheckFailures = Number(process.env.FAILS); sys.lastUpdateFailedAt = Number(process.env.FAILED_AT); }
    store.set("UserscriptPPSettings", { plugins: { Settings: sys } });
    w.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
    w.GM_setValue = (k, v) => store.set(k, v);
    w.GM_deleteValue = k => store.delete(k);
    w.GM_addValueChangeListener = () => 1;
    w.GM_registerMenuCommand = () => 1;
    w.GM_unregisterMenuCommand = () => { };
    w.Response = globalThis.Response; w.Headers = globalThis.Headers;
    const requests = [];
    w.GM_xmlhttpRequest = o => {
        requests.push(o.url.replace(/[?&]t=\d+/, ""));
        // 发布地址上的 .meta.js:版本 1.3.0;FAIL=1 时服务器出错
        if (process.env.FAIL) { setTimeout(() => o.onload({ status: 500, responseText: "", responseHeaders: "" }), 5); return; }
        setTimeout(() => o.onload({ status: 200, responseText: "// ==UserScript==\n// @name  x\n// @version   1.3.0\n// ==/UserScript==\n", responseHeaders: "" }), 5);
    };
    const opened = [];
    w.open = u => { opened.push(String(u).replace(/[?&]t=\d+/, "")); return null; };
    w.eval(bundle);
    await sleep(400);
    const U = w[KEY].api;
    const doc = w.document;
    const rootText = () => uiOf(doc, `${px}root`)?.textContent ?? "";
    const out = { requests: requests.slice() };
    const hist = U.getNotificationHistory();
    out.notes = hist.map(n => n.title);
    // 点"已更新"通知:打开只含两次版本之间条目的更新日志
    const updated = hist.find(n => /updated to/.test(n.title));
    if (updated?.onClick) { updated.onClick(); await sleep(50); out.changelogVersions = [...uiOf(doc, `${px}root`).querySelectorAll(`[data-${px}changelog-version]`)].map(e => e.getAttribute(`data-${px}changelog-version`)); U.closeAllModals(); await sleep(30); }
    const avail = hist.find(n => /available/.test(n.title));
    if (avail?.onClick) avail.onClick();
    out.opened = opened.slice();
    out.storedVersion = store.get("UserscriptPPSettings")?.plugins?.Settings?.lastVersion;
    const storedSys = () => store.get("UserscriptPPSettings")?.plugins?.Settings ?? {};
    out.checkedAt = typeof storedSys().lastUpdateCheck;
    out.failures = storedSys().updateCheckFailures ?? 0;
    // 同时发起两次检查(例如自动检查还没回来时点了"检查更新"):共用同一次请求和结果
    if (process.env.CONCURRENT) {
        const before = requests.length;
        const [r1, r2] = await Promise.all([U.checkForUpdate(), U.checkForUpdate()]);
        out.concurrent = { same: r1 === r2, current: r1?.current ?? null, latest: r1?.latest ?? null, requests: requests.length - before };
    }
    U.openSettings({ tab: "updates" });
    await sleep(80);
    out.status = uiOf(doc, `${px}root`)?.querySelector(`[data-${px}update-status]`)?.textContent ?? null;
    out.pageHasChangelog = uiOf(doc, `${px}root`).querySelectorAll(`[data-${px}page="updates"] [data-${px}changelog-version]`).length;
    out.errors = errors;
    out.logs = logs.filter(l => /^\[(warn|error)\]/.test(l));
    console.log(JSON.stringify(out));
    process.exit(0);
})();
