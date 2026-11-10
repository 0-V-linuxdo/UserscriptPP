// 冒烟测试:jsdom + 仿 Turbopack 运行时 + 仿 Grok 模块(独占、与其他脚本共存先/后注入);通用站点和示例站点;同页两条框架脚本
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import { mkdtempSync, readFileSync, readdirSync, statSync, cpSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// 测试脚本要从页面里拿完整接口:只在测试里打开(构建出的页面桥上多一个 api);正常构建页面上只有页面桥,见"页面桥"那条测试
process.env.USPP_TEST_EXPOSE = "1";
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
        // 菜单补丁去掉了原生的 del 项,插件追加的项还在
        assert.ok(/data-extras="uspp-grok-t1"/.test(data.convPatched), data.convPatched);
        assert.ok(/data-extras="del,uspp-grok-t1"/.test(data.conv), data.conv);
        // 发送前拦截器:没有拦截器时原样发出;有时改写正文、取消时请求被拦下
        assert.deepEqual(data.beforeSend, { r0: "sent", r1: "sent", r2: "blocked:TypeError", bodies: ["  plain  ", "HELLO"] });
        assert.equal(data.accessory, "acc r9");
        assert.equal(data.accessoryAfter, "removed");
        assert.deepEqual(data.subs, { tier: "SUBSCRIPTION_TIER_SUPER_GROK_PRO", name: "SuperGrok Pro", subscribed: true, x: false, active: 1 });
        assert.equal(data.importedCss, "imported{}");
        assert.equal(data.bodyHasOwnRoot, true);
        assert.equal(data.uiInShadow, true, "框架界面应放在 Shadow DOM 里");
        assert.deepEqual(data.loaded, { starred: ["Thick"], thick: true });
        assert.deepEqual(data.menus, ["Grok Reference (Userscript++) settings", "Grok Reference (Userscript++): search…", "Grok Reference (Userscript++): reload in safe mode"]);
        assert.deepEqual(data.crossTab, { pinned: ["RemotePin"], css: "local{}", notified: 1 });
        assert.deepEqual(data.crossTabDelete, { deleted: true, notified: ["deleted"], keptDirty: 1, pluginKept: true });
        assert.deepEqual(data.toggleBack, { before: "on", synced: "off", after: "on" }, "别的标签页改过之后,本页改回原值也要写进存储");
        assert.deepEqual(data.defaults, { first: { mode: "dark", list: ["a", "b"] }, second: { mode: "auto", list: ["a", "b"] }, reset: { list: ["a", "b"] }, readMode: "auto", definitionUntouched: true, remoteList: ["a"], notified: ['plugins.DefaultProbe.list=["a"]'] }, "默认值不落盘:明确设成默认值的照存,重置后不存,缺的项按默认值处理,定义里的默认值不被改");
        assert.deepEqual(data.rev, { increments: true, staleIgnored: true, entryGone: true, notified: ["plugins.RevProbe.color=undefined", "plugins.RevProbe.size=undefined"], next: 2, notWrittenBack: true }, "版本号:过时的一份不用,更新的一份能删掉整条插件设置,下次保存接着加一");
        assert.deepEqual(data.backup, { exportedToken: false, token: "s3cret", color: "blue", format: "userscript-pp-settings" });
        assert.equal(data.writable, true);
        assert.deepEqual(data.bridge, { keys: ["plugins", "scriptId", "site", "version"], noApi: [], selfMethod: "function", selfStable: true, selfHidden: ["undefined", "undefined", "undefined"], hostSelf: "function", frozen: true });
        assert.deepEqual(data.globals, { legacy: false, debug: true });
        assert.equal(data.site, "grok");
        assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true", "GrokMessages:true"]);
        assert.equal(data.aliasSite, "grok");
        assert.deepEqual(data.aliasOn, [true, true, true, true]);
        assert.deepEqual(data.aliasOff, [false, false, false]);
        if (!data.stats.bypassed) assert.equal(data.aliasBtnRendered, true);
        if (order === "first" && !late) {
            // 页面里的补丁检查器:注册表里的模块 + 爬到的懒分块,全部补丁通过;查找器登记
            assert.equal(data.check.summary.failed, 0, data.check.statuses.join("\n"));
            assert.equal(data.check.summary.total, 9);
            assert.deepEqual(data.check.crawl, { chunks: 1, failed: 0 });
            assert.deepEqual(data.check.fetched, ["https://grok.com/_next/static/chunks/lazy-x.js"]);
            assert.ok(data.check.finders.includes('findByProps("NoSuchExport")'));
            assert.ok(!data.check.finders.includes('findByProps("AvatarDropdownMenu")'));
            assert.equal(data.check.timings, 9);
            // CSS 类名、批量查找、导出注入、懒加载分块
            assert.deepEqual(data.css, { button: "Btn-module__k3__button", icon: "Btn-module__k3__icon" });
            assert.deepEqual(data.bulk, ["AvatarDropdownMenu", "NAV_GROUPS", null]);
            assert.deepEqual(data.inject, { now: "function", keep: "function" });
            assert.equal(data.lazyBefore, null);
            assert.equal(data.lazyLoaded, true);
            assert.equal(data.lazyAfter, "lazy!");
            assert.equal(data.lazyInjected, "LAZY!");
            assert.equal(data.lazyLoads, 1);
            assert.equal(data.imported, "lazy!");
            assert.equal(data.injectUndone, false);
            // 懒查找器增量扫描:新模块进来能找到;已扫过的模块被注入导出后也能找到
            assert.deepEqual(data.lazyInc, { before: null, after: "lazy!", injBefore: null, injAfter: 7 });
            // 分组命名空间和平铺名字是同一个实现
            assert.deepEqual(data.ns, { same: true, dom: true, net: true, lazyKeys: 9, lazySame: true, frozen: true, settings: true });
            assert.deepEqual(data.kit, { text: true, barBefore: false, barAfter: true, checked: true, hl: ["color", "comment", "property", "punct", "selector"], color: "#ff0000", textarea: 2 });
            assert.equal(data.multiline, true);
            // 类型声明覆盖接口上的每个名字(站点别名除外)
            const dts = readFileSync(join(root, "types/index.d.ts"), "utf8");
            const aliases = ["common", "addChatBarButton", "removeChatBarButton", "addContextMenuItem", "removeContextMenuItem"];
            const missing = data.apiKeys.filter(k => !aliases.includes(k) && !new RegExp(`\\n    (readonly )?${k.replace(/\$/g, "\\$")}\\??[(<:]`).test(dts));
            assert.deepEqual(missing, [], "types/index.d.ts 缺少这些接口");
        }
    });
}

// ---------- 命令行补丁检查器 ----------
const checker = (...args) => {
    try { return { code: 0, out: execFileSync(process.execPath, [join(root, "scripts/check-patches.mjs"), ...args], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } }) }; } catch (e) { return { code: e.status, out: String(e.stdout) }; }
};
/** 把仿 Grok 模块写成两个分块文件:a.js 里的模块引用懒分块 lazy-x.js */
function writeChunks(mutate = s => s) {
    const require = createRequire(import.meta.url);
    const { lazy, ...M } = require("./smoke/grok-modules.cjs");
    const dir = tmp("uspp-chunks-");
    const push = (name, mods) => `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["static/chunks/${name}",${Object.entries(mods).map(([id, src]) => `${id},${mutate(src)}`).join(",")}]);`;
    writeFileSync(join(dir, "a.js"), push("a.js", M));
    writeFileSync(join(dir, "lazy-x.js"), push("lazy-x.js", lazy));
    return dir;
}

test("补丁检查器:静态检查", () => {
    const r = checker("--site", "grok");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /静态检查:9 条补丁,通过 9,失败 0/);
    // 一条有问题的补丁:反向引用越界、字符串 match 用 $1、贪婪通配、字符串里的 \i
    const repo = tmp("uspp-lint-");
    const dir = join(repo, "sites", "bad");
    cpSync(join(root, "sites/example.dev"), dir, { recursive: true });
    writeFileSync(join(dir, "index.js"), readFileSync(join(dir, "index.js"), "utf8").replace(/id: "example"/, 'id: "bad"'));
    writeFileSync(join(dir, "plugins/ExampleHello/index.js"), `export default U => U.definePlugin({ name: "Bad", description: "", authors: [], patches: [
        { find: "abc", replacement: { match: /(x)y/, replace: "$2" } },
        { find: "longenough", replacement: [{ match: "a.b", replace: "$1" }, { match: /foo.*bar/, replace: "z" }, { match: "\\\\i=1", replace: "" }] },
    ] });`);
    const bad = checker("--site-dir", dir);
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, /find "abc" 太短/);
    assert.match(bad.out, /replace 引用了 \$2,但 match 只有 1 个捕获组/);
    assert.match(bad.out, /match 是字符串,没有捕获组/);
    assert.match(bad.out, /贪婪的 \.\* \/ \.\+/);
    assert.match(bad.out, /字符串 match 里的 \\i 不会展开/);
});

test("补丁检查器:本地分块和线上地址(含懒加载分块)", async () => {
    const dir = writeChunks();
    const ok = checker("--site", "grok", "--chunks", dir);
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /线上检查\(20 个模块\):9 条补丁,通过 9,失败 0/);
    // 站点改版:聊天栏的 find 不再命中、头像菜单的 match 失配
    const broken = writeChunks(s => s.replace('"data-query-bar-mode-select":!0', '"data-qb-mode":!0').replace("DropdownMenuSubTrigger,{ref:", "DropdownMenuSubTrigger,{forwardedRef:"));
    const bad = checker("--site", "grok", "--chunks", broken, "--json");
    assert.equal(bad.code, 1);
    const rep = JSON.parse(bad.out);
    const st = Object.fromEntries(rep.results.map(r => [`${r.plugin}#${r.index}`, r.status]));
    assert.equal(st["GrokChatBar#0"], "notFound");
    assert.ok(["partial", "groupReverted"].includes(st["Settings(settingsHost)#2"]), JSON.stringify(st));
    // --url:拉页面、按 <script src> 取分块,再从模块源码里找到懒分块
    const server = http.createServer((q, res) => {
        if (q.url === "/") return res.end('<html><script src="/_next/static/chunks/a.js"></script></html>');
        // 页面改版后没有分块脚本 / 分块全部取不到
        if (q.url === "/empty/") return res.end("<html><p>maintenance</p></html>");
        if (q.url === "/gone/") return res.end('<html><script src="/_next/static/chunks/missing.js"></script></html>');
        const m = /^\/_next\/static\/chunks\/(.+)$/.exec(q.url);
        if (m && existsSync(join(dir, m[1]))) return res.end(readFileSync(join(dir, m[1])));
        res.statusCode = 404; res.end();
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    try {
        const url = `http://127.0.0.1:${server.address().port}/`;
        const out = await new Promise(resolve => execFile(process.execPath, [join(root, "scripts/check-patches.mjs"), "--site", "grok", "--url", url, "--json"], { encoding: "utf8", env: { ...process.env, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1", GITHUB_ACTIONS: "" } }, (e, stdout) => resolve({ code: e?.code ?? 0, stdout })));
        assert.equal(out.code, 0, out.stdout);
        const live = JSON.parse(out.stdout);
        assert.equal(live.crawl.chunks, 2);
        assert.equal(live.summary.modules, 20);
        assert.equal(live.summary.failed, 0);
        // 要求了线上检查却一个模块都没取到:不能悄悄退回静态检查后报通过
        const check = (path, ...extra) => new Promise(resolve => execFile(process.execPath, [join(root, "scripts/check-patches.mjs"), "--site", "grok", "--url", url + path, ...extra], { encoding: "utf8", env: { ...process.env, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1", GITHUB_ACTIONS: "" } }, (e, stdout, stderr) => resolve({ code: e?.code ?? 0, out: stdout + stderr })));
        for (const path of ["empty/", "gone/"]) {
            const r = await check(path);
            assert.equal(r.code, 1, `${path}: ${r.out}`);
            assert.match(r.out, /线上检查不完整:只取到 0 个模块/);
        }
        assert.match((await check("gone/")).out, /取不到的分块:.*missing\.js/);
        // 显式允许离线时才退回静态检查
        const offline = await check("empty/", "--allow-offline");
        assert.equal(offline.code, 0, offline.out);
        assert.match(offline.out, /按 --allow-offline 退回静态检查/);
        // 要求的模块数比取到的多:也算失败
        assert.equal((await check("", "--min-modules", "100")).code, 1);
    } finally { server.close(); }
});

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
    assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true", "GrokMessages:true"]);
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
    assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true", "GrokMessages:true"]);
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

function runSite(file, url, id = "example", env = {}) {
    const text = execFileSync(process.execPath, [join(root, "test/smoke/site.cjs"), file, url], { encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, USPP_ID: id, ...env } });
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
        assert.deepEqual(data.menus, ["Userscript++ Example settings", "Userscript++ Example: search…", "Userscript++ Example: reload in safe mode"]);
        assert.equal(data.quickCss, true);
        assert.equal(data.here, "p{outline:1px solid red}");
        assert.deepEqual(data.staleCleaned, { kept: true, keptSince: "number", expired: true, recordGone: true });
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

function runFeatures(env = {}) {
    const text = execFileSync(process.execPath, [join(root, "test/smoke/features.cjs"), bundle], { encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, ...env } });
    const j = text.indexOf("\nERRORS:");
    return { data: JSON.parse(text.slice(0, j)), errors: text.slice(j + 8, text.indexOf("\nLOGS:")).trim(), logs: text.slice(text.indexOf("LOGS:\n") + 6).trim() };
}

test("插件作用域、方法补丁器、网络改写、设置校验、插件数据", () => {
    const { data, errors, logs } = runFeatures();
    assert.equal(errors, "none");
    assert.equal(logs, "");
    // 停用后经 ctx 登记的观察、定时器、事件监听、订阅,以及 start 期间直接调用的 U.observe 都不再触发
    assert.deepEqual(data.scope.after, { ...data.scope.frozen });
    assert.ok(data.scope.before.observe >= 1 && data.scope.before.interval >= 1 && data.scope.before.listen === 1 && data.scope.before.direct >= 1, JSON.stringify(data.scope.before));
    assert.equal(data.scope.after.timeout, 0);
    // 提前撤销的和到点执行过的从清理列表里删掉:50 个还没到点的定时器还在,撤销过的监听不在
    assert.deepEqual(data.scopeShrink, { afterManual: 50, afterTimers: 0, kept: 2, late: 1 });
    assert.equal(data.scope.after.registered, 1);
    assert.equal(data.scope.after.aborted, true);
    assert.deepEqual(data.patcher, { r1: "[hi BOB]!", r2: "3p:[hi AMY]!", r3: "3p:hi joe", keptTheirs: true, restored: true, p1: 2, nameKept: true, str: true, safe: "ok", h1: "patched", h2: "h", origUntouched: true });
    const n = data.network;
    assert.equal(n.j1, "https://api.test/changed");
    assert.equal(n.j2, JSON.stringify({ a: 1, added: 1 }));
    assert.equal(n.blocked, true);
    assert.deepEqual(n.j4, { fake: true });
    assert.equal(n.j5.extra, "yes");
    assert.equal(n.direct, true);
    assert.equal(n.after, "https://api.test/rw-url", "撤销后不再改写");
    assert.equal(n.readSeen, 3, "只读订阅看到改写后的最终响应");
    assert.equal(n.x1, "/xhr-moved");
    assert.equal(n.x2, "b+more");
    assert.deepEqual(n.x3, { error: true });
    assert.equal(n.x4.patched, true);
    assert.deepEqual(n.ws, { log: ["open wss://chat/x"], sent: ["keep", "edited"], got: ["plain", "swapped"], instance: true });
    assert.deepEqual(data.checks, { langDisabled1: true, langDisabled2: false, err: true, stored1: 5, stored2: 42, errGone: true, about: true });
    assert.deepEqual(data.data.v, [1, 2, 3]);
    assert.equal(data.data.missing, "fallback");
    assert.deepEqual(data.data.keys, ["history"]);
    assert.deepEqual(data.data.gkeys, ["shared"]);
    assert.equal(data.data.settingsHasIt, false, "插件数据不进设置");
    assert.deepEqual(data.data.back, [1, 2, 3]);
    assert.equal(data.data.gmKey, true);
});

test("渲染型注入点、菜单补丁、拦截器、命令和快捷键、搜索栏、设置页登记、通知、失败汇总、诊断", () => {
    const { data } = runFeatures();
    assert.deepEqual(data.slots, {
        t1: "hello a", t2: "hello b", brokenEmpty: true, barClicked: true, menu: ["rename", "mine"], menuItemsVisible: 0,
        i1: { value: { text: "hi" }, cancelled: false, by: null }, i2: { cancelled: true, by: "Guard" }, i3: { value: 1, cancelled: false, by: null }, i4: { value: { text: "  x  " }, cancelled: false, by: null },
    });
    assert.deepEqual(data.commands, { r1: 1, r2: 2, r3: 3, first: "cmd:CmdProbe.go", r4: 4, firstSetting: "setting:Settings.debugLogs", kb: true, afterStop: 4, ids: ["uspp.palette", "uspp.settings", "uspp.safeReload", "uspp.changelog", "uspp.diagnostics"] });
    const m = data.misc;
    assert.deepEqual(m.nav1, ["Plugins", "Themes", "Quick CSS", "Keybinds", "Notifications", "Updates", "Backup", "Rules"]);
    assert.equal(m.shown, true);
    assert.deepEqual(m.nav2, ["Plugins", "Themes", "Quick CSS", "Keybinds", "Notifications", "Updates", "Backup"]);
    assert.equal(m.cardText, "SavedAll good");
    assert.equal(m.clicked, 1);
    assert.deepEqual(m.history, ["Saved"]);
    assert.deepEqual(m.sysNotes, ["Saved"]);
    assert.equal(m.failed, true);
    assert.equal(m.startError, "kaboom");
    assert.deepEqual(m.diag, { name: true, failed: true, noValues: true });
    assert.deepEqual(m.boot.failed, ["Breaker"]);
    // 备份导入:不合法的值改用缺省值并列出,本次构建里没有的插件原样保留;导入前的设置可撤销,撤销一次后没有可撤销的了
    assert.deepEqual(data.importCheck, {
        invalid: ["ImportProbe.enabled", "ImportProbe.greeting"],
        afterImport: { greeting: null, mode: "b", enabledType: "undefined", debugLogs: true, starred: ["Imported"], gone: true },
        hasUndo: true, undone: false, restored: { greeting: "mine", debugLogs: false }, again: null, undoStored: false,
    });
    // 运行期错误:ctx 的监听、定时器(含 async)、async start() 和 ctx.reportError 都记到插件名下;出错太多本页停掉并提示
    assert.deepEqual(data.runtimeErrors, {
        before: { count: 3, tripped: false },
        // 第 10 次出错时停掉,监听随之撤掉,之后的事件不再计数
        after: { count: 10, tripped: true, where: "listen:flaky-ev" },
        started: false, startError: null, notice: true, badge: "Turned off after 10 errors", diag: true,
    });
    // 开关与实际运行:熔断后点开关是重新启动;依赖跟着推导、不写进设置;别处改开关本页跟着启停;依赖被熔断时依赖方也停;启动失败调用 stop
    assert.deepEqual(data.lifecycle, {
        tripped: { phase: "tripped", restarted: true, intent: true },
        dep: { a: true, b: true, bStored: null, locked: true, aAfter: false, bAfter: false, bStops: 1, syncedOn: true, syncedOff: true, trippedDep: { a: false, b: false, phaseA: "blocked" } },
        half: { stops: 1, phase: "failed" },
    });
});

for (const mode of ["safe", "crash"]) {
    test(`安全模式(${mode === "safe" ? "手动" : "连续启动没完成"})`, () => {
        const { data, errors } = runFeatures({ MODE: mode, URL: "http://localhost:8080/uspp-example/index.html" });
        assert.equal(errors, "none");
        assert.equal(data.safe, true);
        assert.ok(data.started.includes("Settings:true"));
        assert.ok(data.started.includes("ExampleHello:false"), JSON.stringify(data.started));
        assert.ok(String(data.notice).includes("safe mode"), data.notice);
        if (mode === "crash") assert.ok(data.notice.includes("last starting: Breaker"), data.notice);
        assert.equal(data.quickCssApplied, false);
        assert.equal(data.boot.pending, 0);
    });
}

test("安全模式:站点就绪后 10 秒内关页面不算没完成的启动", () => {
    const { data, errors } = runFeatures({ MODE: "pagehide", URL: "http://localhost:8080/uspp-example/index.html" });
    assert.equal(errors, "none");
    assert.equal(data.safe, false);
    assert.equal(data.pendingEarly, 2);
    assert.equal(data.pendingBefore, 2);
    assert.equal(data.boot.pending, 0);
});

test("设置副本合并:GM 是唯一权威,站点副本只在 GM 为空时救回;删掉的设置不会被旧副本带回来", () => {
    const url = "http://localhost:8080/uspp-example/index.html";
    const merge = c => {
        const { data, errors } = runSite(bundle, url, "example", { MERGE_CASE: JSON.stringify(c) });
        assert.equal(errors, "none");
        return data;
    };
    const full = { plugins: { Settings: { starredPlugins: ["A", "B", "C"], mergeProbe: "old" } } };
    const trimmed = { plugins: { Settings: { starredPlugins: ["A"] } } };
    // GM 是新存的(删了两项和 mergeProbe),站点存储是旧的、内容更多:以 GM 为准,删掉的不回来
    assert.deepEqual(merge({ gm: { ...trimmed, $savedAt: 2000 }, ls: { ...full, $savedAt: 1000 } }), { starred: ["A"], extra: null, savedAtLeaked: false });
    // 反过来站点存储较新:GM 是唯一权威,仍以 GM 为准(站点存储只是 GM 为空时救回用的备份)
    assert.deepEqual(merge({ gm: { ...full, $savedAt: 1000 }, ls: { ...trimmed, $savedAt: 2000 } }), { starred: ["A", "B", "C"], extra: "old", savedAtLeaked: false });
    // 版本号更大的站点副本也不盖过 GM
    assert.deepEqual(merge({ gm: { ...full, $rev: 3 }, ls: { ...trimmed, $rev: 9 } }), { starred: ["A", "B", "C"], extra: "old", savedAtLeaked: false });
    // GM 为空:从站点副本救回
    assert.deepEqual(merge({ ls: { ...trimmed, $rev: 9 } }), { starred: ["A"], extra: null, savedAtLeaked: false });
    // 旧版本存的副本没有时间戳:有时间戳的优先
    assert.deepEqual(merge({ gm: trimmed, ls: { ...full, $savedAt: 1 } }), { starred: ["A", "B", "C"], extra: "old", savedAtLeaked: false });
    assert.deepEqual(merge({ gm: full, ls: { ...trimmed, $savedAt: 1 } }), { starred: ["A"], extra: null, savedAtLeaked: false });
    // 都没有时间戳(升级前):沿用旧办法,最丰富的为主、其余补缺
    assert.deepEqual(merge({ gm: trimmed, ls: full }), { starred: ["A", "B", "C"], extra: "old", savedAtLeaked: false });
});

test("冒烟:示例站点(开发构建)", () => {
    const { data, errors, logs } = runSite(bundle, "http://localhost:8080/uspp-example/index.html");
    assert.equal(errors, "none");
    assert.equal(logs, "");
    assert.equal(data.site, "example");
    assert.deepEqual(data.plugins, ["Settings", "ExampleHello", "ExampleTsx"]);
    assert.deepEqual(data.example, { button: "Say hello", toast: "helloHello from Userscript++", menu: true });
    assert.equal(data.startTimed, true, "已启动的插件都应记下启动耗时");
    assert.equal(data.idle.count, 0, JSON.stringify(data.idle));
});

test("热重载:只改一个插件时原地替换,改了站点文件时提示整体更新", async () => {
    const repo = tmp("uspp-hot-");
    const dir = join(repo, "example");
    cpSync(join(root, "sites/example.dev"), dir, { recursive: true });
    const out = tmp("uspp-hot-out-");
    const port = 20000 + Math.floor(Math.random() * 20000);
    const { spawn } = await import("node:child_process");
    const builder = spawn(process.execPath, [join(root, "scripts/build.mjs"), "--hot", "--hot-port", String(port), "--site-dir", dir, "--out", out], { stdio: ["ignore", "pipe", "pipe"] });
    let blog = "";
    const waitLog = (re, ms = 15000) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`等不到 ${re}:\n${blog}`)), ms);
        const check = () => { if (re.test(blog)) { clearTimeout(t); resolve(); } };
        builder.stdout.on("data", c => { blog += c; check(); });
        builder.stderr.on("data", c => { blog += c; });
        check();
    });
    try {
        await waitLog(/\[hot\] 热重载服务/);
        await waitLog(/\[watch\] 监视中/);
        const page = spawn(process.execPath, [join(root, "test/smoke/hot.cjs"), join(out, "example.dev.user.js")], { stdio: ["ignore", "pipe", "pipe"] });
        let plog = "";
        const waitPage = re => new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`页面等不到 ${re}:\n${plog}\n--- build:\n${blog}`)), 20000);
            const check = () => { if (re.test(plog)) { clearTimeout(t); resolve(); } };
            page.stdout.on("data", c => { plog += c; check(); });
            page.stderr.on("data", c => { plog += c; });
            check();
        });
        await waitPage(/READY/);
        const f = join(dir, "plugins/ExampleTsx/index.tsx");
        writeFileSync(f, readFileSync(f, "utf8").replaceAll('label="Clicks"', 'label="Taps"'));
        await waitPage(/REPLACED/);
        await new Promise(r => setTimeout(r, 300));
        const site = join(dir, "index.js");
        writeFileSync(site, readFileSync(site, "utf8") + "\n// touched\n");
        await waitPage(/\n\{.*\}\n?$/s);
        const data = JSON.parse(plog.slice(plog.lastIndexOf("\n{") + 1));
        assert.equal(data.before, "Clicks: 0");
        assert.equal(data.clicked, "Clicks: 1");
        assert.equal(data.replaced, true, plog);
        assert.equal(data.after, "Taps: 0");
        assert.equal(data.hosts, 1, "旧插件经 ctx 登记的清理应该已经执行");
        assert.equal(data.started, true);
        assert.equal(data.toast, true);
        assert.equal(data.full, true);
        assert.deepEqual(data.errors, []);
        assert.deepEqual(data.logs, []);
        assert.match(blog, /\[hot\] 已推送插件 ExampleTsx/);
    } finally {
        builder.kill();
    }
});

test("脚手架 + webpack 驱动:生成站点和插件,补丁在仿 webpack 5 运行时上生效,别的脚本先挂接时让给对方", async () => {
    const repo = tmp("uspp-wp-");
    const dir = join(repo, "wpsim");
    const create = (...a) => execFileSync(process.execPath, [join(root, "scripts/create.mjs"), ...a], { encoding: "utf8" });
    create("site", "wpsim", "--dir", dir, "--driver", "webpack", "--global", "webpackChunksim", "--match", "*://sim.example/*", "--ts");
    create("plugin", "Greeter", "--site", dir, "--patch");
    for (const f of ["index.js", "userscript.json", "tsconfig.json", "plugins/Hello/index.tsx", "plugins/Greeter/index.js"]) assert.ok(existsSync(join(dir, f)), f);
    // 已有文件不覆盖
    assert.match(create("plugin", "Greeter", "--site", dir), /跳过/);
    // 模板本身能构建(含 --patch 的模板补丁和 TSX)
    const tplOut = tmp("uspp-wp-tpl-");
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", tplOut, "--dev"], { encoding: "utf8" });
    writeFileSync(join(dir, "plugins/Greeter/index.js"), `export default U => U.definePlugin({
    name: "Greeter", description: "x", authors: ["t"], enabledByDefault: true,
    patches: [
        { find: "SIM_GREETING", replacement: { match: /"hello /, replace: '"patched ' } },
        { find: "SIM_BROKEN", replacement: { match: /broken: true/, replace: "broken: (() => { throw new Error('boom'); })()" } },
        // 懒加载分块里的模块
        { find: "LAZY_WIDGET=", replacement: { match: /"lazy"/, replace: '"lazy-patched"' } },
    ],
});
`);
    const out = tmp("uspp-wp-out-");
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", out, "--dev"], { encoding: "utf8" });
    const run = env => JSON.parse(execFileSync(process.execPath, [join(root, "test/smoke/webpack.cjs"), join(out, "wpsim.dev.user.js")], { encoding: "utf8", env: { ...process.env, USPP_ID: "wpsim", ...env } }).trim().split("\n").pop());
    const a = run({});
    assert.equal(a.site, "wpsim");
    // 运行时之前推入的分块和之后推入的分块都经过包装;方法简写的工厂也能补丁
    assert.equal(a.entry, "patched SIM_GREETING!");
    assert.equal(a.found, "patched SIM_GREETING");
    assert.equal(a.store, "store");
    assert.equal(a.byCode, true);
    // 第二条补丁运行出错后记为 bypassed;第一条和懒加载分块里的第三条算 applied
    assert.equal(a.applied, 2);
    assert.deepEqual(a.lazy, { before: false, ok: true, widget: "lazy-patched", entry: "lazy-patched", loadChunk: true, other: 7 });
    // 补丁后运行出错:改用原始代码重新执行,导出照常
    assert.equal(a.broken, true);
    assert.equal(a.fallbacks, 1);
    assert.deepEqual(a.orphaned, []);
    assert.deepEqual(a.pageErrors, []);
    assert.ok(a.started.includes("Greeter:true"));
    // 命令行补丁检查器读 webpack 分块(含方法简写工厂)和 TSX 插件
    const chunks = tmp("uspp-wp-chunks-");
    execFileSync(process.execPath, [join(root, "test/smoke/webpack.cjs"), join(out, "wpsim.dev.user.js")], { env: { ...process.env, DUMP: chunks } });
    const chk = JSON.parse(execFileSync(process.execPath, [join(root, "scripts/check-patches.mjs"), "--site-dir", dir, "--chunks", chunks, "--json"], { encoding: "utf8" }));
    assert.deepEqual({ total: chk.summary.total, ok: chk.summary.ok, failed: chk.summary.failed, modules: chk.summary.modules }, { total: 3, ok: 3, failed: 0, modules: 6 });
    // --url:页面直接引用的脚本 + 经运行时 .u / .p 换算出的懒加载分块(分块 4 只能这样找到)
    const siteDir = join(chunks, "site");
    const srv = http.createServer((req, res) => {
        const f = join(siteDir, req.url === "/" ? "index.html" : req.url.split("?")[0]);
        if (!f.startsWith(siteDir) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "text/javascript" });
        res.end(readFileSync(f));
    });
    await new Promise(r => srv.listen(0, "127.0.0.1", r));
    try {
        const live = await new Promise((resolve, reject) => execFile(process.execPath, [join(root, "scripts/check-patches.mjs"), "--site-dir", dir, "--url", `http://127.0.0.1:${srv.address().port}/`, "--json"], { encoding: "utf8", env: { ...process.env, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" } }, (e, out) => (out ? resolve(JSON.parse(out)) : reject(e))));
        assert.deepEqual({ total: live.summary.total, ok: live.summary.ok, failed: live.summary.failed }, { total: 3, ok: 3, failed: 0 }, JSON.stringify(live.summary));
        assert.equal(live.crawl.lazy, 1);
        assert.equal(live.crawl.chunks, 4);
    } finally { srv.close(); }
    // 别的脚本先把分块全局装成访问器:不挂接,补丁记为 bypassed,页面照常
    const b = run({ FOREIGN: "1" });
    assert.equal(b.entry, "hello SIM_GREETING!");
    assert.equal(b.applied, 0);
    assert.equal(b.bypassed, 3);
    assert.ok(b.foreignSeen >= 1);
    assert.deepEqual(b.pageErrors, []);
    assert.deepEqual(b.logs, []);
});

test("webpack 驱动:不写分块全局名,入口块里随运行时一起执行的模块也能补丁", () => {
    const dir = join(tmp("uspp-wpi-"), "wpinl");
    execFileSync(process.execPath, [join(root, "scripts/create.mjs"), "site", "wpinl", "--dir", dir, "--driver", "webpack", "--match", "*://sim.example/*"], { encoding: "utf8" });
    assert.doesNotMatch(readFileSync(join(dir, "index.js"), "utf8"), /global:/);
    writeFileSync(join(dir, "plugins/Hello/index.js"), `export default U => U.definePlugin({
    name: "Hello", description: "x", authors: ["t"], enabledByDefault: true,
    patches: [
        { find: "INLINE_ENTRY", replacement: { match: /"inline hello"/, replace: '"inline patched"' } },
        { find: "INLINE_LATE", replacement: { match: /"late hello"/, replace: '"late patched"' } },
    ],
});
`);
    const out = tmp("uspp-wpi-out-");
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", out, "--dev"], { encoding: "utf8" });
    const r = JSON.parse(execFileSync(process.execPath, [join(root, "test/smoke/webpack.cjs"), join(out, "wpinl.dev.user.js")], { encoding: "utf8", env: { ...process.env, USPP_ID: "wpinl", INLINE: "1" } }).trim().split("\n").pop());
    assert.deepEqual(r, { inline: "inline patched", late: "late patched", found: "inline patched", applied: 2, unhooked: true, plainM: true, pageErrors: [], logs: [] });
});

test("补丁计划:启动时一次定下(含依赖拉起的插件);完整设置读完后不一样的标为重新加载后生效;只有异步读取时用启动快照", () => {
    const dir = join(tmp("uspp-plan-"), "wpplan");
    execFileSync(process.execPath, [join(root, "scripts/create.mjs"), "site", "wpplan", "--dir", dir, "--driver", "webpack", "--match", "*://sim.example/*"], { encoding: "utf8" });
    writeFileSync(join(dir, "plugins/Hello/index.js"), `export default U => U.definePlugin({
    name: "Hello", description: "x", authors: ["t"],
    patches: [{ find: "INLINE_ENTRY", replacement: { match: /"inline hello"/, replace: '"inline patched"' } }],
});
`);
    execFileSync(process.execPath, [join(root, "scripts/create.mjs"), "plugin", "Needs", "--site", dir], { encoding: "utf8" });
    writeFileSync(join(dir, "plugins/Needs/index.js"), `export default U => U.definePlugin({
    name: "Needs", description: "x", authors: ["t"], enabledByDefault: true, dependencies: ["Hello"],
    patches: [{ find: "INLINE_LATE", replacement: { match: /"late hello"/, replace: '"late patched"' } }],
});
`);
    const out = tmp("uspp-plan-out-");
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", out, "--dev"], { encoding: "utf8" });
    const run = env => JSON.parse(execFileSync(process.execPath, [join(root, "test/smoke/webpack.cjs"), join(out, "wpplan.dev.user.js")], { encoding: "utf8", env: { ...process.env, USPP_ID: "wpplan", INLINE: "1", PLAN: "1", ...env } }).trim().split("\n").pop());
    // 第一次打开:Hello 没开,但被默认开启的 Needs 依赖,第一次启动补丁就要生效
    const a = run({});
    assert.deepEqual({ inline: a.inline, late: a.late, reload: a.reload, errors: a.pageErrors, logs: a.logs }, { inline: "inline patched", late: "late patched", reload: [], errors: [], logs: [] });
    // 管理器没有同步读取:同步阶段只能按缺省值定计划;读完发现 Needs 被关了,不补救,标为重新加载后生效,并存下启动快照
    const SK = "UserscriptPP:wpplan:settings";
    const saved = JSON.stringify({ plugins: { Needs: { enabled: false }, Hello: { enabled: true } } });
    const b = run({ NOGM: "1", PRESET: JSON.stringify({ [SK]: saved }) });
    assert.deepEqual({ inline: b.inline, late: b.late, reload: b.reload, errors: b.pageErrors }, { inline: "inline patched", late: "late patched", reload: ["Needs"], errors: [] });
    assert.deepEqual(JSON.parse(b.boot).enabled, { Needs: false, Hello: true });
    // 下次打开:按启动快照定计划,和完整设置一致
    const c = run({ NOGM: "1", PRESET: JSON.stringify({ [SK]: saved, [`${SK}:boot`]: b.boot }) });
    assert.deepEqual({ inline: c.inline, late: c.late, reload: c.reload, errors: c.pageErrors, logs: c.logs }, { inline: "inline patched", late: "late hello", reload: [], errors: [], logs: [] });
    // 快照里的开关不算新设置:读完后照旧以存下来的为准
    assert.deepEqual({ Needs: c.stored.Needs, Hello: c.stored.Hello }, { Needs: false, Hello: true });
});

test("更新:版本变了提示更新日志,到期自动检查,发现新版本可一键更新;没配更新地址时只有更新日志", () => {
    const repo = tmp("uspp-upd-");
    const dir = join(repo, "example");
    cpSync(join(root, "sites/example.dev"), dir, { recursive: true });
    writeFileSync(join(dir, "userscript.json"), JSON.stringify({ id: "upd", name: "Upd", namespace: "t", version: "1.2.0", updateBase: "https://dl.example/scripts/" }));
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\n## 1.2.0 - 2026-11-06\n- New thing\n- Fixed thing\n\n## 1.1.0\n- Older change\n\n## 1.0.0\n- First\n");
    const out = tmp("uspp-upd-out-");
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", out, "--prod"], { encoding: "utf8" });
    const run = env => JSON.parse(execFileSync(process.execPath, [join(root, "test/smoke/updater.cjs"), join(out, "upd.user.js")], { encoding: "utf8", env: { ...process.env, USPP_ID: "upd", ...env } }).trim().split("\n").pop());
    const a = run({ LAST: "1.0.0" });
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.logs, []);
    assert.deepEqual(a.requests, ["https://dl.example/scripts/upd.meta.js"]);
    assert.deepEqual(a.notes, ["Upd v1.3.0 is available", "Upd updated to v1.2.0"]);
    // 只列上次运行的版本之后的条目
    assert.deepEqual(a.changelogVersions, ["1.2.0", "1.1.0"]);
    assert.deepEqual(a.opened, ["https://dl.example/scripts/upd.user.js"]);
    assert.equal(a.storedVersion, "1.2.0");
    assert.equal(a.checkedAt, "number");
    assert.equal(a.status, "v1.3.0 is available.");
    assert.equal(a.pageHasChangelog, 3);
    // 同一版本、一天内检查过:不提示,也不再请求
    const b = run({ LAST: "1.2.0", CHECKED: String(Date.now()) });
    assert.deepEqual(b.notes, []);
    assert.deepEqual(b.requests, []);
    // 检查进行中再检查:共用同一次请求,结果带当前版本(不会是上一次的结果或 null)
    const cc = run({ LAST: "1.2.0", CHECKED: String(Date.now()), CONCURRENT: "1" });
    assert.deepEqual(cc.concurrent, { same: true, current: "1.2.0", latest: "1.3.0", requests: 1 });
    // 检查失败:不记为"上次检查",记下失败次数;退避时间内不再自动检查,过了就重试
    const f = run({ LAST: "1.2.0", FAIL: "1" });
    assert.deepEqual(f.requests, ["https://dl.example/scripts/upd.meta.js"]);
    assert.equal(f.checkedAt, "undefined");
    assert.equal(f.failures, 1);
    assert.deepEqual(run({ LAST: "1.2.0", FAILS: "1", FAILED_AT: String(Date.now()) }).requests, []);
    const retry = run({ LAST: "1.2.0", FAILS: "1", FAILED_AT: String(Date.now() - 6 * 60 * 1000) });
    assert.deepEqual(retry.requests, ["https://dl.example/scripts/upd.meta.js"]);
    assert.equal(retry.checkedAt, "number");
    assert.equal(retry.failures, 0);
    // 首次运行不提示更新日志
    const c = run({ CHECKED: String(Date.now()) });
    assert.deepEqual(c.notes, []);
    assert.equal(c.storedVersion, "1.2.0");
    // 没配更新地址:不请求,Updates 页说明由脚本管理器更新
    writeFileSync(join(dir, "userscript.json"), JSON.stringify({ id: "upd", name: "Upd", namespace: "t", version: "1.2.0" }));
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", out, "--prod"], { encoding: "utf8" });
    const d = run({ LAST: "1.1.0" });
    assert.deepEqual(d.requests, []);
    assert.deepEqual(d.notes, ["Upd updated to v1.2.0"]);
    assert.match(d.status, /no update address/);
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

test("发布渠道:channels 覆盖更新地址,名字和文件名带渠道名", () => {
    const { dir } = externalSite({ id: "chan", name: "Chan", namespace: "test:chan", updateBase: "https://cdn.example/stable/", channels: { beta: { updateBase: "https://cdn.example/beta/" } } });
    const out = tmp("uspp-chan-");
    build("--site-dir", dir, "--out", out, "--channel", "beta");
    assert.deepEqual(readdirSync(out).sort(), ["chan.beta.meta.js", "chan.beta.user.js"]);
    const head = readFileSync(join(out, "chan.beta.meta.js"), "utf8");
    assert.match(head, /@name\s+Chan \(beta\)\n/);
    assert.match(head, /@updateURL\s+https:\/\/cdn\.example\/beta\/chan\.beta\.meta\.js\n/);
    assert.throws(() => execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", out, "--channel", "nope"], { stdio: "pipe" }));
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
    // 管理器有值变化监听时,网站存储的备份只写 IndexedDB(异步),不写同步的 localStorage
    assert.deepEqual(data.settings, { aStarred: ["onlyA"], bStarred: [], bQuickCss: "", gmA: ["UserscriptPPBoot", "UserscriptPPSettings"], gmB: ["UserscriptPPBoot", "UserscriptPPSettings"], ls: [] });
    assert.equal(data.styles.bHasA, false);
    assert.deepEqual(data.menus, { a: ["Script alpha settings", "Script alpha: search…", "Script alpha: reload in safe mode", "Example: say hello"], b: ["Script beta settings", "Script beta: search…", "Script beta: reload in safe mode", "Example: say hello"] });
    assert.ok(data.ui.roots.every(t => /^uspp-(alpha|beta)-/.test(t)), data.ui.roots.join(","));
    assert.deepEqual([data.ui.aToast, data.ui.bToast, data.ui.aPanel, data.ui.bPanel], ["fromA", "fromB", true, false]);
    assert.deepEqual(data.stopA, { a: false, b: true });
    assert.deepEqual(data.idle, [0, 0]);
});

test("页面桥:正常构建的页面上拿不到完整接口和设置,只有补丁用的门面", () => {
    const out = tmp("uspp-bridge-");
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site", "grok", "--out", out], { encoding: "utf8", env: { ...process.env, USPP_TEST_EXPOSE: "" } });
    for (const file of ["grok.user.js", "grok.dev.user.js"]) {
        const { data, errors } = runSite(join(out, file), "https://grok.com/", "grok", { BRIDGE_ONLY: "1" });
        assert.deepEqual(data, { keys: ["plugins", "scriptId", "site", "version"], api: false, fetchExternal: false, settings: false, plugins: "object" }, file);
        assert.equal(errors, "none");
    }
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
        let t = readFileSync(f, "utf8");
        // 开发构建末尾的内联 sourcemap 是 base64,字母可能碰巧拼出 void:解开后只查我们自己的源文件(不查 node_modules)
        const sm = t.match(/\n\/\/# sourceMappingURL=data:application\/json;base64,(\S+)\n$/);
        if (sm) {
            t = t.slice(0, sm.index + 1);
            const map = JSON.parse(Buffer.from(sm[1], "base64").toString());
            t += map.sources.map((s, i) => (s.includes("/node_modules/") ? "" : map.sourcesContent[i])).join("\n");
        }
        assert.deepEqual([...t.matchAll(/void(?! 0\b)/gi)].map(m => t.slice(m.index - 20, m.index + 20)), [], f);
    }
});

// ---------- 核心模块单元测试(直接导入,不经构建) ----------
async function importCore(rel) {
    globalThis.window ??= globalThis;
    globalThis.__USPP_DEV__ ??= true;
    return import(new URL(`../${rel}`, import.meta.url).href);
}

test("补丁预筛:跳过不含字面量的模块,结果和逐条匹配一致", async () => {
    const { applyPatches, canonicalizePatch, requiredLiteral } = await importCore("core/lib/patches.js");
    assert.equal(requiredLiteral(/foo\i\.bar\(/), ".bar(");
    assert.equal(requiredLiteral(/a|bcd/), null);
    assert.equal(requiredLiteral(/x?yzw/), "yzw");
    assert.equal(requiredLiteral(/ab\x41cdef/), "cdef");
    assert.equal(requiredLiteral(/hello/i), null);
    const mk = () => [
        canonicalizePatch({ find: "ALPHA", replacement: { match: /ALPHA/, replace: "ALPHA_BETA" } }, "A"),
        // find 只出现在前一条补丁改出的代码里
        canonicalizePatch({ find: "_BETA", replacement: { match: /_BETA/, replace: "_GAMMA" } }, "B"),
        canonicalizePatch({ find: /delta\i\(/, replacement: { match: /delta/, replace: "DELTA" } }, "C"),
        canonicalizePatch({ find: /e|f/, replacement: { match: /zzz/, replace: "y" }, noWarn: true }, "D"),
    ];
    const stats = { applied: 0, bypassed: 0, noEffect: 0, errors: 0 };
    assert.equal(applyPatches(1, "nothing here", mk(), stats).code, "nothing here");
    assert.equal(applyPatches(2, "x=ALPHA;", mk(), stats).code, "x=ALPHA_GAMMA;");
    assert.equal(applyPatches(3, "deltaFoo(1)", mk(), stats).code, "DELTAFoo(1)");
    // 补丁列表变长后预筛跟着更新
    const list = mk();
    assert.equal(applyPatches(4, "OMEGA", list, stats).code, "OMEGA");
    list.push(canonicalizePatch({ find: "OMEGA", replacement: { match: /OMEGA/, replace: "Z" } }, "E"));
    assert.equal(applyPatches(5, "OMEGA", list, stats).code, "Z");
});

test("版本比较:数字段、构建时间版本、预发布段", async () => {
    globalThis.document ??= {};
    const { compareVersions: c } = await importCore("core/lib/updater.js");
    assert.equal(c("1.10.0", "1.9.2"), 1);
    assert.equal(c("1.0.0-beta.2", "1.0.0"), -1);
    assert.equal(c("1.0.0", "1.0.0-rc.1"), 1);
    assert.equal(c("1.0.0-beta.2", "1.0.0-beta.10"), -1);
    assert.equal(c("1.0.0-alpha", "1.0.0-alpha.1"), -1);
    assert.equal(c("1.0.0-1", "1.0.0-alpha"), -1);
    assert.equal(c("v1.2.0", "1.2.0"), 0);
    assert.equal(c("20261106.153012", "20261106.1530"), 1);
});

test("构建时间版本号用 UTC、精确到秒", () => {
    const { out } = externalSite({ id: "ver-utc", name: "Ver", namespace: "x:ver", match: ["*://v.example/*"] });
    const v = /@version\s+(\S+)/.exec(readFileSync(join(out, "ver-utc.meta.js"), "utf8"))[1];
    assert.match(v, /^\d{8}\.\d{6}$/);
    const now = new Date();
    assert.equal(v.slice(0, 8), `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`);
});

test("@connect 只写用到的主机", () => {
    const head = cfg => { const { out } = externalSite({ id: "conn", name: "C", namespace: "x:conn", match: ["*://c.example/*"], ...cfg }); return [...readFileSync(join(out, "conn.meta.js"), "utf8").matchAll(/@connect\s+(\S+)/g)].map(m => m[1]); };
    assert.deepEqual(head({}), []);
    assert.deepEqual(head({ updateBase: "https://dl.example/s/", themeHosts: ["raw.githubusercontent.com"], connect: ["api.example"] }), ["dl.example", "raw.githubusercontent.com", "api.example"]);
    assert.deepEqual(head({ connect: ["*"] }), ["*"]);
});

test("框架版本:package.json、CHANGELOG 和产物里的框架版本一致", () => {
    const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    assert.match(version, /^\d+\.\d+\.\d+(-[\w.]+)?$/);
    // "## 未发布" 一节放还没发版的改动,不算版本
    const first = [...readFileSync(join(root, "CHANGELOG.md"), "utf8").matchAll(/^## (\S+)/gm)].map(m => m[1]).find(v => v !== "未发布");
    assert.equal(first, version, "CHANGELOG.md 最上面的版本应和 package.json 一致");
    const text = readFileSync(join(exOut, "example.user.js"), "utf8");
    assert.ok(text.includes(JSON.stringify(version)), "产物里应带框架版本");
});

test("发布构建不含开发专用代码;没有 webpack 站点时不打进 webpack 驱动", () => {
    const prod = readFileSync(join(exOut, "example.user.js"), "utf8");
    const dev = readFileSync(join(exOut, "example.dev.user.js"), "utf8");
    for (const mod of ["core/lib/reporter.js", "core/lib/finder-log.js", "core/lib/hot.js"]) {
        assert.ok(!prod.includes(`// ${mod}\n`), `发布构建不应包含 ${mod}`);
    }
    assert.ok(dev.includes("// core/lib/reporter.js\n"), "开发构建应包含补丁检查器");
    assert.ok(!prod.includes("function installWebpack("), "example 没有 webpack 站点,不应打进 webpack 驱动");
});

test("@grant 按产物自动推导,userscript.json 的 grants 追加在后面", () => {
    const head = readFileSync(join(grokOut, "grok.meta.js"), "utf8");
    const grants = [...head.matchAll(/@grant\s+(\S+)/g)].map(m => m[1]);
    assert.equal(grants[0], "unsafeWindow");
    for (const g of ["GM_getValue", "GM_setValue", "GM_xmlhttpRequest", "GM_registerMenuCommand", "GM_notification"]) assert.ok(grants.includes(g), `缺少 ${g}`);
    assert.equal(new Set(grants).size, grants.length, "不应有重复的 @grant");
    const out = tmp("uspp-grants-");
    const dir = join(out, "sites", "granty");
    cpSync(join(root, "sites", "example.dev"), dir, { recursive: true });
    const cfgFile = join(dir, "userscript.json");
    const cfg = JSON.parse(readFileSync(cfgFile, "utf8"));
    writeFileSync(cfgFile, JSON.stringify({ ...cfg, id: "granty", grants: ["GM.getValue", "window.close"] }));
    writeFileSync(join(dir, "index.js"), readFileSync(join(dir, "index.js"), "utf8").replace(/id:\s*"example"/, 'id: "granty"'));
    writeFileSync(join(dir, "plugins", "ExampleHello", "extra.js"), "export const open = u => GM_openInTab(u);\n");
    writeFileSync(join(dir, "plugins", "ExampleHello", "index.js"), 'import { open } from "./extra.js";\n' + readFileSync(join(dir, "plugins", "ExampleHello", "index.js"), "utf8").replace(/^/, "globalThis.__open = open;\n"));
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site-dir", dir, "--out", join(out, "dist"), "--prod"], { encoding: "utf8" });
    const g2 = [...readFileSync(join(out, "dist", "granty.meta.js"), "utf8").matchAll(/@grant\s+(\S+)/g)].map(m => m[1]);
    assert.ok(g2.includes("GM_openInTab"), "插件用到的 GM_openInTab 应自动写进 @grant");
    assert.deepEqual(g2.slice(-2), ["GM.getValue", "window.close"]);
});

test("开发构建内联 sourcemap 并按元数据头平移;发布构建没有", () => {
    const dev = readFileSync(join(grokOut, "grok.dev.user.js"), "utf8");
    assert.doesNotMatch(readFileSync(join(grokOut, "grok.user.js"), "utf8"), /sourceMappingURL=/);
    const m = dev.match(/\n\/\/# sourceMappingURL=data:application\/json;base64,(\S+)\n$/);
    assert.ok(m, "开发构建末尾应有内联 sourcemap");
    const map = JSON.parse(Buffer.from(m[1], "base64").toString());
    assert.ok(map.sources.some(s => s === "uspp-src:///grok/sites/grok/plugins/GrokMenus/index.js"), "源文件路径应为 uspp-src:///<ID>/<相对路径>");
    const headLines = dev.slice(0, dev.indexOf("// ==/UserScript==")).split("\n").length;
    assert.ok(map.mappings.startsWith(";".repeat(headLines)), "映射应跳过元数据头");
});

test("报告问题:GitHub 仓库直接打开填好诊断信息的新建 Issue 页,太长时截短", async () => {
    const { githubIssueUrl, reportIssueTarget } = await importCore("core/lib/diagnostics.js");
    assert.equal(githubIssueUrl("https://example.com/help", "t", "b"), null);
    const u = new URL(githubIssueUrl("https://github.com/me/my-news/issues", "Title", "Body"));
    assert.equal(u.origin + u.pathname, "https://github.com/me/my-news/issues/new");
    assert.equal(u.searchParams.get("body"), "Body");
    const short = reportIssueTarget("https://github.com/me/repo", "line1\nline2");
    assert.equal(short.copied, false);
    assert.match(new URL(short.url).searchParams.get("body"), /line1\nline2/);
    const long = reportIssueTarget("https://github.com/me/repo", Array.from({ length: 400 }, (_, i) => `log line ${i} ${"x".repeat(40)}`).join("\n"));
    assert.equal(long.truncated, true);
    assert.equal(long.copied, true);
    assert.ok(long.url.length <= 7000);
    assert.deepEqual(reportIssueTarget("https://example.com/help", "x"), { url: "https://example.com/help", copied: true, truncated: false });
});

test("外部请求白名单:和 @connect 同样的匹配规则,插件声明了 connect 时只能访问这些主机", async () => {
    const { hostAllowed, fetchExternalFor, blockedRequests } = await importCore("core/lib/net.js");
    assert.equal(hostAllowed("api.example", ["other.example"]), false);
    assert.equal(hostAllowed("api.example.com", ["example.com"]), true);
    assert.equal(hostAllowed("example.com", ["example.com"]), true);
    assert.equal(hostAllowed("evil-example.com", ["example.com"]), false);
    assert.equal(hostAllowed("any.host", ["*"]), true);
    assert.equal(hostAllowed("a.b", []), false);
    // 不经构建时脚本级列表是 "*";插件只声明了 a.example
    const f = fetchExternalFor("P", ["a.example"]);
    await assert.rejects(f("https://b.example/x"), /Request blocked: b\.example is not in P's declared hosts/);
    await assert.rejects(f("ftp://a.example/x"), /only http\(s\)/);
    assert.ok(blockedRequests().some(r => r.host === "b.example" && r.plugin === "P"));
});

test("@license 缺省 GPL-3.0-or-later;插件声明的 connect 写进 @connect", () => {
    const repo = tmp("uspp-lic-");
    const dir = join(repo, "sites", "example");
    cpSync(join(root, "sites/example.dev"), dir, { recursive: true });
    writeFileSync(join(dir, "userscript.json"), JSON.stringify({ id: "lic", name: "L", namespace: "x:lic", match: ["*://l.example/*"] }));
    const p = join(dir, "plugins", "ExampleHello", "index.js");
    writeFileSync(p, readFileSync(p, "utf8").replace('name: "ExampleHello",', 'name: "ExampleHello",\n        connect: ["api.plugin.example"],'));
    build("--site-dir", dir, "--out", join(repo, "dist"));
    const head = readFileSync(join(repo, "dist", "lic.meta.js"), "utf8");
    assert.match(head, /@license\s+GPL-3\.0-or-later\n/);
    assert.deepEqual([...head.matchAll(/@connect\s+(\S+)/g)].map(m => m[1]), ["api.plugin.example"]);
    writeFileSync(join(dir, "userscript.json"), JSON.stringify({ id: "lic", name: "L", namespace: "x:lic", match: ["*://l.example/*"], license: "GPL-3.0-only" }));
    build("--site-dir", dir, "--out", join(repo, "dist"));
    assert.match(readFileSync(join(repo, "dist", "lic.meta.js"), "utf8"), /@license\s+GPL-3\.0-only\n/);
});

test("开发构建的 sourcemap 不带构建机目录,换目录构建结果不变", () => {
    const decode = file => JSON.parse(Buffer.from(readFileSync(file, "utf8").match(/base64,(\S+)\n$/)[1], "base64").toString());
    const a = externalSite({ id: "srcmap", name: "S", namespace: "x:s", match: ["*://s.example/*"] });
    const b = externalSite({ id: "srcmap", name: "S", namespace: "x:s", match: ["*://s.example/*"] });
    const ma = decode(join(a.out, "srcmap.dev.user.js")), mb = decode(join(b.out, "srcmap.dev.user.js"));
    assert.deepEqual(ma.sources, mb.sources);
    for (const s of ma.sources) {
        assert.ok(s.startsWith("uspp-src:///srcmap/"), s);
        assert.ok(!s.includes("..") && !s.includes(tmpdir()) && !s.includes(root), `来源名不应带本机目录:${s}`);
    }
    assert.ok(ma.sources.includes("uspp-src:///srcmap/sites/example/plugins/ExampleHello/index.js"));
    assert.ok(ma.sources.includes("uspp-src:///srcmap/<define:__USPP_SCRIPT__>"));
});

test("没有菜单命令的管理器(AdGuard):设置入口改放在悬浮按钮区,系统通知走 GM.notification,诊断信息列出缺的能力", () => {
    const { data, errors, logs } = runSite(bundle, "https://example.com/page", "example", { PROFILE: "adguard" });
    assert.equal(errors, "none");
    assert.equal(logs, "");
    assert.equal(data.menus, 0);
    assert.match(String(data.entry), /settings$/);
    assert.equal(data.panel, true, "点悬浮入口应打开设置面板");
    assert.deepEqual(data.gmNotes, ["Sys"]);
    assert.equal(data.diag, "Script manager: AdGuard 7.20 · missing: menu, crossTabSync, clipboard");
});

test("保存:内容没变时不重写 GM 存储", () => {
    const { data, errors } = runSite(bundle, "https://example.com/page", "example", { PROFILE: "adguard", SAVE_PROBE: "1" });
    assert.equal(errors, "none");
    assert.deepEqual(data.saveProbe, { firstWrites: 1, sameWrites: 0, changedWrites: 1, staleWrites: 1, stored: ["a", "b"] });
});

const runTabs = (scenario, env = {}) => {
    const text = execFileSync(process.execPath, [join(root, "test/smoke/tabs.cjs"), bundle, scenario], { encoding: "utf8", env: { ...process.env, ...env } });
    const errors = text.slice(text.indexOf("ERRORS:") + 7, text.indexOf("LOGS:")).trim();
    return { data: JSON.parse(text.slice(text.indexOf("{"), text.indexOf("ERRORS:"))), errors };
};

test("多标签页同时保存:不丢改动,同一项冲突时所有标签页收敛到同一个值(有 / 没有值变化监听)", () => {
    for (const env of [{}, { PROFILE: "adguard" }]) {
        const c = runTabs("concurrent", env);
        assert.equal(c.errors, "none");
        const both = { probeA: "a", probeB: "b" };
        assert.deepEqual({ stored: c.data.stored, A: c.data.A, B: c.data.B }, { stored: both, A: both, B: both }, JSON.stringify(env));
    }
    const k = runTabs("conflict");
    assert.equal(k.errors, "none");
    assert.equal(k.data.converged, true, JSON.stringify(k.data.values));
});

test("别的标签页删掉整条插件设置:本页已注册的插件重置为默认值,不删条目", () => {
    const { data, errors } = runTabs("registered");
    assert.equal(errors, "none");
    assert.deepEqual(data.registered, { before: "dark", entry: true, read: "auto", stored: null });
});

test("类型声明:插件、作用域、站点和接口总表上的每个成员都有文档注释", () => {
    const lines = readFileSync(join(root, "types/index.d.ts"), "utf8").split("\n");
    const targets = new Set(["UsppApi", "PluginCtx", "PluginDef", "SiteDef", "SettingCommon", "DefinedSettings", "PluginDataStore", "Patch", "PatchReplacement", "PatchHooks"]);
    const missing = [];
    let cur = null, depth = 0;
    lines.forEach((l, i) => {
        const m = depth === 0 && l.match(/^export interface (\w+)/);
        if (m) cur = targets.has(m[1]) ? m[1] : null;
        const mm = cur && depth === 1 && l.match(/^ {4}(?:readonly )?([A-Za-z_]\w*)\??\s*[(:<]/);
        if (mm && !lines[i - 1].trim().endsWith("*/")) missing.push(`${cur}.${mm[1]}`);
        depth += (l.match(/{/g) || []).length - (l.match(/}/g) || []).length;
        if (depth === 0) cur = null;
    });
    assert.deepEqual(missing, [], "这些公开成员缺少 /** */ 注释");
});
