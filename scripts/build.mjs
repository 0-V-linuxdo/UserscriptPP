// 构建站点脚本。Userscript++ 只提供框架,用户安装的是开发者用它构建出的站点脚本:一条脚本 = 一份核心 + 站点适配 + 插件。
//
//   node scripts/build.mjs --site <id>[,<id>...]   用框架仓库 sites/ 下的示例站点构建
//   node scripts/build.mjs --site-dir <目录>        用任意位置的站点目录构建(可写多次;多个站点打进同一条脚本)
//   node scripts/build.mjs                          不带站点参数:只检查所有示例站点能否构建,不产出文件
//   其他参数:--out <目录>(缺省 dist/)、--dev(只出开发构建)、--prod(只出发布构建)
//
// 站点目录:index.js(U => U.defineSite(...))、plugins/<插件>/index.js、userscript.json(发布信息,见 README)。
import { build } from "esbuild";
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname, basename, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argValues = name => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const outDir = resolve(argValues("--out")[0] ?? join(root, "dist"));
const siteIds = [...argValues("--site"), ...argValues("--sites")].flatMap(v => String(v || "").split(",")).map(x => x.trim()).filter(Boolean);
const siteDirs = argValues("--site-dir").map(p => resolve(p));
const CHECK_ONLY = !siteIds.length && !siteDirs.length;
const variants = args.includes("--dev") ? [true] : args.includes("--prod") ? [false] : [false, true];

const d = new Date();
const pad = n => String(n).padStart(2, "0");
const VERSION = process.env.USPP_VERSION || `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}`;

// 框架核心必需的授权;站点可在 userscript.json 的 grants 里追加
const BASE_GRANTS = ["unsafeWindow", "GM_getValue", "GM_setValue", "GM_deleteValue", "GM_addValueChangeListener", "GM_removeValueChangeListener", "GM_registerMenuCommand", "GM_unregisterMenuCommand", "GM_setClipboard", "GM_xmlhttpRequest"];

const entryOf = dir => ["index.js", "index.mjs"].map(f => join(dir, f)).find(existsSync);
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

/** 站点定义只是一个返回对象的工厂,在 Node 里用替身接口调用一次,取 ID、名字和网址模式 */
async function readSiteMeta(entry) {
    const mod = await import(pathToFileURL(entry).href);
    const stubApi = new Proxy({ defineSite: x => x }, { get: (t, k) => (k in t ? t[k] : () => ({})) });
    const def = typeof mod.default === "function" ? mod.default(stubApi) : mod.default;
    if (!def?.id || !def.name || !Array.isArray(def.matches)) throw new Error(`${entry} 不是有效的站点定义`);
    return def;
}

async function loadSite(dir, dev) {
    const entry = entryOf(dir);
    if (!entry) throw new Error(`${dir} 里没有 index.js`);
    const meta = await readSiteMeta(entry);
    const dirId = basename(dir).replace(/\.dev$/, "");
    if (meta.id !== dirId) throw new Error(`站点目录 ${basename(dir)} 和站点 ID ${meta.id} 不一致`);
    return { id: meta.id, name: meta.name, matches: meta.matches, excludeMatches: meta.excludeMatches || [], dir, entry, plugins: collectPluginDir(join(dir, "plugins"), dev) };
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
    return { ...cfg, id };
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

function header(cfg, sites, dev) {
    const matches = cfg.match?.length ? cfg.match : [...new Set(sites.flatMap(x => x.matches))];
    const excludes = cfg.excludeMatch ?? [...new Set(sites.flatMap(x => x.excludeMatches))];
    const file = cfg.fileName || cfg.id;
    const base = `${file}${dev ? ".dev" : ""}`;
    const upd = cfg.updateBase ? cfg.updateBase.replace(/\/?$/, "/") : null;
    const lines = [
        ["name", `${cfg.name || sites.map(x => x.name).join(" + ")}${dev ? " (dev)" : ""}`],
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
        ...(cfg.connect ?? ["*"]).map(c => ["connect", c]),
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
            b.onLoad({ filter: /\.m?js$/ }, a => {
                if (!inScope(a.path)) return undefined;
                let s = readFileSync(a.path, "utf8");
                for (const [re, to] of rules) s = s.replace(re, to);
                return { contents: s, loader: "js", resolveDir: dirname(a.path) };
            });
        },
    };
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
        define: {
            __USPP_VERSION__: JSON.stringify(cfg.version || VERSION),
            __USPP_DEV__: String(dev),
            __USPP_SITES__: JSON.stringify(sites.map(x => x.id)),
            __USPP_SCRIPT__: JSON.stringify(script),
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
        console.log(`${head.base}.user.js  ${(code.length / 1024).toFixed(1)} KB  v${cfg.version || VERSION}  脚本 ID ${cfg.id}  站点:${sites.map(x => x.id).join(", ")}`);
    }
}
