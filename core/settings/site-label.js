// 设置界面里对当前站点的称呼
import { getSite, isGeneric, getSiteById } from "../lib/sites.js";

export const siteLabel = () => (isGeneric() ? location.hostname || "this site" : getSite().name);
export const pluginSiteLabel = p => (p.site === "*" ? "All sites" : getSiteById(p.site)?.name ?? p.site);
