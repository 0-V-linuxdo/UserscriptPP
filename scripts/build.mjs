// 构建:node scripts/build.mjs [--dev] [--out <目录>] [--site <站点ID>]
// 全站版(默认):核心 + 全部站点适配,@match 所有网站;单站版(--site):核心 + 这一个站点,@match 收窄为该站的 matches
import { build } from "esbuild";
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : join(root, "dist"));
const onlyDev = args.includes("--dev");
const siteIdx = args.indexOf("--site");
const ONLY_SITE = siteIdx >= 0 ? args[siteIdx + 1] : null;
if (siteIdx >= 0 && !ONLY_SITE) throw new Error("--site 需要站点 ID");

const d = new Date();
const pad = n => String(n).padStart(2, "0");
const VERSION = process.env.USPP_VERSION || `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}`;
// 命名空间和名字一起决定脚本管理器里的"同一个脚本",不要改
const NAMESPACE = "https://userscript-pp.local/";
const REPO = "https://github.com/0-V-linuxdo/UserscriptPP";
// 更新地址:GitHub 原始文件(不要换成会长期缓存的 CDN);文件名里的 + 要转义
const RAW = "https://raw.githubusercontent.com/0-V-linuxdo/UserscriptPP/main/dist/";
const rawUrl = file => RAW + encodeURIComponent(file);

/** 产物名:Userscript++[.<站点>][.dev] */
const baseName = (dev, site) => ["Userscript++", site, dev && "dev"].filter(Boolean).join(".");

function header(dev, sites) {
    const base = baseName(dev, ONLY_SITE);
    const single = ONLY_SITE ? sites[0] : null;
    const matches = single ? [...new Set(single.matches)] : ["*://*/*"];
    const lines = [
        ["name", `Userscript++${single ? ` for ${single.name}` : ""}${dev ? " (dev)" : ""}`],
        ["namespace", NAMESPACE],
        ["version", VERSION],
        ["description", single
            ? `Userscript++ framework with the ${single.name} site adapter.`
            : `A userscript framework for building site adapters and plugins. Includes adapters for: ${sites.filter(x => !x.dev).map(x => x.name).join(", ") || "none"}.`],
        ["homepageURL", REPO],
        ["supportURL", `${REPO}/issues`],
        ["updateURL", rawUrl(`${base}.meta.js`)],
        ["downloadURL", rawUrl(`${base}.user.js`)],
        ...matches.map(m => ["match", m]),
        ...(single?.excludeMatches || []).map(m => ["exclude-match", m]),
        ["run-at", "document-start"],
        // 页面上下文注入;严格 CSP 的网站上由脚本管理器退回沙盒
        ["inject-into", "auto"],
        ["sandbox", "JavaScript"],
        ["noframes", ""],
        ["grant", "unsafeWindow"],
        ["grant", "GM_getValue"],
        ["grant", "GM_setValue"],
        ["grant", "GM_deleteValue"],
        ["grant", "GM_addValueChangeListener"],
        ["grant", "GM_removeValueChangeListener"],
        ["grant", "GM_registerMenuCommand"],
        ["grant", "GM_unregisterMenuCommand"],
        ["grant", "GM_setClipboard"],
        ["grant", "GM_xmlhttpRequest"],
        ["connect", "*"],
    ];
    const w = Math.max(...lines.map(([k]) => k.length)) + 2;
    return ["// ==UserScript==", ...lines.map(([k, v]) => `// @${k.padEnd(w)}${v}`.trimEnd()), "// ==/UserScript=="].join("\n") + "\n";
}

const entryOf = dir => ["index.js", "index.mjs"].map(f => join(dir, f)).find(existsSync);
const subdirs = dir => existsSync(dir) ? readdirSync(dir).sort().filter(n => statSync(join(dir, n)).isDirectory()) : [];
const isDevDir = name => /\.dev$/.test(name);
const isChromiumDir = name => /\.chromium$/.test(name.replace(/\.dev$/, ""));

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
    const stubApi = new Proxy({ defineSite: d => d }, { get: (t, k) => (k in t ? t[k] : () => ({})) });
    const def = typeof mod.default === "function" ? mod.default(stubApi) : mod.default;
    if (!def?.id || !def.name || !Array.isArray(def.matches)) throw new Error(`${entry} 不是有效的站点定义`);
    return def;
}

async function collectSites(dev) {
    const out = [];
    for (const name of subdirs(join(root, "sites"))) {
        if (isDevDir(name) && !dev) continue;
        const dir = join(root, "sites", name);
        const entry = entryOf(dir);
        if (!entry) continue;
        const meta = await readSiteMeta(entry);
        if (meta.id !== name.replace(/\.dev$/, "")) throw new Error(`站点目录 ${name} 和站点 ID ${meta.id} 不一致`);
        out.push({ id: meta.id, name: meta.name, matches: meta.matches, excludeMatches: meta.excludeMatches, entry, dev: isDevDir(name), plugins: collectPluginDir(join(dir, "plugins"), dev) });
    }
    if (ONLY_SITE) {
        const one = out.filter(x => x.id === ONLY_SITE);
        if (!one.length) throw new Error(`找不到站点 ${ONLY_SITE}(可选:${out.map(x => x.id).join(", ")})`);
        return one;
    }
    return out;
}

/** 插件名在全部站点范围内必须唯一 */
function checkDuplicates(sites, generic) {
    const seen = new Map([["Settings", "core"]]);
    const all = [...generic.map(p => ["plugins", p]), ...sites.flatMap(x => x.plugins.map(p => [`sites/${x.id}`, p]))];
    for (const [where, p] of all) {
        const key = p.dir.replace(/\.(dev|chromium)/g, "");
        if (seen.has(key)) throw new Error(`插件名重复:${key}(${seen.get(key)} 和 ${where})`);
        seen.set(key, where);
    }
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

async function one(dev) {
    const sites = await collectSites(dev);
    // 单站版不带通用插件以外的东西;通用插件两种产物都带
    const generic = collectPluginDir(join(root, "plugins"), dev);
    checkDuplicates(sites, generic);
    const res = await build({
        entryPoints: [join(root, "core/index.js")],
        bundle: true,
        format: "iife",
        target: ["chrome110", "firefox115"],
        charset: "utf8",
        write: false,
        legalComments: "none",
        minify: false,
        define: { __USPP_VERSION__: JSON.stringify(VERSION), __USPP_DEV__: String(dev), __USPP_SITES__: JSON.stringify(sites.map(x => x.id)) },
        plugins: [virtualModules(sites, generic)],
        logLevel: "warning",
    });
    const code = res.outputFiles[0].text;
    const head = header(dev, sites);
    const base = baseName(dev, ONLY_SITE);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${base}.user.js`), head + "\n" + code);
    writeFileSync(join(outDir, `${base}.meta.js`), head);
    console.log(`${base}.user.js  ${(code.length / 1024).toFixed(1)} KB  v${VERSION}  站点:${sites.map(x => x.id).join(", ") || "无"}`);
}

if (!onlyDev) await one(false);
await one(true);
