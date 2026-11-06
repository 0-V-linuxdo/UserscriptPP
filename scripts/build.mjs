#!/usr/bin/env node
// 构建站点脚本。Userscript++ 只提供框架,用户安装的是开发者用它构建出的站点脚本:一条脚本 = 一份核心 + 站点适配 + 插件。
//
//   node scripts/build.mjs --site <id>[,<id>...]   用框架仓库 sites/ 下的示例站点构建
//   node scripts/build.mjs --site-dir <目录>        用任意位置的站点目录构建(可写多次;多个站点打进同一条脚本)
//   node scripts/build.mjs                          不带站点参数:只检查所有示例站点能否构建,不产出文件
//   其他参数:--out <目录>(缺省 dist/)、--dev(只出开发构建)、--prod(只出发布构建)、
//             --channel <名字>(发布渠道,见 README;只出发布构建)、--watch(源码变化时自动重新构建)、
//             --hot(= --watch --dev,并在 127.0.0.1 起热重载服务:只改了一个插件时,页面上只替换这个插件,不刷新)、
//             --hot-port <端口>(缺省 5174)
//
// 入口文件可以是 index.js / index.mjs / index.jsx / index.ts / index.tsx。TS 只去掉类型、不做类型检查(用 tsc --noEmit 检查);
// JSX 编译成 U.react.h(...),片段是 U.react.Fragment,不用自己引入 h。
//
// 站点目录:index.js(U => U.defineSite(...))、plugins/<插件>/index.js、userscript.json(发布信息,见 README)。
import { build } from "esbuild";
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync, watch, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename, sep, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 框架自己的版本(package.json),和站点脚本的版本分开;写进脚本供诊断和 U.frameworkVersion 使用 */
const FRAMEWORK_VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const args = process.argv.slice(2);
const argValues = name => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
// 缺省输出到当前目录的 dist/:框架作为依赖装在 node_modules 里时,产物也落在站点仓库自己的目录
const outDir = resolve(argValues("--out")[0] ?? "dist");
const siteIds = [...argValues("--site"), ...argValues("--sites")].flatMap(v => String(v || "").split(",")).map(x => x.trim()).filter(Boolean);
const siteDirs = argValues("--site-dir").map(p => resolve(p));
const CHECK_ONLY = !siteIds.length && !siteDirs.length;
const channel = argValues("--channel")[0] || null;
const HOT = args.includes("--hot");
const WATCH = args.includes("--watch") || HOT;
const HOT_PORT = Number(argValues("--hot-port")[0] || 5174);
const HOT_URL = HOT ? `http://127.0.0.1:${HOT_PORT}` : null;
const variants = args.includes("--dev") || HOT ? [true] : args.includes("--prod") || (channel && channel !== "dev") ? [false] : channel === "dev" ? [true] : [false, true];

const d = new Date();
const pad = n => String(n).padStart(2, "0");
// 没写 version 时按构建时间生成:统一用 UTC、精确到秒,本机和 CI(时区不同)交替构建时版本号也不会倒退,同一分钟里的两次构建也能区分
const VERSION = process.env.USPP_VERSION || `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}.${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

// 框架核心必需的授权;站点可在 userscript.json 的 grants 里追加
const BASE_GRANTS = ["unsafeWindow", "GM_getValue", "GM_setValue", "GM_deleteValue", "GM_addValueChangeListener", "GM_removeValueChangeListener", "GM_registerMenuCommand", "GM_unregisterMenuCommand", "GM_setClipboard", "GM_xmlhttpRequest"];

const ENTRY_FILES = ["index.js", "index.mjs", "index.jsx", "index.ts", "index.tsx"];
const entryOf = dir => ENTRY_FILES.map(f => join(dir, f)).find(existsSync);
const SOURCE_RE = /\.(m?js|jsx|tsx?)$/;
const loaderOf = path => (/\.tsx$/.test(path) ? "tsx" : /\.ts$/.test(path) ? "ts" : /\.jsx$/.test(path) ? "jsx" : "js");
// JSX 的工厂:构建时注入,指向核心的 h / Fragment(随站点 React 或内置 Preact 切换)
const JSX = { jsx: "transform", jsxFactory: "__USPP_JSX_H__", jsxFragment: "__USPP_JSX_FRAGMENT__" };
const subdirs = dir => (existsSync(dir) ? readdirSync(dir).sort().filter(n => statSync(join(dir, n)).isDirectory()) : []);
const isDevDir = name => /\.dev$/.test(name);
const isChromiumDir = name => /\.chromium$/.test(name.replace(/\.dev$/, ""));
const ID_RE = /^[a-z][a-z0-9-]*$/;

/** 一个插件一个目录;.dev 只进开发构建;.chromium 自动标 chromiumOnly */
function collectPluginDir(dir, dev) {
    const out = [];
    for (const name of subdirs(dir)) {
        if (isDevDir(name) && !dev) continue;
        const entry = entryOf(join(dir, name));
        if (entry) out.push({ entry, dir: name, dev: isDevDir(name), chromium: isChromiumDir(name) });
    }
    return out;
}

/** TS / JSX 写的站点定义:先用 esbuild 转成 Node 能直接导入的文件 */
let metaTmp = null;
async function nodeLoadable(entry) {
    if (/\.m?js$/.test(entry)) return pathToFileURL(entry).href;
    metaTmp ??= mkdtempSync(join(tmpdir(), "uspp-meta-"));
    const out = join(metaTmp, `${basename(dirname(entry))}-${++importSeq}.mjs`);
    await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "neutral", write: true, outfile: out, logLevel: "error", ...JSX, jsxFactory: "__h", jsxFragment: "__f", banner: { js: "const __h = () => null, __f = null;" } });
    return pathToFileURL(out).href;
}

/** 站点定义只是一个返回对象的工厂,在 Node 里用替身接口调用一次,取 ID、名字和网址模式 */
let importSeq = 0;
async function readSiteMeta(entry) {
    // 监视构建时每次都重新读取(加查询串绕过模块缓存)
    const mod = await import(await nodeLoadable(entry) + (WATCH ? `?v=${++importSeq}` : ""));
    const stubApi = new Proxy({ defineSite: x => x }, { get: (t, k) => (k in t ? t[k] : () => ({})) });
    const def = typeof mod.default === "function" ? mod.default(stubApi) : mod.default;
    if (!def?.id || !def.name || !Array.isArray(def.matches)) throw new Error(`${entry} 不是有效的站点定义`);
    return def;
}

async function loadSite(dir, dev) {
    const entry = entryOf(dir);
    if (!entry) throw new Error(`${dir} 里没有入口文件(${ENTRY_FILES.join(" / ")})`);
    const meta = await readSiteMeta(entry);
    const dirId = basename(dir).replace(/\.dev$/, "");
    if (meta.id !== dirId) throw new Error(`站点目录 ${basename(dir)} 和站点 ID ${meta.id} 不一致`);
    return { id: meta.id, name: meta.name, matches: meta.matches, excludeMatches: meta.excludeMatches || [], driver: meta.driver || null, dir, entry, plugins: collectPluginDir(join(dir, "plugins"), dev) };
}

/** 脚本配置(发布信息)来自第一个站点目录的 userscript.json;没给名字空间时按脚本 ID 生成一个唯一值并写回配置,保证以后的构建不变 */
function loadConfig(site) {
    const file = join(site.dir, "userscript.json");
    const cfg = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    const id = cfg.id ?? site.id;
    if (!ID_RE.test(id)) throw new Error(`脚本 ID 只能用小写字母开头,含小写字母、数字和 -:${id}`);
    if (!cfg.namespace) {
        cfg.namespace = `userscript-pp:${id}:${randomBytes(6).toString("hex")}`;
        writeFileSync(file, JSON.stringify(cfg, null, 4) + "\n");
        console.log(`${file}:没有 namespace,已生成 ${cfg.namespace} 并写回(以后的构建沿用它)`);
    }
    return applyChannel({ ...cfg, id });
}

/**
 * 发布渠道:userscript.json 的 channels.<名字> 覆盖顶层字段(常用 updateBase、name、fileName)。
 * 没写 name / fileName 时,名字后加 " (<渠道>)",文件名加 ".<渠道>",和稳定版装在一起也互不覆盖。
 * stable 是缺省渠道(不带 --channel 时就是它);dev 渠道就是开发构建。
 */
function applyChannel(cfg) {
    if (!channel || channel === "stable" || channel === "dev") {
        const over = channel ? cfg.channels?.[channel] : null;
        const { channels, ...rest } = cfg;
        return over ? { ...rest, ...over } : rest;
    }
    const over = cfg.channels?.[channel];
    if (!over) throw new Error(`userscript.json 里没有发布渠道 ${channel}(channels.${channel})`);
    const { channels, ...rest } = cfg;
    const name = over.name ?? (rest.name ? `${rest.name} (${channel})` : undefined);
    const fileName = over.fileName ?? `${rest.fileName || rest.id}.${channel}`;
    return { ...rest, ...over, name, fileName, channel };
}

/** 插件名在一条脚本内必须唯一 */
function checkDuplicates(sites, generic) {
    const seen = new Map([["Settings", "core"]]);
    const all = [...generic.map(p => ["plugins", p]), ...sites.flatMap(x => x.plugins.map(p => [`sites/${x.id}`, p]))];
    for (const [where, p] of all) {
        const key = p.dir.replace(/\.(dev|chromium)/g, "");
        if (seen.has(key)) throw new Error(`插件名重复:${key}(${seen.get(key)} 和 ${where})`);
        seen.set(key, where);
    }
}

const ident = id => id.replace(/[^a-z0-9]/g, "_");

const hostOf = u => { try { return new URL(u).hostname; } catch { return null; } };
/**
 * @connect 只写用到的主机:更新地址的主机、在线主题允许的主机(themeHosts)、--hot 构建的本机服务、配置里追加的 connect。
 * 都没有时不写 @connect(脚本不能跨域请求任何主机)。配置写 "connect": ["*"] 时恢复成任意主机。
 */
function connectHosts(cfg, dev) {
    if (Array.isArray(cfg.connect) && cfg.connect.includes("*")) return ["*"];
    const hosts = [
        cfg.updateBase && hostOf(cfg.updateBase),
        ...(cfg.themeHosts || []),
        dev && HOT_URL && hostOf(HOT_URL),
        ...(cfg.connect || []),
    ].filter(Boolean);
    return [...new Set(hosts)];
}

function header(cfg, sites, dev) {
    const matches = cfg.match?.length ? cfg.match : [...new Set(sites.flatMap(x => x.matches))];
    const excludes = cfg.excludeMatch ?? [...new Set(sites.flatMap(x => x.excludeMatches))];
    const file = cfg.fileName || cfg.id;
    const base = `${file}${dev ? ".dev" : ""}`;
    const upd = cfg.updateBase ? cfg.updateBase.replace(/\/?$/, "/") : null;
    const lines = [
        ["name", `${cfg.name || sites.map(x => x.name).join(" + ") + (cfg.channel ? ` (${cfg.channel})` : "")}${dev ? " (dev)" : ""}`],
        ["namespace", cfg.namespace],
        ["version", cfg.version || VERSION],
        cfg.description && ["description", cfg.description],
        cfg.author && ["author", cfg.author],
        cfg.icon && ["icon", cfg.icon],
        cfg.homepage && ["homepageURL", cfg.homepage],
        cfg.supportURL && ["supportURL", cfg.supportURL],
        // 只在配置给了更新地址前缀时写;文件名里的 + 等字符要转义
        upd && ["updateURL", upd + encodeURIComponent(`${base}.meta.js`)],
        upd && ["downloadURL", upd + encodeURIComponent(`${base}.user.js`)],
        ...matches.map(m => ["match", m]),
        ...excludes.map(m => ["exclude-match", m]),
        ["run-at", "document-start"],
        // 页面上下文注入;严格 CSP 的网站上由脚本管理器退回沙盒
        ["inject-into", "auto"],
        ["sandbox", "JavaScript"],
        ["noframes", ""],
        ...[...new Set([...BASE_GRANTS, ...(cfg.grants || [])])].map(g => ["grant", g]),
        ...connectHosts(cfg, dev).map(c => ["connect", c]),
        ...(cfg.require || []).map(r => ["require", r]),
        ...Object.entries(cfg.resource || {}).map(([k, v]) => ["resource", `${k} ${v}`]),
    ].filter(Boolean);
    const w = Math.max(...lines.map(([k]) => k.length)) + 2;
    return { base, text: ["// ==UserScript==", ...lines.map(([k, v]) => `// @${k.padEnd(w)}${v}`.trimEnd()), "// ==/UserScript=="].join("\n") + "\n" };
}

const marks = (v, p) => [p.dev ? `${v}.dev = true;` : "", p.chromium ? `${v}.chromiumOnly = true;` : ""].join("");
/** 构建产物里每个定义都包成接收公开接口的工厂;插件可以直接导出对象,也可以导出 U => 定义 */
const wrap = (v, p, extra = "") => `(U => { const d = typeof ${v} === "function" ? ${v}(U) : ${v}; ${marks("d", p)}${extra} return d; })`;

function virtualModules(sites, generic) {
    return {
        name: "uspp-virtual",
        setup(b) {
            b.onResolve({ filter: /^uspp:(plugins|sites)$/ }, a => ({ path: a.path.slice(5), namespace: "uspp" }));
            b.onLoad({ filter: /.*/, namespace: "uspp" }, a => {
                let contents;
                if (a.path === "plugins") {
                    contents = generic.map((p, i) => `import p${i} from ${JSON.stringify(p.entry)};`).join("\n")
                        + `\nexport default [${generic.map((p, i) => wrap(`p${i}`, p, ' d.site ??= "*";')).join(", ")}];`;
                } else {
                    const imports = [], items = [];
                    sites.forEach((x, i) => {
                        imports.push(`import s${i} from ${JSON.stringify(x.entry)};`);
                        x.plugins.forEach((p, j) => imports.push(`import s${i}p${j} from ${JSON.stringify(p.entry)};`));
                        items.push(`{ id: ${JSON.stringify(x.id)}, site: s${i}, plugins: [${x.plugins.map((p, j) => wrap(`s${i}p${j}`, p, ` d.site = ${JSON.stringify(x.id)};`)).join(", ")}] }`);
                    });
                    contents = `${imports.join("\n")}\nexport default [${items.join(",\n")}];`;
                }
                return { contents, resolveDir: root, loader: "js" };
            });
        },
    };
}

/**
 * 页面上留下的名字都带脚本 ID:源码里统一写 uspp- / uspp_ / data-uspp / $$uspp… / __uspp… / Symbol.for("uspp.…"),
 * 构建时改成 uspp-<ID>- 等,两条基于框架的脚本在同一页面上不会共用类名、元素名、标记或函数上的标签。
 */
function scopeNames(id, dirs) {
    const I = ident(id);
    const rules = [
        [/\$\$uspp(?=[A-Z])/g, `$$$$uspp_${I}_`],
        [/__uspp(?=[A-Z])/g, `__uspp_${I}_`],
        [/Symbol\.for\("uspp\./g, `Symbol.for("uspp.${id}.`],
        // 前面是 / 的不改:网址和路径里的 uspp-(例如示例站点的 /uspp-example)不是页面上的名字
        [/(?<![\w$/])uspp-/g, `uspp-${id}-`],
        // 在上一条之后:不带后缀的 data-uspp(上一条已经处理过 data-uspp-xxx)
        [/data-uspp(?![\w-])/g, `data-uspp-${id}`],
        [/(?<![\w$])uspp_/g, `uspp_${I}_`],
    ];
    const inScope = p => dirs.some(dir => p.startsWith(dir + sep)) && !p.includes(`${sep}node_modules${sep}`);
    return {
        name: "uspp-scope-names",
        setup(b) {
            b.onLoad({ filter: SOURCE_RE }, a => {
                if (!inScope(a.path)) return undefined;
                let s = readFileSync(a.path, "utf8");
                for (const [re, to] of rules) s = s.replace(re, to);
                return { contents: s, loader: loaderOf(a.path), resolveDir: dirname(a.path) };
            });
        },
    };
}

/**
 * 更新日志:第一个站点目录的 CHANGELOG.md。每个版本一个二级标题("## 1.2.0" 或 "## 1.2.0 - 2026-11-01"),
 * 下面的列表项(- / *)和普通段落是这个版本的说明;只取最近 30 个版本
 */
function readChangelog(site) {
    const file = join(site.dir, "CHANGELOG.md");
    if (!existsSync(file)) return [];
    const out = [];
    let cur = null;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
        const line = raw.trim();
        const m = /^##\s+v?([0-9][\w.+-]*)\s*(?:[-–—(]\s*([^)]*?)\)?)?\s*$/.exec(line);
        if (m) { cur = { version: m[1], date: m[2] || null, notes: [] }; out.push(cur); continue; }
        if (/^#/.test(line)) { cur = null; continue; }
        if (!cur || !line) continue;
        cur.notes.push(line.replace(/^[-*]\s+/, ""));
    }
    return out.slice(0, 30);
}

/** 更新地址(和元数据头里的 @updateURL / @downloadURL 一致);没配 updateBase 时为 null */
function updateInfo(cfg, dev) {
    if (!cfg.updateBase) return null;
    const upd = cfg.updateBase.replace(/\/?$/, "/");
    const base = `${cfg.fileName || cfg.id}${dev ? ".dev" : ""}`;
    return { meta: upd + encodeURIComponent(`${base}.meta.js`), download: upd + encodeURIComponent(`${base}.user.js`) };
}

async function bundle(sites, cfg, dev) {
    const generic = collectPluginDir(join(root, "plugins"), dev);
    checkDuplicates(sites, generic);
    // 控制台调试用的全局名字:开发构建缺省 uspp_<ID>,发布构建缺省不挂
    const globalName = dev ? (cfg.global === undefined ? `uspp_${ident(cfg.id)}` : cfg.global) : (cfg.globalInProduction ? cfg.global || `uspp_${ident(cfg.id)}` : null);
    const script = { id: cfg.id, name: cfg.name || sites.map(x => x.name).join(" + "), global: globalName };
    const res = await build({
        entryPoints: [join(root, "core/index.js")],
        bundle: true,
        format: "iife",
        target: ["chrome110", "firefox115"],
        charset: "utf8",
        write: false,
        legalComments: "none",
        minify: false,
        ...JSX,
        inject: [join(root, "core/jsx-shim.js")],
        resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
        define: {
            __USPP_VERSION__: JSON.stringify(cfg.version || VERSION),
            __USPP_DEV__: String(dev),
            __USPP_FRAMEWORK__: JSON.stringify(FRAMEWORK_VERSION),
            // 构建期常量:核心直接写在判断里,esbuild 据此去掉发布构建用不到的分支和只在这些分支里引用的模块
            __USPP_WEBPACK__: String(sites.some(x => x.driver === "webpack")),
            __USPP_HOT__: JSON.stringify(dev && HOT_URL ? HOT_URL : null),
            __USPP_UPDATE__: JSON.stringify(updateInfo(cfg, dev)),
            __USPP_CHANGELOG__: JSON.stringify(readChangelog(sites[0])),
            __USPP_SITES__: JSON.stringify(sites.map(x => x.id)),
            __USPP_SCRIPT__: JSON.stringify(script),
            __USPP_CONNECT__: JSON.stringify(connectHosts(cfg, dev)),
            // 只给冒烟测试:把完整接口挂到页面桥上,方便测试脚本从页面里拿;正常构建不要设
            __USPP_TEST_EXPOSE__: String(process.env.USPP_TEST_EXPOSE === "1"),
        },
        plugins: [scopeNames(cfg.id, [join(root, "core"), join(root, "plugins"), ...sites.map(x => x.dir)]), virtualModules(sites, generic)],
        logLevel: "warning",
    });
    return res.outputFiles[0].text;
}

const exampleDirs = () => subdirs(join(root, "sites")).map(n => join(root, "sites", n)).filter(p => entryOf(p));

if (CHECK_ONLY) {
    // 不产出可安装的脚本:逐个示例站点检查能否构建
    for (const dir of exampleDirs()) {
        const site = await loadSite(dir, true);
        const cfg = loadConfig(site);
        for (const dev of [false, true]) await bundle([await loadSite(dir, dev)], cfg, dev);
        console.log(`检查通过:${basename(dir)}(脚本 ID ${cfg.id})`);
    }
    console.log("没有指定站点,未产出脚本。用 --site <id> 或 --site-dir <目录> 构建站点脚本。");
} else {
    await buildAll();
    if (WATCH) watchAndRebuild();
}

async function buildAll() {
    const byId = new Map(exampleDirs().map(p => [basename(p).replace(/\.dev$/, ""), p]));
    const dirs = [...siteIds.map(id => {
        const p = byId.get(id);
        if (!p) throw new Error(`找不到示例站点 ${id}(可选:${[...byId.keys()].join(", ")})`);
        return p;
    }), ...siteDirs];
    for (const dev of variants) {
        const sites = [];
        for (const dir of dirs) sites.push(await loadSite(dir, dev));
        const cfg = loadConfig(sites[0]);
        const code = await bundle(sites, cfg, dev);
        const head = header(cfg, sites, dev);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `${head.base}.user.js`), head.text + "\n" + code);
        writeFileSync(join(outDir, `${head.base}.meta.js`), head.text);
        console.log(`${head.base}.user.js  ${(code.length / 1024).toFixed(1)} KB  v${cfg.version || VERSION}  脚本 ID ${cfg.id}  站点:${sites.map(x => x.id).join(", ")}${cfg.channel ? `  渠道 ${cfg.channel}` : ""}`);
        if (!dev || variants.length === 1) console.log(`  @connect ${connectHosts(cfg, dev).join(" ") || "(无)"}(插件用 U.fetchExternal、在线主题访问别的主机时,在 userscript.json 的 connect / themeHosts 里加上)`);
    }
    return dirs;
}

/** 监视核心、通用插件和站点目录,有改动就重新构建(去抖 150 ms);出错只打印,继续监视。
 *  --hot 时:这一轮改动全在同一个插件目录里,就另外把这个插件单独打包,推给页面上的开发构建原地替换;否则推"整体更新"。 */
function watchAndRebuild() {
    const roots = [join(root, "core"), join(root, "plugins"), ...siteDirs, ...siteIds.map(id => [join(root, "sites", id), join(root, "sites", `${id}.dev`)].find(existsSync)).filter(Boolean)];
    const hot = HOT ? startHotServer() : null;
    let timer = 0, running = false, again = false, changed = new Set();
    const run = async () => {
        if (running) { again = true; return; }
        running = true;
        const files = [...changed];
        changed = new Set();
        const t0 = Date.now();
        try {
            const built = await buildAll();
            console.log(`[watch] 已重新构建(${Date.now() - t0} ms)`);
            if (hot) await pushHot(hot, files, built);
        } catch (e) { console.error(`[watch] 构建失败:${e.message}`); }
        running = false;
        if (again) { again = false; run(); }
    };
    for (const dir of [...new Set(roots)].filter(existsSync)) {
        watch(dir, { recursive: true }, (_, file) => {
            if (file && /(^|[\\/])(node_modules|dist)([\\/]|$)/.test(file)) return;
            changed.add(file ? join(dir, file) : dir);
            // 构建会写回 userscript.json 的 namespace,只在内容真的变了时才触发
            clearTimeout(timer);
            timer = setTimeout(run, 150);
        });
    }
    console.log(`[watch] 监视中:${roots.map(r => relative(process.cwd(), r) || ".").join(", ")}(Ctrl+C 退出)`);
}

// ---------- 热重载 ----------
/** 本机服务:页面上的开发构建用 GM_xmlhttpRequest 长轮询 /wait?v=<已处理的版本>,拿到之后的更新 */
function startHotServer() {
    const state = { v: 0, events: [], waiting: new Set() };
    const reply = (res, body) => {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
        res.end(JSON.stringify(body));
    };
    const since = v => ({ v: state.v, events: state.events.filter(e => e.v > v) });
    const server = createServer((req, res) => {
        const url = new URL(req.url, HOT_URL);
        if (url.pathname !== "/wait") { res.writeHead(404); res.end(); return; }
        const v = Number(url.searchParams.get("v") ?? -1);
        // 页面第一次连上(v<0)或版本落后太多:只告诉它当前版本,不重放旧的更新
        if (v < 0 || v > state.v) return reply(res, { v: state.v, events: [] });
        if (state.v > v) return reply(res, since(v));
        const w = { res, v, timer: setTimeout(() => { state.waiting.delete(w); reply(res, { v: state.v, events: [] }); }, 25000) };
        state.waiting.add(w);
        req.on("close", () => { clearTimeout(w.timer); state.waiting.delete(w); });
    });
    server.on("error", e => console.error(`[hot] 服务启动失败:${e.message}`));
    server.listen(HOT_PORT, "127.0.0.1", () => console.log(`[hot] 热重载服务:${HOT_URL}(只有开发构建会连接)`));
    state.push = ev => {
        state.v++;
        state.events.push({ ...ev, v: state.v });
        if (state.events.length > 20) state.events.shift();
        for (const w of [...state.waiting]) { clearTimeout(w.timer); state.waiting.delete(w); reply(w.res, since(w.v)); }
    };
    return state;
}

/** 改动的文件属于哪个插件目录(通用插件或某个站点的插件);不属于任何插件时返回 null */
function pluginOfFile(file, dirs) {
    const candidates = [{ base: join(root, "plugins"), site: "*" }, ...dirs.map(d => ({ base: join(d, "plugins"), site: basename(d).replace(/\.dev$/, "") }))];
    for (const c of candidates) {
        const rel = relative(c.base, file);
        if (!rel || rel.startsWith("..") || rel.includes(":")) continue;
        const dir = rel.split(/[\\/]/)[0];
        if (rel === dir) return null; // plugins 目录下的散文件,不属于某个插件
        return { site: c.site, dir: join(c.base, dir), name: dir.replace(/\.(dev|chromium)/g, "") };
    }
    return null;
}

async function pushHot(hot, files, dirs) {
    const owners = files.map(f => pluginOfFile(f, dirs));
    const one = owners[0];
    // 多个站点打进同一条脚本时,脚本 ID 取第一个站点的配置(和 buildAll 一致)
    const scriptIds = [loadConfig({ id: basename(dirs[0]).replace(/\.dev$/, ""), dir: dirs[0] }).id];
    if (!one || owners.some(o => !o || o.dir !== one.dir)) {
        hot.push({ type: "full", scripts: scriptIds, reason: files.map(f => relative(root, f)).slice(0, 3).join(", ") });
        console.log("[hot] 改动不只在一个插件里:已通知页面重新安装开发构建");
        return;
    }
    const entry = entryOf(one.dir);
    if (!entry) { hot.push({ type: "full", scripts: scriptIds, reason: `${one.name} 没有入口文件` }); return; }
    try {
        const code = await bundlePluginChunk(entry, scriptIds[0]);
        hot.push({ type: "plugin", scripts: scriptIds, name: one.name, site: one.site, dev: isDevDir(basename(one.dir)), chromium: isChromiumDir(basename(one.dir)), code });
        console.log(`[hot] 已推送插件 ${one.name}(${(code.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
        hot.push({ type: "full", scripts: scriptIds, reason: e.message });
        console.log(`[hot] ${one.name} 不能单独替换(${e.message}),已通知页面整体更新`);
    }
}

/** 单个插件打成一段代码:页面上用 new Function("U", code) 执行,返回插件定义(或 U => 定义)。
 *  插件只能引入自己目录里的文件和 node_modules;引入了核心文件时不能单独替换(核心模块在页面上已有一份)。 */
let hotShim = null;
async function bundlePluginChunk(entry, id) {
    if (!hotShim) {
        hotShim = join(mkdtempSync(join(tmpdir(), "uspp-hot-")), "jsx-shim.js");
        writeFileSync(hotShim, "export const __USPP_JSX_H__ = (...a) => U.react.h(...a);\nexport const __USPP_JSX_FRAGMENT__ = U.react.Fragment;\n");
    }
    const res = await build({
        entryPoints: [entry],
        bundle: true,
        format: "iife",
        globalName: "__usppHotChunk",
        target: ["chrome110", "firefox115"],
        charset: "utf8",
        write: false,
        metafile: true,
        legalComments: "none",
        ...JSX,
        inject: [hotShim],
        resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
        define: { __USPP_DEV__: "true" },
        plugins: [scopeNames(id, [join(root, "plugins"), ...dirsOfEntry(entry)])],
        logLevel: "silent",
    });
    const core = Object.keys(res.metafile.inputs).map(p => resolve(root, p)).filter(p => p.startsWith(join(root, "core") + sep));
    if (core.length) throw new Error(`引入了核心文件 ${relative(root, core[0])}`);
    return `${res.outputFiles[0].text}\nreturn __usppHotChunk.default;`;
}
const dirsOfEntry = entry => [resolve(dirname(entry), "..", "..")];
