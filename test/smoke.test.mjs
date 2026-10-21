// 冒烟测试:jsdom + 仿 Turbopack 运行时 + 仿 Grok 模块(独占、与其他脚本共存先/后注入);通用站点和示例站点;同页两条框架脚本
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, cpSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = (...args) => execFileSync(process.execPath, [join(root, "scripts/build.mjs"), ...args], { encoding: "utf8" });
const tmp = p => mkdtempSync(join(tmpdir(), p));
// 示例站点脚本(开发构建带 registerSite 等控制台工具)
const exOut = tmp("uspp-example-");
build("--site", "example", "--out", exOut);
const bundle = join(exOut, "example.dev.user.js");
const grokOut = tmp("uspp-grok-");
build("--site", "grok", "--out", grokOut);
const grokBundle = join(grokOut, "grok.dev.user.js");

function run(order, late, diag) {
    const env = { ...process.env, ...(late ? { LATE: "1" } : {}), ...(diag ? { DIAG: JSON.stringify(diag) } : {}) };
    const text = execFileSync(process.execPath, [join(root, "test/smoke/run.cjs"), grokBundle, order], { encoding: "utf8", maxBuffer: 64 << 20, env });
    const i = text.indexOf("{\n"), j = text.indexOf("ERRORS:");
    const data = JSON.parse(text.slice(i, j));
    const errors = text.slice(j + 7, text.indexOf("LOGS:")).trim();
    return { data, errors };
}

// late:下拉组件模块晚于兜底触发才执行,只出现在运行时缓存里
// 别人先装时缺省让给对方(见下一条测试);这里用 coexistActive 照常挂接,检查共存时的补丁和兜底路径
for (const [order, late] of [["first"], ["foreignFirst"], ["foreignAfter"], ["foreignFirst", true], ["foreignAfter", true]]) {
    test(`冒烟:${order}${late ? "(组件晚到)" : ""}${order === "foreignFirst" ? "(coexistActive)" : ""}`, () => {
        const { data, errors } = run(order, late, order === "foreignFirst" ? { coexistActive: true } : null);
        assert.equal(errors, "none");
        assert.deepEqual(data.orphaned, []);
        assert.equal(data.stats.errors, 0);
        assert.equal(data.stats.runtimeFallbacks, 0);
        assert.equal(data.stats.takenOver, false, "串联的脚本不应被当成接管");
        // 先装的脚本每个分块只处理一次:本脚本在场不让它重复挂接、重复处理
        if (order === "foreignFirst") {
            assert.ok(Object.values(data.foreignVisits).every(n => n === 1), JSON.stringify(data.foreignVisits));
            // 它挂在注册表 set 上的处理只该在模块注册时跑;本脚本补包装已注册的工厂时不能经过它
            assert.deepEqual(data.foreignRegVisits, {});
            // 先装的脚本先处理分块:它看到的是原始工厂,不是本脚本的包装
            assert.equal(data.foreignSawOurs, 0);
            // 别人的 toString 是对方的代码:模块注册之前不调用
            assert.equal(data.foreignEarlyToString, 0);
        }
        assert.ok(data.statuses.every(s => /-> (applied|bypassed)(,(applied|bypassed))*$/.test(s)), data.statuses.join("\n"));
        if (data.stats.bypassed) assert.deepEqual([...data.stats.injectionFallbacks].sort(), ["GrokChatBar", "GrokMenus", "Settings"]);
        assert.ok(data.tabs.includes("uspp_grok_plugins_tab"));
        if (!data.stats.bypassed) assert.equal(data.groupLabel, "Grok Reference (Userscript++)");
        assert.ok(String(data.avatar).includes("Grok Reference (Userscript++)"));
        assert.ok(String(data.avatar).includes("ProbeUser"));
        assert.ok(String(data.conv).includes("uspp-grok-t1"));
        assert.deepEqual(data.consoleToggle, [true, false, false]);
        assert.deepEqual(data.streamEnds, ["r1"]);
        assert.deepEqual(data.subs, { tier: "SUBSCRIPTION_TIER_SUPER_GROK_PRO", name: "SuperGrok Pro", subscribed: true, x: false, active: 1 });
        assert.equal(data.importedCss, "imported{}");
        assert.equal(data.bodyHasOwnRoot, true);
        assert.deepEqual(data.loaded, { starred: ["Thick"], thick: true });
        assert.deepEqual(data.menus, ["Grok Reference (Userscript++) settings"]);
        assert.deepEqual(data.crossTab, { pinned: ["RemotePin"], css: "local{}", notified: 1 });
        assert.deepEqual(data.backup, { exportedToken: false, token: "s3cret", color: "blue", format: "userscript-pp-settings" });
        assert.equal(data.writable, true);
        assert.deepEqual(data.globals, { legacy: false, debug: true });
        assert.equal(data.site, "grok");
        assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true"]);
        assert.equal(data.aliasSite, "grok");
        assert.deepEqual(data.aliasOn, [true, true, true, true]);
        assert.deepEqual(data.aliasOff, [false, false, false]);
        if (!data.stats.bypassed) assert.equal(data.aliasBtnRendered, true);
    });
}

// 别的脚本先装、已挂接 TURBOPACK:本脚本不再挂接(在对方的链上读一遍分块都会改变对方的行为),补丁记为 bypassed
test("冒烟:别的脚本先挂接了 TURBOPACK,本脚本让给对方", () => {
    const { data, errors } = run("foreignFirst");
    assert.equal(errors, "none");
    assert.equal(data.stats.yielded, true);
    assert.equal(data.stats.takenOver, false);
    assert.equal(data.stats.applied, 0);
    assert.ok(data.stats.bypassed > 0);
    assert.deepEqual(data.orphaned, []);
    assert.deepEqual([...data.stats.injectionFallbacks].sort(), ["GrokChatBar", "GrokMenus", "Settings"]);
    // 对方的行为与本脚本不在场时一致
    assert.ok(Object.values(data.foreignVisits).every(n => n === 1), JSON.stringify(data.foreignVisits));
    assert.deepEqual(data.foreignRegVisits, {});
    assert.equal(data.foreignSawOurs, 0);
    assert.equal(data.foreignEarlyToString, 0);
    // 框架本身照常
    assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true"]);
    assert.equal(data.menuPanel, true);
    assert.equal(data.backup.token, "s3cret");
});

// 别的脚本后装、不串联地接管 TURBOPACK(改成自己的 getter,换掉 push):本脚本发现后记 warn,补丁记为 bypassed 并通知插件,不夺回
test("冒烟:TURBOPACK 被不串联的脚本接管", () => {
    const text = execFileSync(process.execPath, [join(root, "test/smoke/run.cjs"), grokBundle, "takeover"], { encoding: "utf8", maxBuffer: 64 << 20 });
    const data = JSON.parse(text.slice(text.indexOf("{\n"), text.indexOf("ERRORS:")));
    assert.equal(text.slice(text.indexOf("ERRORS:") + 7, text.indexOf("LOGS:")).trim(), "none");
    const logs = text.slice(text.indexOf("LOGS:"));
    assert.match(logs, /TURBOPACK 被其他脚本接管且没有串联本脚本的处理/);
    assert.equal(data.stats.takenOver, true);
    assert.equal(data.stats.applied, 0);
    assert.ok(data.stats.bypassed > 0);
    assert.deepEqual(data.orphaned, []);
    assert.ok(data.statuses.length && data.statuses.every(s => /-> bypassed(,bypassed)*$/.test(s)), data.statuses.join("\n"));
    assert.deepEqual([...data.stats.injectionFallbacks].sort(), ["GrokChatBar", "GrokMenus", "Settings"]);
    assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true"]);
    // 不夺回:页面上的 TURBOPACK 仍是对方的
    assert.equal(data.stillForeign, true);
    // 框架本身照常:设置从脚本管理器菜单打开框架面板,设置读写和备份不受影响
    assert.equal(data.menuPanel, true);
    assert.deepEqual(data.loaded, { starred: ["Thick"], thick: true });
    assert.equal(data.backup.token, "s3cret");
});

test("诊断开关(开发构建):分步关掉启动环节并记录动作", () => {
    const env = { ...process.env, DIAG: JSON.stringify({ log: true, noFallback: true, coexistActive: true, disablePlugins: ["GrokChatBar"] }) };
    const text = execFileSync(process.execPath, [join(root, "test/smoke/run.cjs"), grokBundle, "foreignFirst"], { encoding: "utf8", maxBuffer: 64 << 20, env });
    const data = JSON.parse(text.slice(text.indexOf("{\n"), text.indexOf("ERRORS:")));
    const d = data.diag;
    assert.deepEqual(d.config, { log: true, noFallback: true, coexistActive: true, disablePlugins: ["GrokChatBar"] });
    for (const k of ["chunk", "factory.wrap", "factory.run", "runtime.captured", "registry.hooked", "turbopack.install", "plugin.start", "plugin.start.skipped", "site.start", "site.ready", "fallback.suppressed"]) assert.ok(d.kinds.includes(k), k);
    assert.ok(d.plugins.includes("GrokChatBar:false"));
    assert.deepEqual(d.fallbacks, []);
    assert.ok(d.runtimeCache > 0 && d.counters["turbopack.get"] > 0);
    assert.match(text, /诊断开关已打开/);
});

function runSite(file, url, id = "example") {
    const text = execFileSync(process.execPath, [join(root, "test/smoke/site.cjs"), file, url], { encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, USPP_ID: id } });
    const data = JSON.parse(text.slice(text.indexOf("{\n"), text.indexOf("ERRORS:")));
    const errors = text.slice(text.indexOf("ERRORS:") + 7, text.indexOf("LOGS:")).trim();
    const logs = text.slice(text.indexOf("LOGS:") + 5).trim();
    return { data, errors, logs };
}

// 脚本在不认识的网站上运行(@match 放宽或站点不匹配):只有核心,不碰打包器和 fetch,不往网站存储写设置
for (const url of ["https://example.com/page", "https://x.com/i/grok"]) {
    test(`冒烟:通用站点 ${url}`, () => {
        const { data, errors, logs } = runSite(bundle, url);
        assert.equal(errors, "none");
        assert.equal(logs, "", "不应有警告或错误日志");
        assert.equal(data.site, "generic");
        assert.deepEqual(data.buildSites, ["example"]);
        assert.equal(data.turbopackTouched, false);
        assert.equal(data.fetchWrapped, false);
        assert.deepEqual(data.plugins, ["Settings"]);
        assert.deepEqual(data.started, ["Settings:true"]);
        assert.deepEqual(data.menus, ["Userscript++ Example settings"]);
        assert.equal(data.quickCss, true);
        assert.equal(data.here, "p{outline:1px solid red}");
        assert.equal(data.staleCleaned, true);
        assert.equal(data.find, null);
        assert.equal(data.aliasNoop, "throws P.addChatBarButton is not a function");
        assert.equal(data.siteStorage, null);
        assert.ok(String(data.panel).includes("Plugins") && String(data.panel).includes("Quick CSS"), data.panel);
        assert.equal(data.toast, "hello");
        assert.equal(data.registered, true);
        assert.equal(data.switched, "news");
        assert.deepEqual(data.f4, { site: "news", button: true, menu: true, clicks: 2, after: { button: false, menu: false } });
        assert.equal(data.idle.count, 0, JSON.stringify(data.idle));
    });
}

test("冒烟:示例站点(开发构建)", () => {
    const { data, errors, logs } = runSite(bundle, "http://localhost:8080/uspp-example/index.html");
    assert.equal(errors, "none");
    assert.equal(logs, "");
    assert.equal(data.site, "example");
    assert.deepEqual(data.plugins, ["Settings", "ExampleHello"]);
    assert.deepEqual(data.example, { button: "Say hello", toast: "helloHello from Userscript++", menu: true });
    assert.equal(data.idle.count, 0, JSON.stringify(data.idle));
});

test("不带站点参数只做检查,不产出脚本", () => {
    const dir = tmp("uspp-check-");
    const log = execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--out", dir], { encoding: "utf8" });
    assert.match(log, /检查通过:example\.dev/);
    assert.match(log, /检查通过:grok/);
    assert.deepEqual(readdirSync(dir), []);
    assert.ok(!existsSync(join(root, "dist")), "不应写出 dist/");
});

/** 把示例站点复制到框架仓库以外,配上自己的 userscript.json,模拟开发者自己的仓库 */
function externalSite(cfg) {
    const repo = tmp("uspp-dev-repo-");
    const dir = join(repo, "sites", "example");
    cpSync(join(root, "sites/example.dev"), dir, { recursive: true });
    if (cfg) writeFileSync(join(dir, "userscript.json"), JSON.stringify(cfg));
    else writeFileSync(join(dir, "userscript.json"), "{}");
    const out = join(repo, "dist");
    build("--site-dir", dir, "--out", out);
    return { dir, out };
}

test("站点脚本的发布信息全部来自开发者配置", () => {
    const { out } = externalSite({ id: "my-news", name: "My News", namespace: "https://me.example/scripts", author: "Me", updateBase: "https://cdn.example/dl/", match: ["*://news.example/*"], version: "1.2.3" });
    assert.deepEqual(readdirSync(out).sort(), ["my-news.dev.meta.js", "my-news.dev.user.js", "my-news.meta.js", "my-news.user.js"]);
    const head = readFileSync(join(out, "my-news.meta.js"), "utf8");
    assert.match(head, /@name\s+My News\n/);
    assert.match(head, /@namespace\s+https:\/\/me\.example\/scripts\n/);
    assert.match(head, /@version\s+1\.2\.3\n/);
    assert.match(head, /@updateURL\s+https:\/\/cdn\.example\/dl\/my-news\.meta\.js\n/);
    assert.match(head, /@downloadURL\s+https:\/\/cdn\.example\/dl\/my-news\.user\.js\n/);
    assert.deepEqual([...head.matchAll(/@match\s+(\S+)/g)].map(m => m[1]), ["*://news.example/*"]);
    assert.doesNotMatch(head, /UserscriptPP|github/i);
    // 发布构建不挂控制台全局名,也没有 registerSite
    const { data } = runSite(join(out, "my-news.user.js"), "https://example.com/", "my-news");
    assert.deepEqual(data.globals, { legacy: false, debug: false });
    assert.equal(data.registered, false);
});

test("没配更新地址和名字空间:不写更新行,按脚本 ID 生成名字空间并写回", () => {
    const { dir, out } = externalSite(null);
    const head = readFileSync(join(out, "example.meta.js"), "utf8");
    assert.doesNotMatch(head, /@(updateURL|downloadURL)/);
    const ns = head.match(/@namespace\s+(\S+)/)[1];
    assert.match(ns, /^userscript-pp:example:[0-9a-f]{12}$/);
    assert.equal(JSON.parse(readFileSync(join(dir, "userscript.json"), "utf8")).namespace, ns);
    // 再构建一次沿用同一个名字空间
    build("--site-dir", dir, "--out", out);
    assert.equal(readFileSync(join(out, "example.meta.js"), "utf8").match(/@namespace\s+(\S+)/)[1], ns);
});

test("同一页面两条基于框架的站点脚本互不影响", () => {
    const a = externalSite({ id: "alpha", name: "Script alpha", namespace: "test:alpha" });
    const b = externalSite({ id: "beta", name: "Script beta", namespace: "test:beta" });
    const text = execFileSync(process.execPath, [join(root, "test/smoke/multi.cjs"), join(a.out, "alpha.dev.user.js"), "alpha", join(b.out, "beta.dev.user.js"), "beta"], { encoding: "utf8", maxBuffer: 64 << 20 });
    const data = JSON.parse(text.slice(text.indexOf("{\n"), text.indexOf("ERRORS:")));
    assert.equal(text.slice(text.indexOf("ERRORS:") + 7, text.indexOf("LOGS:")).trim(), "none");
    assert.equal(text.slice(text.indexOf("LOGS:") + 5, text.indexOf("INFO:")).trim(), "", "不应有警告或错误");
    // 两条都启动;没有共用的全局名;同一条脚本重复注入只运行一次
    assert.deepEqual(data.started, ["alpha", "beta", true]);
    assert.deepEqual(data.globals, { legacy: false, a: true, b: true });
    assert.match(text, /\[Script alpha\] 本脚本已在运行,跳过重复注入/);
    assert.deepEqual(data.toolbar, ["data-uspp-alpha-toolbar-item", "data-uspp-beta-toolbar-item"]);
    // fetch / history 只串联:两条脚本、中间别的脚本、页面自己的实现都被调用,注入后不再改动 fetch
    assert.deepEqual(data.fetch, { hits: ["A:/api/x", "B:/api/x"], foreign: ["/api/x"], page: ["/api/x"], untouched: true });
    assert.deepEqual(data.route, { routes: ["A:/uspp-example/next", "B:/uspp-example/next"], foreign: true, pageKept: true });
    // 设置、存储键、样式、菜单、界面根元素各自独立
    assert.deepEqual(data.settings, { aStarred: ["onlyA"], bStarred: [], bQuickCss: "", gmA: ["UserscriptPPSettings"], gmB: ["UserscriptPPSettings"], ls: ["UserscriptPP:alpha:settings", "UserscriptPP:beta:settings"] });
    assert.equal(data.styles.bHasA, false);
    assert.deepEqual(data.menus, { a: ["Script alpha settings", "Example: say hello"], b: ["Script beta settings", "Example: say hello"] });
    assert.ok(data.ui.roots.every(t => /^uspp-(alpha|beta)-/.test(t)), data.ui.roots.join(","));
    assert.deepEqual([data.ui.aToast, data.ui.bToast, data.ui.aPanel, data.ui.bPanel], ["fromA", "fromB", true, false]);
    assert.deepEqual(data.stopA, { a: false, b: true });
    assert.deepEqual(data.idle, [0, 0]);
});

test("单站版 --site grok(示例源码按需构建)", () => {
    const head = readFileSync(join(grokOut, "grok.meta.js"), "utf8");
    assert.deepEqual([...head.matchAll(/@match\s+(\S+)/g)].map(m => m[1]), ["*://grok.com/*"]);
    assert.doesNotMatch(head, /@(updateURL|downloadURL)/);
    const other = runSite(join(grokOut, "grok.user.js"), "https://example.com/", "grok");
    assert.equal(other.data.site, "generic");
});

test("站点适配只用公开接口(不引用核心模块)", () => {
    const bad = [];
    const walk = d => {
        for (const n of readdirSync(d)) {
            const p = join(d, n);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.m?js$/.test(n)) for (const m of readFileSync(p, "utf8").matchAll(/(?:import|from)\s*\(?\s*["']([^"']+)["']/g)) {
                const target = join(dirname(p), m[1]);
                if (!m[1].startsWith(".") || !target.startsWith(join(root, "sites"))) bad.push(`${p}: ${m[1]}`);
            }
        }
    };
    walk(join(root, "sites"));
    assert.deepEqual(bad, []);
});

test("核心里没有站点知识", () => {
    const hits = [];
    const walk = d => {
        for (const n of readdirSync(d)) {
            const p = join(d, n);
            if (statSync(p).isDirectory()) walk(p);
            else if (/grok/i.test(readFileSync(p, "utf8"))) hits.push(p);
        }
    };
    walk(join(root, "core"));
    assert.deepEqual(hits, []);
});

test("产物里的 void 只作为运算符出现", () => {
    for (const f of [...readdirSync(exOut).map(n => join(exOut, n)), ...readdirSync(grokOut).map(n => join(grokOut, n))]) {
        const t = readFileSync(f, "utf8");
        assert.deepEqual([...t.matchAll(/void(?! 0\b)/gi)].map(m => t.slice(m.index - 20, m.index + 20)), [], f);
    }
});
