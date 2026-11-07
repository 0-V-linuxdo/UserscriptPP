// 诊断信息:汇总成一段文字,方便用户提问题时附上。不含设置值
import { W, GM, missingCapabilities, VERSION, FRAMEWORK_VERSION, BUILD_TYPE, SCRIPT_ID, SCRIPT_NAME, API_VERSION } from "../env.js";
import { plugins, isPluginEnabled, slowestStarts } from "./plugins.js";
import { getSite } from "./sites.js";
import { recentLogs } from "./logger.js";
import { pluginErrorStats } from "./plugin-errors.js";
import { blockedRequests } from "./net.js";
import { isSafeMode, safeModeReason } from "./safemode.js";

let patchSummary = () => null;
/** 由入口注入:补丁报告的摘要 */
export function setPatchSummary(fn) { patchSummary = fn; }

export function collectDiagnostics() {
    const info = GM.info;
    const ua = (() => { try { return W.navigator.userAgent; } catch { return "?"; } })();
    const all = Object.values(plugins);
    const enabled = all.filter(p => isPluginEnabled(p.name));
    const failed = enabled.filter(p => !p.started);
    let patches = null;
    try { patches = patchSummary(); } catch { patches = null; }
    const lines = [
        `${SCRIPT_NAME} ${VERSION} (${BUILD_TYPE}) · script ID ${SCRIPT_ID} · Userscript++ ${FRAMEWORK_VERSION} · API ${API_VERSION}`,
        `Script manager: ${`${info?.scriptHandler ?? "unknown"} ${info?.version ?? ""}`.trim()}${missingCapabilities().length ? ` · missing: ${missingCapabilities().join(", ")}` : ""}`,
        `Browser: ${ua}`,
        `Site: ${getSite().id} · ${(() => { try { return W.location.origin + W.location.pathname; } catch { return "?"; } })()}`,
        `Safe mode: ${isSafeMode() ? `on (${safeModeReason()})` : "off"}`,
        `Plugins: ${enabled.length} enabled of ${all.length}`,
        `Enabled: ${enabled.map(p => p.name + (p.started ? "" : " (not started)")).join(", ") || "none"}`,
        `Failed to start: ${failed.map(p => `${p.name}: ${p.startError?.message ?? "unknown"}`).join("; ") || "none"}`,
    ];
    const blocked = blockedRequests();
    if (blocked.length) lines.push(`Blocked requests: ${[...new Set(blocked.map(b => b.plugin ? `${b.host} (${b.plugin})` : b.host))].join(", ")}`);
    const errs = pluginErrorStats();
    if (errs.length) lines.push(`Runtime errors: ${errs.slice(0, 8).map(e => `${e.name} ×${e.count}${e.tripped ? " (turned off)" : ""}: ${e.last?.where ?? "?"}: ${e.last?.message ?? ""}`.slice(0, 200)).join("; ")}`);
    const slow = slowestStarts(5);
    if (slow.length) lines.push(`Slowest starts: ${slow.map(s => `${s.name} ${s.ms} ms`).join(", ")}`);
    if (patches) lines.push(`Patches: ${JSON.stringify(patches)}`);
    const logs = recentLogs();
    lines.push(`Recent warnings and errors (${logs.length}):`);
    for (const l of logs) lines.push(`  ${l.at} [${l.level}] ${l.source}: ${l.text}`);
    return lines.join("\n");
}

// ---------- 报告问题 ----------
// 只打开浏览器页面,由用户自己看过、改过再提交;什么都不自动上传
const MAX_URL = 7000;

/** supportURL 是 GitHub 仓库(或它的 issues 页)时,返回带标题和正文的新建 Issue 地址;否则 null */
export function githubIssueUrl(supportURL, title, body) {
    const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/.exec(String(supportURL || ""));
    if (!m) return null;
    const repo = m[2].replace(/\.git$/, "");
    return `https://github.com/${m[1]}/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** 新建 Issue 的正文:留出描述问题的地方,诊断信息放在折叠块里 */
export function issueBody(diagnostics) {
    return [
        "**What happened?**", "", "", "**Steps to reproduce**", "", "1. ", "",
        "<details><summary>Diagnostic info</summary>", "", "```", diagnostics, "```", "", "</details>",
    ].join("\n");
}

/**
 * 地址里放得下就把诊断信息直接填进新建 Issue 页;放不下时填一份截短的,并把完整的复制到剪贴板。
 * 不是 GitHub 地址时打开 supportURL,诊断信息复制到剪贴板。返回 { url, copied, truncated }
 */
export function reportIssueTarget(supportURL, diagnostics) {
    const title = `[${SCRIPT_NAME} ${VERSION}] `;
    let url = githubIssueUrl(supportURL, title, issueBody(diagnostics));
    if (!url) return { url: supportURL, copied: true, truncated: false };
    if (url.length <= MAX_URL) return { url, copied: false, truncated: false };
    let lines = diagnostics.split("\n");
    while (lines.length > 1 && url.length > MAX_URL) {
        lines = lines.slice(0, -1);
        url = githubIssueUrl(supportURL, title, issueBody([...lines, "… (truncated; the full text is on your clipboard)"].join("\n")));
    }
    return { url, copied: true, truncated: true };
}
