// 冒烟测试:jsdom + 仿 Turbopack 运行时 + 仿 Grok 模块,分别模拟独占、与其他脚本共存(先/后注入)三种情况
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "uspp-test-"));
execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--out", out], { stdio: "ignore" });
const bundle = join(out, "Userscript++.dev.user.js");

function run(order, late) {
    const env = late ? { ...process.env, LATE: "1" } : process.env;
    const text = execFileSync(process.execPath, [join(root, "test/smoke/run.cjs"), bundle, order], { encoding: "utf8", maxBuffer: 64 << 20, env });
    const i = text.indexOf("{\n"), j = text.indexOf("ERRORS:");
    const data = JSON.parse(text.slice(i, j));
    const errors = text.slice(j + 7, text.indexOf("LOGS:")).trim();
    return { data, errors };
}

// late:下拉组件模块晚于兜底触发才执行,只出现在运行时缓存里
for (const [order, late] of [["first"], ["foreignFirst"], ["foreignAfter"], ["foreignFirst", true], ["foreignAfter", true]]) {
    test(`冒烟:${order}${late ? "(组件晚到)" : ""}`, () => {
        const { data, errors } = run(order, late);
        assert.equal(errors, "none");
        assert.deepEqual(data.orphaned, []);
        assert.equal(data.stats.errors, 0);
        assert.equal(data.stats.runtimeFallbacks, 0);
        assert.ok(data.statuses.every(s => /-> (applied|bypassed)(,(applied|bypassed))*$/.test(s)), data.statuses.join("\n"));
        if (data.stats.bypassed) assert.deepEqual([...data.stats.injectionFallbacks].sort(), ["GrokChatBar", "GrokMenus", "Settings"]);
        assert.ok(data.tabs.includes("uspp_plugins_tab"));
        assert.ok(String(data.avatar).includes("Userscript++"));
        assert.ok(String(data.avatar).includes("ProbeUser"));
        assert.ok(String(data.conv).includes("uspp-t1"));
        assert.deepEqual(data.consoleToggle, [true, false, false]);
        assert.deepEqual(data.streamEnds, ["r1"]);
        assert.deepEqual(data.subs, { tier: "SUBSCRIPTION_TIER_SUPER_GROK_PRO", name: "SuperGrok Pro", subscribed: true, x: false, active: 1 });
        assert.equal(data.importedCss, "imported{}");
        assert.equal(data.bodyHasOwnRoot, true);
        assert.deepEqual(data.loaded, { starred: ["Thick"], thick: true });
        assert.deepEqual(data.menus, ["Userscript++ settings"]);
        assert.deepEqual(data.crossTab, { pinned: ["RemotePin"], css: "local{}", notified: 1 });
        assert.deepEqual(data.backup, { exportedToken: false, token: "s3cret", color: "blue", format: "userscript-pp-settings" });
        assert.equal(data.writable, true);
        assert.equal(data.site, "grok");
        assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true"]);
        assert.equal(data.aliasSite, "grok");
        assert.deepEqual(data.aliasOn, [true, true, true, true]);
        assert.deepEqual(data.aliasOff, [false, false, false]);
        if (!data.stats.bypassed) assert.equal(data.aliasBtnRendered, true);
    });
}

function runSite(file, url) {
    const text = execFileSync(process.execPath, [join(root, "test/smoke/site.cjs"), file, url], { encoding: "utf8", maxBuffer: 64 << 20 });
    const data = JSON.parse(text.slice(text.indexOf("{\n"), text.indexOf("ERRORS:")));
    const errors = text.slice(text.indexOf("ERRORS:") + 7, text.indexOf("LOGS:")).trim();
    const logs = text.slice(text.indexOf("LOGS:") + 5).trim();
    return { data, errors, logs };
}

// 没有适配的网站(包括 X 上的 Grok):通用站点,只有核心
for (const url of ["https://example.com/page", "https://x.com/i/grok"]) {
    test(`冒烟:通用站点 ${url}`, () => {
        const { data, errors, logs } = runSite(bundle, url);
        assert.equal(errors, "none");
        assert.equal(logs, "", "不应有警告或错误日志");
        assert.equal(data.site, "generic");
        assert.equal(data.turbopackTouched, false);
        assert.equal(data.fetchWrapped, false);
        assert.deepEqual(data.plugins, ["Settings"]);
        assert.deepEqual(data.started, ["Settings:true"]);
        assert.deepEqual(data.menus, ["Userscript++ settings"]);
        assert.equal(data.grokTheme, false);
        assert.equal(data.quickCss, true);
        assert.equal(data.find, null);
        assert.equal(data.aliasNoop, "object");
        assert.equal(data.siteStorage, null);
        assert.equal(data.keptGrokData, true);
        assert.deepEqual(data.migrated, { grokThemes: ["GrokOnly"], grokCss: "p{color:red}", topLevel: false, here: "p{outline:1px solid red}" });
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

test("单站版 --site grok", () => {
    const dir = mkdtempSync(join(tmpdir(), "uspp-site-"));
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--site", "grok", "--out", dir], { stdio: "ignore" });
    const head = readFileSync(join(dir, "Userscript++.grok.meta.js"), "utf8");
    assert.deepEqual([...head.matchAll(/@match\s+(\S+)/g)].map(m => m[1]), ["*://grok.com/*"]);
    assert.match(head, /@downloadURL\s+\S+Userscript%2B%2B\.grok\.user\.js/);
    const text = execFileSync(process.execPath, [join(root, "test/smoke/run.cjs"), join(dir, "Userscript++.grok.dev.user.js"), "first"], { encoding: "utf8", maxBuffer: 64 << 20 });
    const data = JSON.parse(text.slice(text.indexOf("{\n"), text.indexOf("ERRORS:")));
    assert.equal(text.slice(text.indexOf("ERRORS:") + 7, text.indexOf("LOGS:")).trim(), "none");
    assert.deepEqual(data.buildSites, ["grok"]);
    assert.deepEqual(data.plugins, ["Settings:true", "GrokChatBar:true", "GrokMenus:true"]);
    // 单站版里没有别的站点:网址不匹配时不运行(由脚本管理器的 @match 保证),即便运行也只有通用站点
    const other = runSite(join(dir, "Userscript++.grok.user.js"), "https://example.com/");
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
    for (const f of readdirSync(out).filter(n => n.endsWith(".js"))) {
        const t = readFileSync(join(out, f), "utf8");
        assert.deepEqual([...t.matchAll(/void(?! 0\b)/gi)].map(m => t.slice(m.index - 20, m.index + 20)), [], f);
    }
});
