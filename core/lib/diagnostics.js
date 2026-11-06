// 诊断信息:汇总成一段文字,方便用户提问题时附上。不含设置值
import { W, GM, VERSION, BUILD_TYPE, SCRIPT_ID, SCRIPT_NAME, API_VERSION } from "../env.js";
import { plugins, isPluginEnabled } from "./plugins.js";
import { getSite } from "./sites.js";
import { recentLogs } from "./logger.js";
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
        `${SCRIPT_NAME} ${VERSION} (${BUILD_TYPE}) · script ID ${SCRIPT_ID} · API ${API_VERSION}`,
        `Script manager: ${info?.scriptHandler ?? "unknown"} ${info?.version ?? ""}`.trim(),
        `Browser: ${ua}`,
        `Site: ${getSite().id} · ${(() => { try { return W.location.origin + W.location.pathname; } catch { return "?"; } })()}`,
        `Safe mode: ${isSafeMode() ? `on (${safeModeReason()})` : "off"}`,
        `Plugins: ${enabled.length} enabled of ${all.length}`,
        `Enabled: ${enabled.map(p => p.name + (p.started ? "" : " (not started)")).join(", ") || "none"}`,
        `Failed to start: ${failed.map(p => `${p.name}: ${p.startError?.message ?? "unknown"}`).join("; ") || "none"}`,
    ];
    if (patches) lines.push(`Patches: ${JSON.stringify(patches)}`);
    const logs = recentLogs();
    lines.push(`Recent warnings and errors (${logs.length}):`);
    for (const l of logs) lines.push(`  ${l.at} [${l.level}] ${l.source}: ${l.text}`);
    return lines.join("\n");
}
