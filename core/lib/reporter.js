// 补丁 / 查找器检查器(站点无关,纯字符串操作,不碰页面)。
// 页面里的 U.checkPatches()(开发构建)和命令行 scripts/check-patches.mjs 共用这里的逻辑:
//   lintPatch      静态检查:正则能否编译、反向引用是否超出捕获组、捕获组过多、匹配串过长、贪婪通配等
//   checkPatches   拿模块源码逐条测试补丁:find 命中几个模块、每条替换是否生效、补丁后的代码能否解析
//   crawlChunks    从已知模块源码里找出懒加载分块的路径,逐个取回、解析出模块工厂,直到没有新分块
import { canonicalizeFind, canonicalizeRegex, matchesFind, describeFind } from "./patches.js";

export const MAX_CAPTURE_WARN = 5;
export const MATCH_LONG = 200;
const FIND_SHORT = 6;

/** 分块路径:Turbopack / Next.js 的 "static/chunks/…js"(可带 _next/ 前缀) */
export const CHUNK_PATH_RE = /["'`]((?:\/?_next\/)?static\/chunks\/[^"'`\s\\]+?\.js)["'`]/g;
export function extractChunkPaths(src) {
    const out = new Set();
    if (typeof src !== "string" || !src.includes("static/chunks/")) return out;
    CHUNK_PATH_RE.lastIndex = 0;
    for (const m of src.matchAll(CHUNK_PATH_RE)) out.add(m[1].replace(/^\/?_next\//, ""));
    return out;
}

/** 从一次 TURBOPACK.push 的参数里取出 [模块 ID, 工厂];支持 [头, id, fn, id, fn…] 和 { id: fn } 两种写法 */
export function factoriesFromChunk(chunk, out = new Map()) {
    if (!chunk || typeof chunk !== "object") return out;
    const list = Array.isArray(chunk) ? chunk : [chunk];
    for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (typeof v === "function") {
            // 一个工厂前面可以有几个 ID(别名)
            for (let j = i - 1; j > 0 && (typeof list[j] === "number" || typeof list[j] === "string"); j--) out.set(list[j], v);
        } else if (v && typeof v === "object" && !Array.isArray(v) && i > 0) {
            for (const [k, f] of Object.entries(v)) if (typeof f === "function") out.set(isNaN(+k) ? k : +k, f);
        }
    }
    return out;
}

// ---------- 静态检查 ----------
function countGroups(source, flags = "") {
    try { return new RegExp(source + "|", flags.replace(/[gy]/g, "")).exec("").length - 1; } catch { return -1; }
}
function namedGroups(source) {
    return new Set([...source.matchAll(/\(\?<([A-Za-z_$][\w$]*)>/g)].map(m => m[1]));
}

/**
 * 静态检查一条补丁定义。返回 [{ severity: "error" | "warn", message, where }]
 * where:"find" 或 "replacement[i]"
 */
export function lintPatch(patch) {
    const issues = [];
    const add = (severity, where, message) => issues.push({ severity, where, message });
    if (!patch || typeof patch !== "object") { add("error", "patch", "补丁不是对象"); return issues; }
    const finds = Array.isArray(patch.find) ? patch.find : [patch.find];
    if (!finds.length || finds.some(f => f == null || f === "")) add("error", "find", "find 为空");
    for (const f of finds) {
        if (typeof f === "string" && f.length > 0 && f.length < FIND_SHORT) add("warn", "find", `find "${f}" 太短,容易误中别的模块`);
        if (typeof f === "string" && f.includes("\\i")) add("warn", "find", "字符串 find 里的 \\i 不会展开,要用正则");
        if (f instanceof RegExp) {
            try { canonicalizeRegex(f); } catch (e) { add("error", "find", `find 正则展开 \\i 后无法编译:${e.message}`); }
            if (f.flags.includes("g")) add("warn", "find", "find 正则带 g 标志,多次测试时结果会受 lastIndex 影响");
        }
    }
    const reps = Array.isArray(patch.replacement) ? patch.replacement : patch.replacement ? [patch.replacement] : [];
    if (!reps.length) add("error", "replacement", "没有 replacement");
    reps.forEach((r, i) => {
        const where = `replacement[${i}]`;
        if (!r || r.match == null || r.match === "") { add("error", where, "match 为空"); return; }
        if (r.replace == null) add("error", where, "replace 为空");
        const m = r.match;
        if (typeof m === "string") {
            if (m.includes("\\i")) add("warn", where, "字符串 match 里的 \\i 不会展开,要用正则");
            if (m.length > MATCH_LONG) add("warn", where, `match 超过 ${MATCH_LONG} 个字符,站点改版时容易整条失配`);
            if (typeof r.replace === "string" && /\$[1-9<]/.test(r.replace)) add("error", where, "match 是字符串,没有捕获组,replace 里的 $n / $<name> 不会替换");
            return;
        }
        if (!(m instanceof RegExp)) { add("error", where, "match 必须是字符串或正则"); return; }
        let expanded;
        try { expanded = canonicalizeRegex(m); } catch (e) { add("error", where, `match 正则展开 \\i 后无法编译:${e.message}`); return; }
        const groups = countGroups(expanded.source, expanded.flags);
        if (groups > MAX_CAPTURE_WARN) add("warn", where, `match 有 ${groups} 个捕获组,超过 ${MAX_CAPTURE_WARN} 个时建议改用 (?:…) 或拆成几条`);
        if (m.source.length > MATCH_LONG) add("warn", where, `match 超过 ${MATCH_LONG} 个字符,站点改版时容易整条失配`);
        if (/(^|[^\\])\.[*+](?!\?)/.test(m.source)) add("warn", where, "match 里有贪婪的 .* / .+,可能一路吞到很远的位置;建议改成 .{0,N}? 这类有界的非贪婪写法");
        if (typeof r.replace === "string") {
            const refs = [...r.replace.matchAll(/\$(\d{1,2})/g)].map(x => +x[1]).filter(n => n > 0);
            const bad = [...new Set(refs.filter(n => n > groups))];
            if (bad.length) add("error", where, `replace 引用了 ${bad.map(n => "$" + n).join("、")},但 match 只有 ${groups} 个捕获组`);
            const names = namedGroups(m.source);
            const badNames = [...r.replace.matchAll(/\$<([^>]+)>/g)].map(x => x[1]).filter(n => !names.has(n));
            if (badNames.length) add("error", where, `replace 引用了不存在的命名组 ${badNames.map(n => `$<${n}>`).join("、")}`);
        }
    });
    return issues;
}

// ---------- 逐条测试 ----------
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function runPredicate(pred) {
    if (typeof pred !== "function") return { ok: true };
    try { return { ok: !!pred() }; } catch (e) { return { ok: false, error: String(e) }; }
}

function testOne(src, reps) {
    let code = src;
    const statuses = [];
    for (const r of reps) {
        const match = canonicalizeRegex(r.match);
        const pred = runPredicate(r.predicate);
        if (!pred.ok) { statuses.push({ match: String(r.match), status: "skipped" }); continue; }
        try {
            if (match instanceof RegExp) match.lastIndex = 0;
            const hit = typeof match === "string" ? code.includes(match) : match.test(code);
            if (match instanceof RegExp) match.lastIndex = 0;
            if (!hit) { statuses.push({ match: String(r.match), status: "noEffect", noWarn: !!r.noWarn }); continue; }
            // replace 里的 $self 只影响运行时,这里换成占位表达式,保证补丁后的代码仍能解析
            const rep = typeof r.replace === "function"
                ? (...a) => String(r.replace(...a)).replaceAll("$self", "globalThis.$self")
                : String(r.replace).replaceAll("$self", "globalThis.$self");
            const next = code.replace(match, rep);
            statuses.push({ match: String(r.match), status: next === code ? "noEffect" : "applied", noWarn: !!r.noWarn });
            code = next;
        } catch (e) {
            statuses.push({ match: String(r.match), status: "error", error: String(e) });
        }
    }
    return { code, statuses };
}

/**
 * @param entries [{ plugin, index, patch, enabled? }]
 * @param modules Map 或 [[id, 源码]];源码是工厂函数的文本
 * @param options.syntaxCheck (code) => 错误信息 | null;给了就检查补丁后的代码能否解析
 * @returns {{ summary, results }}
 */
export function checkPatches(entries, modules, { syntaxCheck } = {}) {
    const mods = [...(modules instanceof Map ? modules.entries() : modules)].filter(([, s]) => typeof s === "string");
    const results = [];
    for (const { plugin, index, patch, enabled = true } of entries) {
        const r = { plugin, index, enabled, find: describeFind(patch?.find), status: "ok", modules: [], replacements: [], issues: lintPatch(patch), ms: 0 };
        results.push(r);
        if (r.issues.some(i => i.severity === "error")) { r.status = "invalid"; continue; }
        const pred = runPredicate(patch.predicate);
        if (!pred.ok) { r.status = "skipped"; if (pred.error) r.issues.push({ severity: "warn", where: "predicate", message: `predicate 抛出异常:${pred.error}` }); continue; }
        const find = canonicalizeFind(patch.find);
        const t0 = now();
        for (const [id, src] of mods) { try { if (matchesFind(src, find)) r.modules.push(id); } catch { /* 忽略 */ } }
        r.ms = Math.round((now() - t0) * 100) / 100;
        if (!r.modules.length) { r.status = patch.noWarn ? "skipped" : "notFound"; continue; }
        if (r.modules.length > 1 && !patch.all) r.issues.push({ severity: "warn", where: "find", message: `find 命中 ${r.modules.length} 个模块(${r.modules.slice(0, 5).join(", ")}${r.modules.length > 5 ? "…" : ""}),只会补先加载的那一个;要么收紧 find,要么写 all: true` });
        const reps = Array.isArray(patch.replacement) ? patch.replacement : [patch.replacement];
        const targets = patch.all ? r.modules : r.modules.slice(0, 1);
        const srcOf = new Map(mods);
        for (const id of targets) {
            const src = srcOf.get(id);
            const { code, statuses } = testOne(src, reps);
            const failed = statuses.some(s => s.status === "error" || (s.status === "noEffect" && !s.noWarn && !patch.noWarn));
            r.replacements.push({ moduleId: id, statuses });
            if (failed) r.status = patch.group ? "groupReverted" : "partial";
            if (code !== src && syntaxCheck) {
                const err = syntaxCheck(code);
                if (err) { r.status = "syntaxError"; r.issues.push({ severity: "error", where: `module ${id}`, message: `补丁后的代码无法解析:${err}` }); }
            }
        }
    }
    const bad = results.filter(x => x.status !== "ok" && x.status !== "skipped");
    return {
        summary: {
            total: results.length,
            ok: results.filter(x => x.status === "ok").length,
            failed: bad.length,
            skipped: results.filter(x => x.status === "skipped").length,
            warnings: results.reduce((n, x) => n + x.issues.filter(i => i.severity === "warn").length, 0),
            modules: mods.length,
        },
        results,
    };
}

/** 失败项的一行说明(命令行和控制台输出用) */
export function describeResult(r) {
    const head = `${r.plugin}#${r.index}${r.enabled === false ? "(已停用)" : ""} ${r.find}`;
    const why = {
        notFound: "find 没有命中任何模块",
        partial: "有替换没有生效",
        groupReverted: "成组补丁有替换没有生效,运行时会整组撤销",
        syntaxError: "补丁后的代码无法解析",
        invalid: "补丁定义有错误",
    }[r.status];
    const reps = r.replacements.flatMap(x => x.statuses.filter(s => s.status !== "applied" && s.status !== "skipped").map(s => `    ${s.status} ${s.match}${s.error ? ` (${s.error})` : ""}(模块 ${x.moduleId})`));
    const issues = r.issues.map(i => `    ${i.severity === "error" ? "错误" : "提示"} ${i.where}:${i.message}`);
    return [why ? `${head}:${why}` : head, ...reps, ...issues].join("\n");
}

// ---------- 爬取懒加载分块 ----------
/**
 * @param options.sources   Map id -> 源码(已知模块;新找到的模块会加进去)
 * @param options.seeds     额外的分块路径(例如页面 <script> 里的)
 * @param options.loaded    已加载过的分块路径(不再取)
 * @param options.fetchText (路径) => Promise<文本>
 * @param options.evaluate  (分块文本) => [push 参数…](在隔离环境里执行分块,只收集 TURBOPACK.push 的参数)
 * @param options.limit     最多取多少个分块,缺省 3000
 * @param options.onProgress ({ done, queued }) => 无返回值
 */
export async function crawlChunks({ sources, seeds = [], loaded = [], fetchText, evaluate, limit = 3000, concurrency = 8, onProgress }) {
    const seen = new Set(loaded.map(p => String(p).replace(/^\/?_next\//, "")));
    const queue = [];
    const failed = [];
    const enqueue = p => { if (!seen.has(p)) { seen.add(p); queue.push(p); } };
    for (const s of seeds) enqueue(String(s).replace(/^\/?_next\//, ""));
    for (const src of sources.values()) for (const p of extractChunkPaths(src)) enqueue(p);
    let done = 0;
    const worker = async () => {
        while (queue.length && done < limit) {
            const path = queue.shift();
            done++;
            let text;
            try { text = await fetchText(path); } catch (e) { failed.push({ path, error: String(e?.message || e) }); continue; }
            for (const p of extractChunkPaths(text)) enqueue(p);
            let pushes = [];
            try { pushes = evaluate(text) || []; } catch (e) { failed.push({ path, error: `解析失败:${e?.message || e}` }); continue; }
            for (const chunk of pushes) {
                for (const [id, f] of factoriesFromChunk(chunk)) {
                    if (sources.has(id)) continue;
                    let src;
                    try { src = Function.prototype.toString.call(f); } catch { continue; }
                    sources.set(id, src);
                    for (const p of extractChunkPaths(src)) enqueue(p);
                }
            }
            onProgress?.({ done, queued: queue.length });
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { chunks: done, failed, truncated: queue.length > 0 };
}
