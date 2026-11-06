// 补丁的规范化与应用(纯字符串操作,不碰页面)
import { Logger } from "./logger.js";
import { IS_DEV, INSTANCE_EXPR } from "../env.js";

const logger = new Logger("Patcher", "#c4b5fd");

const IDENT = "(?:[A-Za-z_$][\\w$]*)";

/** 把正则源码里的 \i 展开成标识符片段;已转义的 \\i 不展开 */
export function expandIdent(source) {
    let out = "";
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (c === "\\") {
            const n = source[i + 1];
            if (n === "i") out += IDENT;
            else out += c + (n ?? "");
            i++;
        } else out += c;
    }
    return out;
}

export function canonicalizeRegex(re) {
    if (!(re instanceof RegExp)) return re;
    if (re.$$usppCanonical) return re;
    const expanded = new RegExp(expandIdent(re.source), re.flags);
    const original = re.toString();
    Object.defineProperty(expanded, "toString", { value: () => original, configurable: true });
    Object.defineProperty(expanded, "$$usppCanonical", { value: true });
    return expanded;
}

export function canonicalizeFind(find) {
    if (Array.isArray(find)) return find.map(canonicalizeRegex);
    return canonicalizeRegex(find);
}

export function matchesOne(code, f) {
    if (typeof f === "string") return code.includes(f);
    if (f instanceof RegExp) { f.lastIndex = 0; return f.test(code); }
    return false;
}

export function matchesFind(code, find) {
    if (Array.isArray(find)) return find.length > 0 && find.every(f => matchesOne(code, f));
    return matchesOne(code, find);
}

export const describeFind = find => Array.isArray(find) ? find.map(String).join(" & ") : String(find);

/** 补丁里 $self 展开成的表达式:经本脚本自己的实例找到插件对象(不用共用的全局名字) */
export const selfExpr = name => `${INSTANCE_EXPR}.plugins[${JSON.stringify(name)}]`;

function countGroups(re) {
    try { return new RegExp(re.source + "|").exec("").length - 1; } catch { return 0; }
}

export function canonicalizeReplacement(r, pluginName, self = selfExpr(pluginName)) {
    const match = canonicalizeRegex(r.match);
    let replace = r.replace;
    if (typeof replace === "string") {
        if (IS_DEV && match instanceof RegExp) {
            const refs = [...replace.matchAll(/\$(\d+)/g)].map(m => +m[1]);
            const max = refs.length ? Math.max(...refs) : 0;
            if (max > countGroups(match)) logger.warn(`${pluginName}: 替换引用了 $${max},但 match 只有 ${countGroups(match)} 个捕获组`, String(match));
        }
        replace = replace.replaceAll("$self", self);
    } else if (typeof replace === "function") {
        const fn = replace;
        replace = (...args) => String(fn(...args)).replaceAll("$self", self);
    }
    return { ...r, match, replace };
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

let seq = 0;
/** 返回登记用的补丁记录 */
export function canonicalizePatch(patch, pluginName, checkOnly = false, self) {
    const reps = Array.isArray(patch.replacement) ? patch.replacement : patch.replacement ? [patch.replacement] : [];
    return {
        id: ++seq,
        plugin: pluginName,
        find: canonicalizeFind(patch.find),
        rawFind: patch.find,
        replacement: reps.map(r => canonicalizeReplacement(r, pluginName, self)),
        all: !!patch.all,
        group: !!patch.group,
        noWarn: !!patch.noWarn,
        predicate: patch.predicate,
        checkOnly,
        consumed: false,
    };
}

export function runPredicate(pred, label) {
    if (typeof pred !== "function") return true;
    try { return !!pred(); } catch (e) { logger.error(`${label} 的 predicate 抛出异常`, e); return false; }
}

/**
 * 对一段工厂源码依次尝试所有补丁。
 * @returns {{ code, applied: string[], results: object[], mismatches: object[] }}
 */
// ---------- 预筛 ----------
// 绝大多数模块不命中任何补丁。把补丁 find 里一定会出现的字面量合成一个正则,每个模块先扫一遍:
// 一个字面量都没有时,这些补丁整体跳过,不再逐条测试。预筛只决定"跳过",命中后仍逐条完整匹配。

/** 正则里一定会出现的最长字面量(只看顶层;有顶层 | 、忽略大小写时没有) */
export function requiredLiteral(re) {
    if (!(re instanceof RegExp) || re.flags.includes("i")) return null;
    const src = re.source;
    let best = "", run = "", depth = 0;
    const flush = () => { if (run.length > best.length) best = run; run = ""; };
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === "\\") {
            const n = src[i + 1];
            i++;
            if (n === undefined) break;
            if (depth === 0 && /[^\w]/.test(n)) {
                // 转义的符号是字面量,但后面跟可选量词时不一定出现
                if ("?*{".includes(src[i + 1])) flush(); else run += n;
            } else {
                if (depth === 0) flush();
                // 带参数的转义:\xHH、\uHHHH / \u{…}、\cX、\k<名字>、\p{…}、反向引用 \12,参数不是字面量
                const skip = { x: /^[0-9a-fA-F]{0,2}/, u: /^(\{[^}]*\}|[0-9a-fA-F]{0,4})/, c: /^[A-Za-z]?/, k: /^<[^>]*>/, p: /^\{[^}]*\}/, P: /^\{[^}]*\}/ }[n] ?? (/\d/.test(n) ? /^\d*/ : null);
                if (skip) i += skip.exec(src.slice(i + 1))[0].length;
            }
            continue;
        }
        if (c === "[") {
            // 跳过字符类
            flush();
            for (i++; i < src.length && src[i] !== "]"; i++) if (src[i] === "\\") i++;
            continue;
        }
        if (c === "(") { if (depth === 0) flush(); depth++; continue; }
        if (c === ")") { depth = Math.max(0, depth - 1); continue; }
        if (depth > 0) continue;
        if (c === "|") return null;
        if (c === "?" || c === "*" || c === "{") { run = run.slice(0, -1); flush(); if (c === "{") { while (i < src.length && src[i] !== "}") i++; } continue; }
        if (c === "+") { flush(); continue; }
        if (c === "." || c === "^" || c === "$") { flush(); continue; }
        run += c;
    }
    flush();
    return best.length >= 3 ? best : null;
}

/** 一条补丁的 find 里一定会出现的字面量;取不到时返回 null(这条补丁不参与预筛) */
function literalOfFind(find) {
    const one = f => (typeof f === "string" ? (f.length ? f : null) : requiredLiteral(f));
    if (!Array.isArray(find)) return one(find);
    let best = null;
    for (const f of find) { const l = one(f); if (l && (!best || l.length > best.length)) best = l; }
    return best;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const prefilters = new WeakMap(); // 补丁列表 -> { length, re, members }
function prefilterOf(patchList) {
    let pf = prefilters.get(patchList);
    if (pf && pf.length === patchList.length) return pf;
    const members = new Set(), lits = new Set();
    for (const p of patchList) {
        const lit = literalOfFind(p.find);
        if (!lit) continue;
        members.add(p);
        lits.add(lit);
    }
    pf = { length: patchList.length, members, re: lits.size ? new RegExp([...lits].map(escapeRe).join("|")) : null };
    prefilters.set(patchList, pf);
    return pf;
}

export function applyPatches(moduleId, source, patchList, stats) {
    let code = source;
    const appliedPlugins = new Set();
    const results = [];
    const mismatches = [];
    const pf = prefilterOf(patchList);
    // 一个字面量都不出现:参与预筛的补丁都不可能命中
    const skipMembers = !!pf.re && !pf.re.test(source);

    for (const p of patchList) {
        if (p.consumed) continue;
        // 前面的补丁改过代码后,后面补丁的 find 可能匹配新代码:这时不再用预筛结果
        if (skipMembers && code === source && pf.members.has(p)) continue;
        if (!runPredicate(p.predicate, p.plugin)) continue;
        let hit;
        const t0 = IS_DEV ? now() : 0;
        try { hit = matchesFind(code, p.find); } catch (e) { logger.error(`${p.plugin}: find 出错`, e); continue; }
        // 开发构建:累计每条补丁 find 的耗时(所有模块加起来),健康报告里列出最慢的几条
        if (IS_DEV) p.ms = (p.ms || 0) + (now() - t0);
        if (!hit) continue;
        if (!p.all) p.consumed = true;

        if (p.checkOnly) {
            for (const r of p.replacement) {
                if (!matchesOne(code, r.match)) mismatches.push({ plugin: p.plugin, find: describeFind(p.rawFind), match: String(r.match), moduleId });
            }
            continue;
        }

        const before = code;
        const statuses = [];
        let failed = false;
        for (const r of p.replacement) {
            if (!runPredicate(r.predicate, p.plugin)) { statuses.push({ match: String(r.match), status: "skipped" }); continue; }
            try {
                if (r.match instanceof RegExp) r.match.lastIndex = 0;
                const next = code.replace(r.match, r.replace);
                if (next === code) {
                    statuses.push({ match: String(r.match), status: "noEffect" });
                    stats.noEffect++;
                    failed = true;
                    if (!p.noWarn && !r.noWarn) logger.warn(`${p.plugin}: 替换无效果(模块 ${moduleId})`, describeFind(p.rawFind), String(r.match));
                } else {
                    code = next;
                    statuses.push({ match: String(r.match), status: "applied" });
                }
            } catch (e) {
                statuses.push({ match: String(r.match), status: "error", error: String(e) });
                stats.errors++;
                failed = true;
                logger.error(`${p.plugin}: 替换出错(模块 ${moduleId})`, describeFind(p.rawFind), e);
            }
        }
        if (p.group && failed) {
            code = before;
            for (const s of statuses) if (s.status === "applied" || s.status === "noEffect") s.status = "reverted";
            if (!p.noWarn) logger.warn(`${p.plugin}: 成组补丁未全部生效,已撤销(模块 ${moduleId})`, describeFind(p.rawFind));
        }
        const appliedCount = statuses.filter(s => s.status === "applied").length;
        // stats.applied 只在补丁后的代码真正执行后才计入(见 turbopack.js)
        if (appliedCount) appliedPlugins.add(p.plugin);
        results.push({ plugin: p.plugin, find: describeFind(p.rawFind), moduleId, replacements: statuses });
    }
    return { code, applied: [...appliedPlugins], results, mismatches };
}
