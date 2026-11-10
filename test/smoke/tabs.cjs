// 多标签页:几个 jsdom 窗口共用一个"脚本管理器后台"。和 Violentmonkey / Tampermonkey 一样,每个标签页读写自己的本地缓存,
// 写入异步送到后台,后台按到达顺序存下并广播给其他标签页(带 remote=true 的值变化通知)。
// 用法:node tabs.cjs <脚本> <场景>;PROFILE=adguard 时没有值变化监听,读写直接走后台
const { JSDOM } = require("jsdom");
const fs = require("fs");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const scenario = process.argv[3];
const url = "http://localhost:8080/uspp-example/index.html";
const ID = process.env.USPP_ID || "example";
const KEY = Symbol.for(`uspp:${ID}`);
const SK = "UserscriptPPSettings";
// adguard:没有值变化监听,读写直接走后台;adguard-snapshot:最坏情况,GM_getValue 只看得到注入时的值和本页自己的写入
const adguard = process.env.PROFILE === "adguard" || process.env.PROFILE === "adguard-snapshot";
const snapshotGm = process.env.PROFILE === "adguard-snapshot";
// 页面自己的 Web Locks 和 BroadcastChannel(同一 origin 的标签页之间);NOLOCKS=1 时没有(旧浏览器),退回先读后合并再写
const withLocks = !process.env.NOLOCKS;
const lockQueue = new Map();
const lockManager = {
    request(name, opts, cb) {
        if (typeof opts === "function") { cb = opts; opts = {}; }
        const prev = lockQueue.get(name) || Promise.resolve();
        let release;
        const held = new Promise(r => { release = r; });
        lockQueue.set(name, prev.then(() => held));
        return prev.then(async () => {
            if (opts?.signal?.aborted) { release(); throw Object.assign(new Error("aborted"), { name: "AbortError" }); }
            try { return await cb({ name }); } finally { release(); }
        });
    },
};
const HOP = 5; // 标签页 → 后台、后台 → 标签页各 5 ms
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// 同一 origin 的标签页共用一份 localStorage;别的标签页写入时收到 storage 事件
const sharedLs = new Map();
function lsFor(tab) {
    const fire = (key, oldValue, newValue) => {
        for (const t of tabs) {
            if (t === tab) continue;
            setTimeout(() => {
                const e = new t.w.Event("storage");
                Object.assign(e, { key, oldValue, newValue });
                t.w.dispatchEvent(e);
            }, 1);
        }
    };
    return {
        getItem: k => (sharedLs.has(k) ? sharedLs.get(k) : null),
        setItem: (k, v) => { const old = sharedLs.has(k) ? sharedLs.get(k) : null; v = String(v); sharedLs.set(k, v); if (old !== v) fire(k, old, v); },
        removeItem: k => { const old = sharedLs.get(k) ?? null; sharedLs.delete(k); if (old !== null) fire(k, old, null); },
        key: i => [...sharedLs.keys()][i] ?? null,
        clear: () => sharedLs.clear(),
        get length() { return sharedLs.size; },
    };
}
const background = new Map();
let backgroundWrites = 0;
const tabs = [];
const errors = [];

function openTab(name) {
    const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="toolbar"></div></body></html>`, { url, runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window;
    w.addEventListener("error", e => errors.push(`${name} uncaught: ` + (e.error?.stack || e.message)));
    for (const k of ["log", "info", "debug"]) w.console[k] = () => { };
    w.console.warn = w.console.error = (...a) => errors.push(`${name}: ` + a.map(x => x instanceof Error ? x.stack : String(x)).join(" "));
    const cache = new Map([...background].map(([k, v]) => [k, clone(v)]));
    const listeners = [];
    const tab = { name, w, cache, listeners };
    Object.defineProperty(w, "localStorage", { value: lsFor(tab), configurable: true });
    if (withLocks) {
        Object.defineProperty(w.navigator, "locks", { value: lockManager, configurable: true });
        w.BroadcastChannel = globalThis.BroadcastChannel;
    }
    if (snapshotGm) {
        const snap = new Map([...background].map(([k, v]) => [k, clone(v)]));
        w.GM_getValue = (k, d) => snap.has(k) ? clone(snap.get(k)) : d;
        w.GM_setValue = (k, v) => { snap.set(k, clone(v)); background.set(k, clone(v)); if (k.startsWith(SK)) backgroundWrites++; };
    } else if (adguard) {
        w.GM_getValue = (k, d) => background.has(k) ? clone(background.get(k)) : d;
        w.GM_setValue = (k, v) => { background.set(k, clone(v)); if (k.startsWith(SK)) backgroundWrites++; };
    } else {
        w.GM_getValue = (k, d) => cache.has(k) ? clone(cache.get(k)) : d;
        w.GM_setValue = (k, v) => {
            cache.set(k, clone(v));
            const sent = clone(v);
            setTimeout(() => {
                background.set(k, sent);
                if (k.startsWith(SK)) backgroundWrites++;
                for (const t of tabs) {
                    if (t === tab) continue;
                    setTimeout(() => {
                        const old = t.cache.get(k);
                        t.cache.set(k, clone(sent));
                        for (const l of t.listeners) if (l.k === k) l.fn(k, old, clone(sent), true);
                    }, HOP);
                }
            }, HOP);
        };
        w.GM_addValueChangeListener = (k, fn) => { listeners.push({ k, fn }); return listeners.length; };
    }
    w.GM_deleteValue = k => { cache.delete(k); background.delete(k); };
    w.GM_registerMenuCommand = () => 1;
    if (adguard) {
        w.GM_info = { scriptHandler: "AdGuard", version: "7.20" };
        w.unsafeWindow = w; w.GM_xmlhttpRequest = () => ({ abort() { } });
        w.GM = { info: w.GM_info, notification: () => Promise.resolve() };
    }
    w.eval(bundle);
    tab.P = w[KEY].api;
    tabs.push(tab);
    return tab;
}

// 设置按份存:SK:meta(顶层和插件名单)+ SK:p:<插件名>;拼回整份
const val = k => { const v = background.get(k); return typeof v === "string" ? JSON.parse(v) : v; };
const strip = v => { if (!v) return v; const o = { ...v }; for (const k of ["$rev", "$writer", "$savedAt", "$parts", "$v", "$deleted"]) delete o[k]; return o; };
const stored = () => {
    const m = val(`${SK}:meta`);
    const doc = { ...strip(m || {}), plugins: {} };
    for (const n of m?.$parts || []) { const pv = val(`${SK}:p:${n}`); if (pv && !pv.$deleted) doc.plugins[n] = strip(pv); }
    return doc;
};
const sysOf = t => t.P.PlainSettings.plugins.Settings;

(async () => {
    const out = {};
    const a = openTab("A"), b = openTab("B");
    await sleep(400);
    if (scenario === "concurrent") {
        // 同一刻各改一个不同的项:两项都要留下,两页一致
        a.P.Settings.plugins.Settings.probeA = "a";
        b.P.Settings.plugins.Settings.probeB = "b";
        await sleep(1500);
        const s = stored().plugins.Settings;
        out.stored = { probeA: s.probeA ?? null, probeB: s.probeB ?? null };
        out.A = { probeA: sysOf(a).probeA ?? null, probeB: sysOf(a).probeB ?? null };
        out.B = { probeA: sysOf(b).probeA ?? null, probeB: sysOf(b).probeB ?? null };
    } else if (scenario === "conflict") {
        // 同一刻改同一项:所有标签页和存储收敛到同一个值
        a.P.Settings.plugins.Settings.probe = "from-A";
        b.P.Settings.plugins.Settings.probe = "from-B";
        await sleep(1500);
        out.values = [stored().plugins.Settings.probe, sysOf(a).probe, sysOf(b).probe];
        out.converged = new Set(out.values).size === 1;
    } else if (scenario === "registered") {
        // 另一页(别的站点,没有这个插件)导入一份没有它的旧备份:本页已注册、正在用的插件设置重置为默认值,不删条目
        a.P.registerPlugin(a.P.definePlugin({ name: "RegProbe", description: "x", authors: ["t"], settings: a.P.definePluginSettings({ mode: { type: a.P.OptionType.STRING, default: "auto" } }) }));
        a.P.Settings.plugins.RegProbe.mode = "dark";
        await sleep(800);
        const before = b.P.PlainSettings.plugins.RegProbe?.mode;
        const backup = clone(b.P.PlainSettings);
        delete backup.plugins.RegProbe;
        await b.P.importSettings(backup);
        await sleep(800);
        let read;
        try { read = a.P.plugins.RegProbe.settings.store.mode; } catch (e) { read = "throws " + e.message; }
        out.registered = { before, entry: "RegProbe" in a.P.PlainSettings.plugins, read, stored: stored().plugins.RegProbe?.mode ?? null };
    }
    if (scenario === "trip") {
        // 熔断发生在 DOM 批处理中间:同一批里后面的元素不再调用这个插件,清理之后页面上不留它加的东西
        const P = a.P, d = a.w.document;
        P.registerPlugin(P.definePlugin({
            name: "TripProbe", description: "x", authors: ["t"],
            start(ctx) {
                ctx.observe(".msg", { added: el => { const m = d.createElement("i"); m.className = "trip-mark"; el.append(m); throw new Error("boom"); } });
                ctx.register(() => d.querySelectorAll(".trip-mark").forEach(m => m.remove()));
            },
        }));
        P.startPlugin("TripProbe");
        const box = d.createElement("div");
        for (let i = 0; i < 300; i++) { const m = d.createElement("p"); m.className = "msg"; box.append(m); }
        d.body.append(box);
        await sleep(300);
        out.trip = { marks: d.querySelectorAll(".trip-mark").length, started: !!P.plugins.TripProbe.started, phase: P.pluginPhase("TripProbe"), errors: P.pluginErrorStats().find(x => x.name === "TripProbe")?.count ?? null };
        errors.length = 0; // 插件故意抛的错会记日志
    }
    if (scenario === "owner") {
        // 回调以登记它的插件身份运行:别的插件在 start() 里加注入点内容时,监听者在通知里创建的观察器归监听者,不归触发者
        const P = a.P, d = a.w.document;
        let seen = 0, off = null;
        P.registerPlugin(P.definePlugin({ name: "Listener", description: "x", authors: ["t"], start(ctx) {
            ctx.onSlotChange("probe.slot", () => { off ??= P.observe(".owner-probe", { added: () => { seen++; } }); });
        } }));
        P.registerPlugin(P.definePlugin({ name: "Trigger", description: "x", authors: ["t"], start(ctx) { ctx.addSlotItem("probe.slot", "t", { label: "t" }); } }));
        P.startPlugin("Listener");
        P.startPlugin("Trigger");
        P.stopPlugin("Trigger");
        const el = d.createElement("p"); el.className = "owner-probe"; d.body.append(el);
        await sleep(100);
        const afterTriggerStop = seen;
        P.stopPlugin("Listener");
        const el2 = d.createElement("p"); el2.className = "owner-probe"; d.body.append(el2);
        await sleep(100);
        out.owner = { afterTriggerStop, afterListenerStop: seen - afterTriggerStop };
    }
    if (scenario === "lifecycle") {
        const P = a.P;
        // 依赖启动失败:依赖方阶段为 blocked,不随每次收敛反复重试;Restart 连同依赖一起重试
        let fTries = 0, fail = true;
        P.registerPlugin(P.definePlugin({ name: "DepF", description: "x", authors: ["t"], start() { fTries++; if (fail) throw new Error("dep fails"); } }));
        P.registerPlugin(P.definePlugin({ name: "DepUser", description: "x", authors: ["t"], dependencies: ["DepF"], start() { } }));
        P.startPlugin("DepUser");
        const blocked = { phase: P.pluginPhase("DepUser"), depPhase: P.pluginPhase("DepF"), tries: fTries };
        P.registerPlugin(P.definePlugin({ name: "Other", description: "x", authors: ["t"], start() { } }));
        P.startPlugin("Other"); P.stopPlugin("Other");
        blocked.triesAfterOtherReconcile = fTries;
        fail = false;
        blocked.restarted = P.restartPlugin("DepUser") && P.plugins.DepF.started && fTries === 2;
        P.stopPlugin("DepUser");
        // 插件在 start() 里启动别的插件:同步接口推迟(返回 false),异步接口等真正启动后兑现
        let nested = null;
        P.registerPlugin(P.definePlugin({ name: "Inner", description: "x", authors: ["t"], start() { } }));
        P.registerPlugin(P.definePlugin({ name: "Outer", description: "x", authors: ["t"], start() { nested = { sync: P.startPlugin("Inner"), promise: P.startPluginAsync("Inner") }; } }));
        P.startPlugin("Outer");
        nested.final = await nested.promise;
        delete nested.promise;
        // async start():完成前是 starting;期间停了又开,旧一次的结果作废
        P.registerPlugin(P.definePlugin({ name: "Slow", description: "x", authors: ["t"], async start() { await sleep(50); } }));
        P.startPlugin("Slow");
        const slow = { early: P.pluginPhase("Slow") };
        P.stopPlugin("Slow"); P.startPlugin("Slow");
        slow.final = await P.startPluginAsync("Slow");
        // 运行时注册的默认开启插件:立即启动
        P.registerPlugin(P.definePlugin({ name: "AutoOn", description: "x", authors: ["t"], enabledByDefault: true, start() { } }));
        out.lifecycle = { blocked, nested, slow, autoOn: P.pluginPhase("AutoOn") };
        errors.length = 0; // DepF 故意抛的错会记日志
    }
    if (scenario === "safemode") {
        // 几个标签页几乎同时打开(会话恢复):每个都是一次独立的正常启动,不因为共用一份计数进安全模式
        const c = openTab("C"), d = openTab("D");
        await sleep(300);
        out.safe = [a, b, c, d].map(t => t.P.isSafeMode());
        out.legacyKey = background.has("UserscriptPPBoot");
    }
    if (scenario === "gaps") {
        const P = a.P;
        const def = (name, extra) => P.definePlugin({ name, description: "x", authors: ["t"], ...extra });
        // 同一插件同 id 再加注入点内容:替换,不叠加;前一次拿到的撤销函数不撤掉新的;插件停了才撤
        let firstRemove = null;
        P.registerPlugin(def("SlotGen", { start() { firstRemove = P.addSlotItem("gapSlot", "x", { label: "a" }); P.addSlotItem("gapSlot", "x", { label: "b" }); } }));
        P.startPlugin("SlotGen");
        const labels = () => P.getSlotItems("gapSlot").map(i => i.label);
        const slot = { afterStart: labels() };
        firstRemove?.();
        slot.afterStaleRemove = labels();
        P.stopPlugin("SlotGen");
        slot.afterStop = labels();
        // 阶段带原因:依赖启动失败时依赖方 blocked / depStopped;热替换修好的依赖后,依赖方跟着起来
        let depFails = true;
        P.registerPlugin(def("GapDep", { start() { if (depFails) throw new Error("dep boom"); } }));
        P.registerPlugin(def("GapUser", { dependencies: ["GapDep"], start() { } }));
        P.startPlugin("GapUser");
        const st = P.pluginStatus("GapUser"), dst = P.pluginStatus("GapDep");
        depFails = false;
        const r = P.replacePlugin(def("GapDep", { start() { } }));
        const status = { user: [st.phase, st.reason, st.detail], dep: [dst.phase, dst.reason, dst.detail], replaced: { ok: r.ok, started: r.started, phase: r.phase }, userAfter: P.pluginPhase("GapUser") };
        // 热替换一个启动失败的插件,新定义也失败:如实报告
        P.registerPlugin(def("GapBad", { start() { throw new Error("bad1"); } }));
        P.startPlugin("GapBad");
        const r2 = P.replacePlugin(def("GapBad", { start() { throw new Error("bad2"); } }));
        status.replacedBad = { ok: r2.ok, phase: r2.phase, error: String(r2.error?.message ?? r2.error) };
        // 重入:start 里停掉自己、stop 里启动别的插件
        P.registerPlugin(def("SelfStop", { start() { P.stopPlugin("SelfStop"); } }));
        P.registerPlugin(def("StopStarts", { start() { }, stop() { P.startPlugin("Late"); } }));
        P.registerPlugin(def("Late", { start() { } }));
        P.startPlugin("SelfStop");
        P.startPlugin("StopStarts");
        P.stopPlugin("StopStarts");
        await sleep(50);
        const reentry = { selfStop: P.pluginPhase("SelfStop"), stopStarts: P.pluginPhase("StopStarts"), late: P.pluginPhase("Late") };
        out.gaps = { slot, status, reentry };
        errors.length = 0; // 故意抛的错会记日志
    }
    if (scenario === "four") {
        // 4 个标签页同一刻各改一个不同插件的设置(会同时往插件名单里加新插件)、同一个插件里各自的项、同一个数组:
        // 都留下,数组收敛到同一个值,所有标签页和存储一致
        const c = openTab("C"), d = openTab("D");
        await sleep(400);
        const all = [a, b, c, d];
        all.forEach((t, i) => {
            t.P.Settings.plugins[`Probe${i}`] = { v: i };
            t.P.Settings.plugins.Settings[`four${i}`] = i;
            t.P.Settings.plugins.Settings.arr = [t.name];
        });
        await sleep(2500);
        // 收敛后不再互相重写
        const settled = backgroundWrites;
        await sleep(1500);
        const quiet = backgroundWrites === settled;
        const view = P => ({ probes: [0, 1, 2, 3].map(i => P.plugins?.[`Probe${i}`]?.v ?? null), own: [0, 1, 2, 3].map(i => P.plugins?.Settings?.[`four${i}`] ?? null), arr: JSON.stringify(P.plugins?.Settings?.arr ?? null) });
        const views = [view(stored()), ...all.map(t => view(t.P.PlainSettings))];
        out.four = { stored: view(stored()), same: new Set(views.map(v => JSON.stringify(v))).size === 1, quiet };
    }
    if (scenario === "pagehide") {
        // 改完马上关页面:pagehide 时同步写 GM 和镜像。模拟 GM 没来得及落盘(恢复成写之前的值):
        // 镜像是接着 GM 当前版本写的,下次启动用镜像快进并补写回 GM;镜像的 base 不等于 GM 当前版本时不用它
        const key = `${SK}:p:Settings`;
        a.P.Settings.plugins.Settings.ph = "first";
        await sleep(800);
        const before = clone(background.get(key));
        a.P.Settings.plugins.Settings.ph = "second";
        a.w.dispatchEvent(new a.w.Event("pagehide"));
        const mirrored = JSON.parse(sharedLs.get(`UserscriptPP:${ID}:settings`) || "null")?.plugins?.Settings?.ph ?? null;
        background.set(key, clone(before));
        const c = openTab("C");
        await sleep(600);
        const ff = { mirrored, seen: c.P.PlainSettings.plugins.Settings.ph ?? null, rewritten: stored().plugins.Settings.ph ?? null };
        // 第二次:镜像的 base 是旧版本(镜像不是接着 GM 当前版本写的),不能用它盖过 GM
        const before2 = clone(background.get(key));
        c.P.Settings.plugins.Settings.ph = "third";
        c.w.dispatchEvent(new c.w.Event("pagehide"));
        background.set(key, clone(before2));
        const mk = `UserscriptPP:${ID}:settings`;
        const m = JSON.parse(sharedLs.get(mk));
        m.$mirror.base.Settings = [0, ""];
        sharedLs.set(mk, JSON.stringify(m));
        const d = openTab("D");
        await sleep(600);
        out.pagehide = { ff, stale: { seen: d.P.PlainSettings.plugins.Settings.ph ?? null, stored: stored().plugins.Settings.ph ?? null } };
    }
    out.writes = backgroundWrites;
    console.log(JSON.stringify(out, null, 1));
    console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
    console.log("LOGS:");
    process.exit(0);
})();
