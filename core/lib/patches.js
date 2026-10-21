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
export function applyPatches(moduleId, source, patchList, stats) {
    let code = source;
    const appliedPlugins = new Set();
    const results = [];
    const mismatches = [];

    for (const p of patchList) {
        if (p.consumed) continue;
        if (!runPredicate(p.predicate, p.plugin)) continue;
        let hit;
        try { hit = matchesFind(code, p.find); } catch (e) { logger.error(`${p.plugin}: find 出错`, e); continue; }
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
