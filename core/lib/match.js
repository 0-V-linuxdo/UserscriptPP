// 网址模式匹配(站点的 matches / excludeMatches)

const reCache = new Map();
const globToRe = (s, any) => s.split("*").map(x => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(any);

/**
 * 支持的写法:"*" 或 "<all_urls>"(所有网站);"*://example.com/*" 这类匹配模式(主机可写 "*.example.com");
 * 只写主机名 "example.com"(含子域名,任意路径)。
 */
function compile(pattern) {
    const p = String(pattern || "").trim();
    if (!p) return null;
    if (p === "*" || p === "<all_urls>" || p === "*://*/*") return /^/;
    const m = /^(\*|https?|file):\/\/([^/]*)(\/.*)?$/.exec(p);
    if (!m) {
        const h = p.replace(/^\*\./, "");
        return new RegExp(`^https?://([^/]*\\.)?${globToRe(h, "[^/]*")}(?::\\d+)?(/|$)`, "i");
    }
    const [, scheme, hostPat, path = "/*"] = m;
    const sch = scheme === "*" ? "https?" : scheme;
    let hostRe;
    if (hostPat === "*") hostRe = "[^/]*";
    else if (hostPat.startsWith("*.")) hostRe = `([^/]*\\.)?${globToRe(hostPat.slice(2), "[^/]*")}`;
    else hostRe = globToRe(hostPat, "[^/]*");
    return new RegExp(`^${sch}://${hostRe}(?::\\d+)?${globToRe(path, ".*")}$`, "i");
}

export function matchPattern(pattern, url = location.href) {
    let re = reCache.get(pattern);
    if (re === undefined) { re = compile(pattern); reCache.set(pattern, re); }
    return !!re && re.test(url);
}

export function matchesUrl(patterns, url = location.href) {
    const list = Array.isArray(patterns) ? patterns : typeof patterns === "string" ? [patterns] : [];
    return list.some(p => matchPattern(p, url));
}

/** 模式的具体程度:主机名不含通配的优先,路径更长的优先 */
export function specificity(pattern) {
    const p = String(pattern || "");
    if (p === "*" || p === "<all_urls>") return 0;
    const m = /^[^:]+:\/\/([^/]*)(\/.*)?$/.exec(p);
    const host = m ? m[1] : p;
    const path = m ? (m[2] || "") : "";
    return (host.includes("*") ? 0 : 10000) + host.replace(/\*/g, "").length * 10 + path.replace(/\*/g, "").length;
}

/** 用户输入的"逗号或换行分隔"文本 <-> 模式数组 */
export const parseMatches = text => String(text || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean);
export const formatMatches = list => (Array.isArray(list) ? list : []).join(", ");
