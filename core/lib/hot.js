// 热重载客户端(只在 --hot 的开发构建里):长轮询本机的构建服务,只改了一个插件时原地替换它,其余改动提示重新安装。
// 走 GM_xmlhttpRequest:不受页面 CSP 的 connect-src 和跨域限制
import { GM, SCRIPT_ID } from "../env.js";
import { Logger } from "./logger.js";

const logger = /* @__PURE__ */ new Logger("Hot", "#fcd34d");

/** onPlugin(ev) 替换插件;onFull(reason) 需要整体更新 */
export function startHotClient(url, { onPlugin, onFull }) {
    if (!url || !GM.xhr) return () => { };
    let v = -1, fails = 0, stopped = false, timer = 0;
    const later = () => {
        if (stopped) return;
        if (++fails === 1) logger.info(`连不上热重载服务 ${url},稍后重试`);
        timer = setTimeout(poll, Math.min(30000, 1000 * 2 ** Math.min(fails, 5)));
    };
    const handle = ev => {
        if (Array.isArray(ev.scripts) && !ev.scripts.includes(SCRIPT_ID)) return;
        if (ev.type === "plugin") {
            try { onPlugin(ev); } catch (e) { logger.error(`热替换 ${ev.name} 失败`, e); onFull(`${ev.name}:${e?.message ?? e}`); }
        } else if (ev.type === "full") onFull(ev.reason || "");
    };
    function poll() {
        if (stopped) return;
        GM.xhr({
            method: "GET", url: `${url}/wait?v=${v}`, timeout: 35000, responseType: "text",
            onload: r => {
                let d;
                try { d = JSON.parse(r.responseText); } catch { return later(); }
                if (fails) logger.info("已连上热重载服务");
                fails = 0;
                // 第一次连上只记下当前版本
                if (v >= 0) for (const ev of d.events || []) handle(ev);
                v = Number(d.v) || 0;
                poll();
            },
            onerror: later,
            ontimeout: poll,
        });
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
}

/** 把服务推来的代码执行成插件定义:代码返回定义对象,或 U => 定义 */
export function evalPluginChunk(code, U) {
    // eslint-disable-next-line no-new-func
    const raw = new Function("U", code)(U);
    return typeof raw === "function" ? raw(U) : raw;
}
