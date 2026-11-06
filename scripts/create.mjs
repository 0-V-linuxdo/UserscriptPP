// 脚手架:生成站点目录或插件目录的起步文件(已有的文件不覆盖)。
//
//   node scripts/create.mjs site <id> [--dir <目录>] [--name <显示名>] [--match <网址模式>]... [--driver none|webpack|turbopack] [--global <分块全局名>] [--ts]
//       在 <目录>(缺省 sites/<id>)写 index.js、userscript.json 和一个示例插件 plugins/Hello
//   node scripts/create.mjs plugin <Name> --site <站点目录> [--ts] [--patch]
//       在 <站点目录>/plugins/<Name>/ 写 index.js(--ts 时 index.tsx);--patch 带一条打包器补丁的模板
//
// 生成后:node scripts/build.mjs --site-dir <站点目录> --hot   (边改边看;只改一个插件时页面上原地替换)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [kind, target, ...rest] = process.argv.slice(2);
const opt = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const opts = name => rest.flatMap((a, i) => (a === name ? [rest[i + 1]] : []));
const flag = name => rest.includes(name);
const fail = msg => { console.error(msg); process.exit(1); };

const written = [];
function put(file, text) {
    if (existsSync(file)) { console.log(`跳过(已存在):${relative(process.cwd(), file)}`); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    written.push(file);
}

const ID_RE = /^[a-z][a-z0-9-]*$/;
const NAME_RE = /^[A-Z][A-Za-z0-9]*$/;
const q = JSON.stringify;

function pluginSource(name, { ts, patch }) {
    const typed = ts ? `import type { UsppApi } from "userscript-pp";\n\n` : "";
    const param = ts ? "(U: UsppApi)" : "U";
    const preview = ts
        ? `        preview: { component: () => <span className="uspp-preview-chip">{settings.store.message}</span> },\n`
        : `        preview: { component: () => U.react.h("span", { className: "uspp-preview-chip" }, settings.store.message) },\n`;
    const patches = patch ? `        // 打包器补丁:find 找到模块(源码里独有的字符串),match / replace 改它的源码;$self 指向本插件对象
        patches: [
            {
                find: "某个只在目标模块里出现的字符串",
                replacement: { match: /(原来的代码)/, replace: "$self.wrap($1)" },
            },
        ],
        wrap(v${ts ? ": unknown" : ""}) { return v; },
` : "";
    return `// ${name}:插件起步模板。经 ctx 登记的监听、定时器、补丁、注入点内容等,停用时自动撤掉
${typed}export default ${param} => {
    const settings = U.definePluginSettings({
        message: { type: U.OptionType.STRING, default: "Hello from ${name}", description: "Text shown by the menu command." },
    });
    return U.definePlugin({
        name: ${q(name)},
        description: "Describe what ${name} does.",
        authors: ["you"],
        settings,
${preview}${patches}        commands: [{ id: "hello", name: "${name}: say hello", run: () => U.showToast(settings.store.message) }],
        start(ctx) {
            const log = new U.Logger(${q(name)});
            ctx.onRouteChange(() => log.debug("route changed", location.pathname));
        },
    });
};
`;
}

function siteSource(id, { name, matches, driver, global }) {
    const drv = driver === "webpack"
        ? `        // webpack 驱动:运行时启动时自动挂接,入口块里的模块也能补丁。
        // global(可选)是站点的分块全局名(在开发者工具里看 self.webpackChunk… 或 webpackJsonp),写了还会额外挂接分块数组、记录分块指纹
        driver: "webpack",
        driverOptions: { ${global ? `global: ${q(global)}` : ""} },
        // 就绪:某个模块出现(按需改成站点的特征);也可以用 { element: "选择器" }
        ready: { module: m => typeof m?.createElement === "function" && typeof m?.useState === "function", timeout: 15000 },
`
        : driver === "turbopack"
            ? `        driver: "turbopack",
        driverOptions: { chunkPath: "/_next/static/chunks/" },
        ready: { module: m => typeof m?.createElement === "function" && typeof m?.useState === "function", timeout: 15000 },
`
            : `        // 不用打包器:页面里出现这个元素即视为就绪
        ready: { element: "body", timeout: 5000 },
`;
    return `// ${name} 站点适配:只通过工厂参数 U(本脚本的框架实例)使用框架
export default U => U.defineSite({
    id: ${q(id)},
    name: ${q(name)},
    matches: ${q(matches)},
${drv}    // 注入点:插件往里放按钮、菜单项或组件;站点适配负责把它们画到页面上(见 README "写一个站点适配")
    slots: [],
    start() { },
});
`;
}

if (kind === "site") {
    if (!target || !ID_RE.test(target)) fail("用法:create.mjs site <id>(小写字母开头,含小写字母、数字和 -)");
    const dir = resolve(opt("--dir") ?? join(root, "sites", target));
    const driver = opt("--driver") ?? "none";
    if (!["none", "webpack", "turbopack"].includes(driver)) fail(`未知的驱动:${driver}`);
    const name = opt("--name") ?? target.replace(/(^|-)([a-z])/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());
    const matches = opts("--match").length ? opts("--match") : [`*://${target}.example/*`];
    put(join(dir, "index.js"), siteSource(target, { name, matches, driver, global: opt("--global") }));
    put(join(dir, "userscript.json"), JSON.stringify({ id: target, name, description: `${name} enhancements`, version: "0.1.0",
        // 在线主题允许从哪些主机取 CSS(写进 @connect);不需要在线主题可以删掉
        themeHosts: ["raw.githubusercontent.com", "gist.githubusercontent.com", "cdn.jsdelivr.net"] }, null, 4) + "\n");
    const ts = flag("--ts");
    put(join(dir, "plugins", "Hello", ts ? "index.tsx" : "index.js"), pluginSource("Hello", { ts, patch: false }));
    if (ts) put(join(dir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "preserve", strict: true, noEmit: true, skipLibCheck: true, paths: { "userscript-pp": [relative(dir, join(root, "types/index.d.ts")).replace(/\\/g, "/")] } },
        include: ["**/*.ts", "**/*.tsx"],
    }, null, 4) + "\n");
} else if (kind === "plugin") {
    if (!target || !NAME_RE.test(target)) fail("用法:create.mjs plugin <Name> --site <站点目录>(插件名大写字母开头,只含字母和数字)");
    const site = opt("--site");
    if (!site) fail("缺少 --site <站点目录>");
    const dir = resolve(existsSync(resolve(site)) ? site : join(root, "sites", site));
    if (!existsSync(join(dir, "index.js")) && !existsSync(join(dir, "index.ts"))) fail(`${dir} 不是站点目录(没有 index.js)`);
    const ts = flag("--ts");
    put(join(dir, "plugins", target, ts ? "index.tsx" : "index.js"), pluginSource(target, { ts, patch: flag("--patch") }));
} else {
    fail("用法:create.mjs site <id> … | create.mjs plugin <Name> --site <站点目录> …(详见文件开头)");
}
for (const f of written) console.log(`已写入:${relative(process.cwd(), f)}`);
