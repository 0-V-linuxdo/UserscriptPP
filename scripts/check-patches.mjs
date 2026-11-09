#!/usr/bin/env node
// 补丁检查器(命令行)。不用浏览器,在 CI 里也能跑:
//
//   node scripts/check-patches.mjs --site <id> | --site-dir <目录>          只做静态检查(正则、反向引用、捕获组……)
//   node scripts/check-patches.mjs --site-dir <目录> --url https://站点/   再拉取线上页面和全部分块(含懒加载分块),逐条测试补丁
//   node scripts/check-patches.mjs --site-dir <目录> --chunks <目录>        用保存在本地的分块文件测试(*.js,递归)
//
// 其他参数:--json(输出 JSON)、--limit <n>(最多取多少个分块,缺省 3000)、--strict(提示也算失败)、
// --min-modules <n>(线上检查至少要取到多少个模块,缺省 1)、--max-fetch-failures <比例>(取不到的分块最多占多少,缺省 0.2)、
// --allow-offline(线上 / 本地分块一个模块都没取到时退回静态检查,而不是失败)。
// 有错误时退出码为 1;要求了线上检查却没取到足够的模块、或取不到的分块太多,也算错误(退出码 1)。
// 在 GitHub Actions 里会输出 ::error / ::warning 标注。
// 页面里也有同样的检查:开发构建的 uspp_<ID>.checkPatches()(还会检查查找器)。
import { readdirSync, statSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argValues = name => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const flag = name => args.includes(name);
const siteDirs = [
    ...argValues("--site").flatMap(v => String(v).split(",")).filter(Boolean).map(id => {
        const dir = [join(root, "sites", id), join(root, "sites", `${id}.dev`)].find(existsSync);
        if (!dir) throw new Error(`框架仓库里没有示例站点 ${id}`);
        return dir;
    }),
    ...argValues("--site-dir").map(p => resolve(p)),
];
const url = argValues("--url")[0];
const chunkDirs = argValues("--chunks").map(p => resolve(p));
const limit = +(argValues("--limit")[0] ?? 3000);
const asJson = flag("--json");
const strict = flag("--strict");
const allowOffline = flag("--allow-offline");
const minModules = Math.max(1, +(argValues("--min-modules")[0] ?? 1) || 1);
const maxFetchFailures = +(argValues("--max-fetch-failures")[0] ?? 0.2);
// 要求了线上检查(给了 --url 或 --chunks):模式由参数决定,不由取没取到模块决定
const wantLive = !!url || chunkDirs.length > 0;
const isCI = process.env.GITHUB_ACTIONS === "true";

if (!siteDirs.length) {
    console.error("用法:node scripts/check-patches.mjs --site <id> | --site-dir <目录> [--url <网址> | --chunks <目录>] [--json] [--strict]");
    process.exit(2);
}

// 核心模块在页面里运行;命令行里补上它们在加载时会读的几个全局名字
globalThis.window ??= globalThis;
// 构建时由 esbuild 替换成常量;命令行直接引入核心模块时按开发构建处理(补丁检查要用开发版的告警)
globalThis.__USPP_DEV__ ??= true;
const { lintPatch, checkPatches, describeResult, crawlChunks, extractChunkPaths, factoriesFromChunk } = await import(pathToFileURL(join(root, "core/lib/reporter.js")).href);

// ---------- 读取站点和插件定义 ----------
/** 替身接口:插件定义时调用的任何东西都返回可继续调用 / 取属性的替身,只把定义对象原样交回 */
function stub(path = "U") {
    const fn = function () { };
    return new Proxy(fn, {
        get(_, k) {
            if (k === Symbol.toPrimitive) return () => path;
            if (k === "then") return undefined;
            if (typeof k === "symbol") return undefined;
            return stub(`${path}.${k}`);
        },
        apply() { return stub(`${path}()`); },
        construct() { return stub(`new ${path}`); },
    });
}
const enumStub = () => new Proxy({}, { get: (_, k) => (typeof k === "string" ? k : undefined) });
function makeApi() {
    const real = {
        defineSite: d => d,
        definePlugin: d => d,
        definePluginSettings: def => ({ def, checks: {}, store: stub("settings.store"), plain: stub("settings.plain"), use: () => stub("settings.store"), withPrivateSettings() { return this; } }),
        OptionType: enumStub(),
        StartAt: enumStub(),
        prefix: "uspp-",
    };
    return new Proxy(real, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? stub(`U.${k}`) : undefined) });
}
const entryOf = dir => ["index.js", "index.mjs", "index.jsx", "index.ts", "index.tsx"].map(f => join(dir, f)).find(existsSync);
const subdirs = dir => (existsSync(dir) ? readdirSync(dir).sort().filter(n => statSync(join(dir, n)).isDirectory()) : []);

// TS / JSX 写的定义先用 esbuild 转成 Node 能导入的文件(JSX 换成什么都不画的替身:这里只取补丁)
let tmp = null, seq = 0;
async function loadable(file) {
    if (/\.m?js$/.test(file)) return pathToFileURL(file).href;
    tmp ??= mkdtempSync(join(tmpdir(), "uspp-check-"));
    const out = join(tmp, `m${++seq}.mjs`);
    await build({ entryPoints: [file], bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "error", jsx: "transform", jsxFactory: "__h", jsxFragment: "__f", banner: { js: "const __h = () => null, __f = null;" } });
    return pathToFileURL(out).href;
}
async function load(file, api) {
    const mod = await import(await loadable(file));
    return typeof mod.default === "function" ? mod.default(api) : mod.default;
}

const entries = []; // { plugin, index, patch, file }
const sites = [];
for (const dir of siteDirs) {
    const api = makeApi();
    const entry = entryOf(dir);
    if (!entry) throw new Error(`${dir} 里没有入口文件`);
    const site = await load(entry, api);
    sites.push(site);
    (site.settingsHost?.patches || []).forEach((patch, index) => entries.push({ plugin: "Settings(settingsHost)", index, patch, file: entry }));
    const pluginDirs = [...subdirs(join(dir, "plugins")).map(n => join(dir, "plugins", n)), ...subdirs(join(root, "plugins")).map(n => join(root, "plugins", n))];
    for (const pdir of pluginDirs) {
        const pe = entryOf(pdir);
        if (!pe) continue;
        let def;
        try { def = await load(pe, api); } catch (e) { entries.push({ plugin: relative(root, pdir), index: -1, patch: null, file: pe, loadError: String(e?.stack || e) }); continue; }
        (def?.patches || []).forEach((patch, index) => entries.push({ plugin: def.name, index, patch, file: pe }));
    }
}

// ---------- 取模块源码 ----------
function evaluateChunk(text) {
    const pushes = [];
    const sink = { push: (...cs) => { pushes.push(...cs); return pushes.length; } };
    const sandbox = { TURBOPACK: sink, document: { currentScript: null }, console: { log() { }, warn() { }, error() { }, info() { }, debug() { } } };
    // webpack 站点:分块推给 self.<分块全局名>
    const wpGlobal = sites.find(s => s.driver === "webpack")?.driverOptions?.global;
    if (wpGlobal) sandbox[wpGlobal] = sink;
    sandbox.self = sandbox; sandbox.window = sandbox;
    // 有的分块写 globalThis.TURBOPACK ||= [],有的写 (TURBOPACK = TURBOPACK || []);都会拿到 sink
    vm.runInNewContext(text, sandbox, { timeout: 5000 });
    if (Array.isArray(sandbox.TURBOPACK)) pushes.push(...sandbox.TURBOPACK);
    if (wpGlobal && Array.isArray(sandbox[wpGlobal])) pushes.push(...sandbox[wpGlobal]);
    return pushes;
}
// webpack 的方法简写工厂(123(e,t,n){...})单独看不是合法表达式,和页面里一样补上 function
const sourceOf = fn => { const s = Function.prototype.toString.call(fn); return /^(?!function\b|async\b|class\b)[\w$]+\s*\(/.test(s) ? `function ${s.replace(/^[\w$]+/, "")}` : s; };
const syntaxCheck = code => { try { new vm.Script(`(${code}\n)`); return null; } catch (e) { return e.message; } };

const sources = new Map();
let crawl = null;
async function fetchText(u) {
    const res = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (userscript-pp check-patches)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}
function walk(dir) { return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : n.endsWith(".js") ? [p] : []; }); }

if (chunkDirs.length) {
    for (const d of chunkDirs) for (const f of walk(d)) {
        try { for (const c of evaluateChunk(readFileSync(f, "utf8"))) for (const [id, fn] of factoriesFromChunk(c)) sources.set(id, sourceOf(fn)); } catch (e) { console.error(`解析 ${f} 失败:${e.message}`); }
    }
}
if (url && sites.some(s => s.driver === "webpack")) {
    crawl = { ...await crawlWebpack(new URL(url), sites.find(s => s.driver === "webpack").driverOptions?.global), webpack: true };
} else if (url) {
    const site = sites.find(s => s.driver) || sites[0];
    const chunkPath = site?.driverOptions?.chunkPath || "/_next/static/chunks/";
    // 分块路径写作 static/chunks/x.js,前面要补上 chunkPath 里 static/chunks/ 之前的部分(Next.js 是 /_next/)
    const prefix = chunkPath.replace(/static\/chunks\/?$/, "");
    const base = new URL(url);
    const html = await fetchText(base.href);
    const seeds = new Set(extractChunkPaths(html));
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
        const p = new URL(m[1], base).pathname;
        const i = p.indexOf("static/chunks/");
        if (i >= 0) seeds.add(p.slice(i));
    }
    const log = asJson ? () => { } : ({ done, queued }) => { if (done % 50 === 0) process.stderr.write(`\r已取 ${done} 个分块,队列 ${queued}…`); };
    crawl = await crawlChunks({ sources, seeds: [...seeds], fetchText: p => fetchText(new URL(prefix + p, base).href), evaluate: evaluateChunk, limit, onProgress: log });
    if (!asJson) process.stderr.write("\r" + " ".repeat(40) + "\r");
}

/**
 * webpack 站点的线上爬取:页面里的 <script src> 按顺序在同一个沙箱里执行(站点自己的运行时会装上它的 push),
 * 然后借运行时的 __webpack_require__.u / .p 把模块源码里 n.e(ID) 引用的懒加载分块换成地址,逐个取回再执行,直到没有新分块
 */
async function crawlWebpack(base, global) {
    if (!global) throw new Error("webpack 站点需要 driverOptions.global");
    const quiet = { log() { }, warn() { }, error() { }, info() { }, debug() { } };
    const noop = () => { };
    const fakeEl = () => ({ setAttribute: noop, appendChild: noop, addEventListener: noop, removeEventListener: noop, style: {}, parentNode: { removeChild: noop } });
    const doc = { currentScript: null, getElementsByTagName: () => [], querySelectorAll: () => [], querySelector: () => null, createElement: fakeEl, head: fakeEl(), body: fakeEl(), documentElement: fakeEl(), addEventListener: noop };
    const sandbox = { document: doc, console: quiet, location: { href: base.href, origin: base.origin, protocol: base.protocol, host: base.host, pathname: base.pathname }, navigator: { userAgent: "Mozilla/5.0" }, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, addEventListener: noop, removeEventListener: noop };
    sandbox.self = sandbox; sandbox.window = sandbox; sandbox.globalThis = sandbox;
    const done = new Set(), seenChunks = new WeakSet();
    let fetched = 0;
    const failed = [];
    const collect = () => {
        for (const c of Array.isArray(sandbox[global]) ? sandbox[global] : []) {
            if (!c || typeof c !== "object" || seenChunks.has(c)) continue;
            seenChunks.add(c);
            for (const [id, fn] of factoriesFromChunk(c)) sources.set(id, sourceOf(fn));
        }
    };
    const run = async src => {
        if (done.has(src) || fetched >= limit) return;
        done.add(src);
        try {
            const text = await fetchText(src);
            fetched++;
            doc.currentScript = { src, tagName: "SCRIPT", getAttribute: k => (k === "src" ? src : null) };
            try { vm.runInNewContext(text, sandbox, { timeout: 5000 }); } catch { /* 入口模块碰到页面接口时会出错;分块已经推进去了 */ }
        } catch (e) { failed.push(src); if (!asJson) console.error(`取 ${src} 失败:${e.message}`); }
        collect();
    };
    const html = await fetchText(base.href);
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) await run(new URL(m[1], base).href);
    // 借运行时:推一个空分块,拿到它交给分块运行时函数的 __webpack_require__
    let req = null;
    try { sandbox[global]?.push?.([[Symbol("uspp-check")], {}, r => { req = r; }]); } catch { /* 忽略 */ }
    if (typeof req?.u !== "function") {
        if (!asJson) console.error("没取到 webpack 运行时的分块地址函数(__webpack_require__.u),只检查页面直接引用的脚本");
        return { chunks: fetched, failed, truncated: fetched >= limit, lazy: 0 };
    }
    const pub = (() => { try { return typeof req.p === "string" && req.p !== "auto" ? req.p : ""; } catch { return ""; } })();
    const queued = new Set();
    let lazy = 0;
    for (let round = 0; round < 50; round++) {
        const ids = new Set();
        for (const src of sources.values()) for (const m of src.matchAll(/\.e\((\d+|"[^"]+")\)/g)) { const id = m[1].replace(/^"|"$/g, ""); if (!queued.has(id)) ids.add(id); }
        if (!ids.size || fetched >= limit) break;
        for (const id of ids) {
            queued.add(id);
            let file;
            try { file = req.u(/^\d+$/.test(id) ? +id : id); } catch { continue; }
            if (typeof file !== "string") continue;
            const before = fetched;
            await run(new URL(pub + file, pub ? base : (doc.currentScript?.src || base)).href);
            if (fetched > before) lazy++;
        }
    }
    return { chunks: fetched, failed, truncated: fetched >= limit, lazy };
}

// ---------- 检查 ----------
// 缺少证据就失败:要求了线上检查却没取到模块(或取不到的分块太多),不能悄悄退回静态检查后报"通过"
const fetchProblems = [];
if (wantLive) {
    if (sources.size < minModules) fetchProblems.push(`只取到 ${sources.size} 个模块,少于要求的 ${minModules} 个`);
    // turbopack 的爬取把取不到的也算进 chunks;webpack 的 chunks 只算取到的
    const tried = !crawl ? 0 : crawl.webpack ? crawl.chunks + crawl.failed.length : crawl.chunks;
    if (crawl && crawl.failed.length && crawl.failed.length / tried > maxFetchFailures) fetchProblems.push(`${crawl.failed.length} / ${tried} 个分块取不到,超过 ${Math.round(maxFetchFailures * 100)}%`);
}
const offline = wantLive && sources.size === 0 && allowOffline;
const live = wantLive && sources.size > 0;
const loadErrors = entries.filter(e => e.loadError);
const valid = entries.filter(e => !e.loadError);
const report = live
    ? checkPatches(valid, sources, { syntaxCheck })
    : (() => {
        const results = valid.map(e => {
            const issues = lintPatch(e.patch);
            return { plugin: e.plugin, index: e.index, find: String(e.patch?.find), status: issues.some(i => i.severity === "error") ? "invalid" : "ok", modules: [], replacements: [], issues };
        });
        return { summary: { total: results.length, ok: results.filter(r => r.status === "ok").length, failed: results.filter(r => r.status !== "ok").length, warnings: results.reduce((n, r) => n + r.issues.filter(i => i.severity === "warn").length, 0), modules: 0 }, results };
    })();
report.mode = live ? "live" : "lint";
report.crawl = crawl;
// --allow-offline 时没取到模块不算错误,只提示
report.fetchProblems = offline ? [] : fetchProblems;
if (offline) report.offline = fetchProblems;
report.loadErrors = loadErrors.map(e => ({ plugin: e.plugin, error: e.loadError }));

// GitHub Actions 标注:按 match / find 的源码在插件文件里找行号
function lineOf(file, needle) {
    try {
        const text = readFileSync(file, "utf8");
        const s = needle instanceof RegExp ? needle.source : String(needle ?? "");
        const i = s ? text.indexOf(s.slice(0, 40)) : -1;
        return i < 0 ? 1 : text.slice(0, i).split("\n").length;
    } catch { return 1; }
}

const failed = report.results.filter(r => !["ok", "skipped"].includes(r.status) || (strict && r.issues.length));
if (asJson) console.log(JSON.stringify(report, (k, v) => (v instanceof RegExp ? String(v) : v), 2));
else {
    const s = report.summary;
    console.log(`${live ? `线上检查(${s.modules} 个模块${crawl ? `,${crawl.chunks} 个分块${crawl.failed.length ? `,${crawl.failed.length} 个取不到` : ""}${crawl.truncated ? ",已到上限" : ""}` : ""})` : "静态检查"}:${s.total} 条补丁,通过 ${s.ok},失败 ${s.failed},提示 ${s.warnings}`);
    for (const r of report.results) if (r.status !== "ok" || r.issues.length) console.log(describeResult(r));
    for (const e of loadErrors) console.log(`${e.plugin}:载入插件失败\n    ${e.loadError.split("\n")[0]}`);
    for (const p of report.fetchProblems) console.log(`线上检查不完整:${p}`);
    if (offline) console.log(`没取到任何模块,按 --allow-offline 退回静态检查:${fetchProblems.join(";")}`);
    if (crawl?.failed.length) console.log(`取不到的分块:${crawl.failed.slice(0, 10).map(f => (typeof f === "string" ? f : f.path)).join(", ")}${crawl.failed.length > 10 ? ` 等 ${crawl.failed.length} 个` : ""}`);
    if (live) {
        const slow = report.results.filter(r => r.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, 5);
        if (slow.length) console.log(`最慢的 find:${slow.map(r => `${r.plugin}#${r.index} ${r.ms}ms`).join(",")}`);
    }
}
if (isCI) {
    for (const p of report.fetchProblems) console.log(`::error::线上检查不完整:${p}`);
    const byKey = new Map(valid.map(e => [`${e.plugin}#${e.index}`, e]));
    for (const r of report.results) {
        const e = byKey.get(`${r.plugin}#${r.index}`);
        if (!e) continue;
        const file = relative(process.cwd(), e.file);
        for (const i of r.issues) console.log(`::${i.severity === "error" ? "error" : "warning"} file=${file},line=${lineOf(e.file, i.where === "find" ? [].concat(e.patch.find)[0] : [].concat(e.patch.replacement)[+(/\d+/.exec(i.where)?.[0] ?? 0)]?.match)}::${r.plugin}#${r.index} ${i.message}`);
        if (["notFound", "partial", "groupReverted", "syntaxError"].includes(r.status)) console.log(`::error file=${file},line=${lineOf(e.file, [].concat(e.patch.find)[0])}::${describeResult(r).replaceAll("\n", "%0A")}`);
    }
}
process.exit(failed.length || loadErrors.length || report.fetchProblems.length ? 1 : 0);
