// 站点适配:定义、注册、选择当前站点
import { Logger } from "./logger.js";
import { matchesUrl, specificity } from "./match.js";

const logger = new Logger("Sites", "#5eead4");

/** 没有站点匹配时的通用站点:只有核心 */
export const GENERIC = Object.freeze({ id: "generic", name: "Generic", matches: [], generic: true });

const registry = new Map(); // id -> def
let current = null;
let runtimeSwitchListeners = new Set();

const ID_RE = /^[a-z0-9-]+$/;

export function defineSite(def) {
    if (!def || typeof def !== "object") throw new Error("defineSite 需要一个对象");
    if (!ID_RE.test(def.id || "")) throw new Error(`站点 ID 只能是小写字母、数字和 -:${def.id}`);
    if (def.id === GENERIC.id) throw new Error("generic 是保留的站点 ID");
    if (!def.name) throw new Error(`站点 ${def.id} 缺少 name`);
    if (!Array.isArray(def.matches) || !def.matches.length) throw new Error(`站点 ${def.id} 缺少 matches`);
    return def;
}

export function addSite(def, { runtime = false } = {}) {
    defineSite(def);
    if (registry.has(def.id)) { logger.warn(`站点 ${def.id} 已注册,忽略`); return false; }
    if (runtime && def.driver) {
        logger.warn(`运行时注册的站点 ${def.id} 不能使用打包器驱动,已忽略 driver`);
        def = { ...def, driver: undefined };
    }
    registry.set(def.id, def);
    return true;
}

const score = (def, url) => {
    if (!matchesUrl(def.matches, url)) return -1;
    if (def.excludeMatches && matchesUrl(def.excludeMatches, url)) return -1;
    return Math.max(...def.matches.filter(p => matchesUrl([p], url)).map(specificity));
};

/** 每个页面最多一个当前站点:模式更具体的优先,并列时注册顺序靠前的 */
export function pickSite(url = location.href, candidates = [...registry.values()]) {
    let best = null, bestScore = -1, tie = false;
    for (const def of candidates) {
        const s = score(def, url);
        if (s < 0) continue;
        if (s > bestScore) { best = def; bestScore = s; tie = false; }
        else if (s === bestScore) tie = true;
    }
    if (best && tie) logger.warn(`多个站点同样匹配当前网址,使用 ${best.id}`);
    return best;
}

export function selectSite(url = location.href) {
    current = pickSite(url) || GENERIC;
    return current;
}

export const getSite = () => current || GENERIC;
export const isGeneric = () => getSite() === GENERIC;
export const isSite = id => getSite().id === id;
export const getSites = () => [...registry.values()];
export const getSiteById = id => registry.get(id) || (id === GENERIC.id ? GENERIC : null);

/** 设置里按站点分区的键:适配站点用站点 ID,通用站点用当前网站的主机名 */
export const siteKey = () => (isGeneric() ? (location.hostname || "local") : getSite().id);

/** 运行时注册:当前是通用站点且新站点匹配时切换过去 */
export function switchTo(def) {
    if (!isGeneric() || current === def) return false;
    if (pickSite(location.href, [def]) !== def) return false;
    current = def;
    for (const fn of [...runtimeSwitchListeners]) { try { fn(def); } catch (e) { logger.error("站点切换监听者出错", e); } }
    return true;
}
export const onSiteSwitch = fn => { runtimeSwitchListeners.add(fn); return () => runtimeSwitchListeners.delete(fn); };
