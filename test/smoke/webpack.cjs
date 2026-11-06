// webpack 驱动冒烟:先装脚本,再跑一个仿 webpack 5 的运行时(分块全局 webpackChunksim,运行时之前和之后各推一个分块)
// 用法:node webpack.cjs <脚本>;USPP_ID=<脚本 ID>;FOREIGN=1 时先有别的脚本把分块全局装成访问器
const { JSDOM } = require("jsdom");
const fs = require("fs");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const ID = process.env.USPP_ID || "wpsim";
const KEY = Symbol.for(`uspp:${ID}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const RUNTIME = `(() => {
    var modules = {}, cache = {};
    function req(id) {
        if (cache[id]) return cache[id].exports;
        var m = cache[id] = { exports: {} };
        modules[id].call(m.exports, m, m.exports, req);
        return m.exports;
    }
    req.m = modules; req.c = cache;
    // 懒加载分块:真实页面里是插入 <script>,这里直接执行保存好的分块文本
    var loaded = {};
    req.e = id => loaded[id] || (loaded[id] = new Promise(r => setTimeout(() => { (0, eval)(self.__lazyChunks[id]); r(); }, 5)));
    req.d = (e, defs) => { for (var k in defs) Object.defineProperty(e, k, { enumerable: true, get: defs[k] }); };
    var cb = (parent, data) => {
        var ids = data[0], more = data[1], rt = data[2];
        for (var id in more) modules[id] = more[id];
        var r = rt && rt(req);
        if (parent) parent(data);
        return r;
    };
    var g = self.webpackChunksim = self.webpackChunksim || [];
    g.forEach(cb.bind(null, 0));
    g.push = cb.bind(null, g.push.bind(g));
})();`;
// 分块 1 在运行时之前推入(原生 push),分块 2 之后推入,分块 3 带入口
const CHUNK1 = `(self.webpackChunksim = self.webpackChunksim || []).push([[1], {
    11: function (e, t, n) { n.d(t, { greet: () => r }); const r = () => "hello SIM_GREETING"; },
}]);`;
const CHUNK2 = `(self.webpackChunksim = self.webpackChunksim || []).push([[2], {
    22(e, t, n) { t.value = n(11).greet() + "!"; t.SIM_STORE = { kind: "store" }; },
    33: (e, t, n) => { e.exports = { broken: true, SIM_BROKEN: 1 }; },
    66: function(e,t,n){t.SIM_OPENER=()=>Promise.all([n.e(4)]).then(n.bind(n,55))},
}]);`;
// 懒加载分块 4(含入口模块 55)和 5
const LAZY = {
    4: `(self.webpackChunksim = self.webpackChunksim || []).push([[4], { 44: function(e,t,n){t.LAZY_WIDGET="lazy"}, 55: function(e,t,n){t.LAZY_ENTRY=n(44).LAZY_WIDGET} }]);`,
    5: `(self.webpackChunksim = self.webpackChunksim || []).push([[5], { 77: function(e,t,n){t.LAZY_OTHER=7} }]);`,
};
const CHUNK3 = `(self.webpackChunksim = self.webpackChunksim || []).push([[3], {}, req => { self.__entry = req(22); req(33); }]);`;

// INLINE=1:按真实 webpack 5 的写法,入口模块直接写在运行时里、运行时一启动就执行;之后的分块经 __webpack_require__.m[id] = f 登记
const RUNTIME_INLINE = `(() => {
    var __webpack_modules__ = { 901: function (e, t, n) { t.INLINE_ENTRY = "inline hello"; } };
    var cache = {};
    function req(id) {
        var c = cache[id];
        if (c !== undefined) return c.exports;
        var m = cache[id] = { exports: {} };
        __webpack_modules__[id].call(m.exports, m, m.exports, req);
        return m.exports;
    }
    req.m = __webpack_modules__; req.c = cache;
    var cb = (parent, data) => {
        var more = data[1], rt = data[2];
        for (var id in more) req.m[id] = more[id];
        var r = rt && rt(req);
        if (parent) parent(data);
        return r;
    };
    var g = self.webpackChunkinl = self.webpackChunkinl || [];
    g.forEach(cb.bind(null, 0));
    g.push = cb.bind(null, g.push.bind(g));
    self.__inline = req(901);
})();`;
const CHUNK_LATE = `(self.webpackChunkinl = self.webpackChunkinl || []).push([[7], { 902: function (e, t, n) { t.INLINE_LATE = "late hello"; } }, req => { self.__late = req(902); }]);`;

// DUMP=<目录>:只把分块写成文件(给命令行补丁检查器的 --chunks 用)
if (process.env.DUMP) {
    fs.writeFileSync(`${process.env.DUMP}/chunk1.js`, CHUNK1);
    fs.writeFileSync(`${process.env.DUMP}/chunk2.js`, CHUNK2);
    fs.writeFileSync(`${process.env.DUMP}/chunk4.js`, LAZY[4]);
    // 可以用 HTTP 提供的仿站点:页面 -> 分块 1、运行时(带 .p / .u)、分块 2;分块 4 只能经 n.e(4) 找到
    const site = `${process.env.DUMP}/site`;
    fs.mkdirSync(`${site}/static`, { recursive: true });
    fs.writeFileSync(`${site}/index.html`, `<!doctype html><html><head><script src="/static/c1.js"></script><script src="/static/runtime.js"></script><script src="/static/c2.js"></script></head><body></body></html>`);
    fs.writeFileSync(`${site}/static/c1.js`, CHUNK1);
    fs.writeFileSync(`${site}/static/c2.js`, CHUNK2);
    fs.writeFileSync(`${site}/static/runtime.js`, RUNTIME.replace("req.m = modules;", 'req.m = modules; req.p = "/static/"; req.u = id => "lazy-" + id + ".abc123.js";'));
    fs.writeFileSync(`${site}/static/lazy-4.abc123.js`, LAZY[4]);
    process.exit(0);
}

(async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="app"></div></body></html>`, { url: "https://sim.example/app", runScripts: "dangerously", pretendToBeVisual: true });
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
    let foreignSeen = 0;
    if (process.env.FOREIGN) {
        // 别的脚本:访问器形式挂接分块全局,自己的 push 也照常转交
        let v;
        Object.defineProperty(w, "webpackChunksim", { configurable: true, get: () => v, set: x => { v = x; foreignSeen++; } });
    }
    w.__lazyChunks = LAZY;
    w.eval(bundle);
    if (process.env.INLINE) {
        w.eval(RUNTIME_INLINE);
        w.eval(CHUNK_LATE);
        await sleep(300);
        const U = w[KEY].api;
        const rep = U.patchReport();
        console.log(JSON.stringify({
            inline: w.__inline?.INLINE_ENTRY ?? null, late: w.__late?.INLINE_LATE ?? null,
            found: U.findByProps("INLINE_ENTRY")?.INLINE_ENTRY ?? null,
            applied: rep.stats.applied, unhooked: !Object.getOwnPropertyDescriptor(w.Function.prototype, "m"),
            plainM: (() => { const f = function () { }; f.m = 5; return f.m === 5 && Object.getOwnPropertyDescriptor(f, "m")?.value === 5; })(),
            pageErrors: errors, logs: logs.filter(l => /^\[(warn|error)\]/.test(l)),
        }));
        process.exit(0);
    }
    w.eval(CHUNK1);
    w.eval(RUNTIME);
    w.eval(CHUNK2);
    w.eval(CHUNK3);
    await sleep(300);
    const U = w[KEY].api;
    // 懒加载:按源码找到打开它的模块,加载分块并执行入口;loadChunk + importModule 按 ID 取
    // FOREIGN 时没挂接、没有运行时,跳过(分块加载会退回插 <script>,jsdom 里不会加载)
    const lazy = { before: !!U.findByProps("LAZY_WIDGET") };
    if (!process.env.FOREIGN) {
    lazy.ok = await U.extractAndLoadChunks("SIM_OPENER");
    lazy.widget = U.findByProps("LAZY_WIDGET")?.LAZY_WIDGET ?? null;
    lazy.entry = U.findByProps("LAZY_ENTRY")?.LAZY_ENTRY ?? null;
    lazy.loadChunk = await U.loadChunk(5);
    lazy.other = (await U.importModule(77))?.LAZY_OTHER ?? null;
    }
    const rep = U.patchReport();
    const out = {
        site: U.site?.id ?? null,
        entry: w.__entry?.value ?? null,
        found: U.findByProps("greet")?.greet?.() ?? null,
        store: U.findByProps("SIM_STORE")?.SIM_STORE?.kind ?? null,
        broken: U.findByProps("SIM_BROKEN")?.broken ?? null,
        fallbacks: rep.stats.runtimeFallbacks,
        byCode: !!U.findByCode?.("SIM_GREETING"),
        lazy,
        applied: rep.stats.applied,
        bypassed: rep.stats.bypassed,
        errors: rep.stats.errors,
        orphaned: rep.orphaned,
        started: Object.values(U.plugins).map(p => `${p.name}:${p.started}`),
        pushIsOurs: typeof w.webpackChunksim.push === "function",
        foreignSeen,
        pageErrors: errors,
        logs: logs.filter(l => /^\[(warn|error)\]/.test(l)),
    };
    console.log(JSON.stringify(out));
    process.exit(0);
})();
