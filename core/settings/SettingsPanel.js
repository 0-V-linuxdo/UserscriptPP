// 框架自有的设置面板:以弹窗形式挂在页面上,不依赖任何站点
import { h, useState } from "../ui/react.js";
import { openModal, closeModal, ModalCard } from "../ui/modal.js";
import { VERSION } from "../env.js";
import { SETTINGS_PAGES, pageByKey } from "./pages.js";
import { siteLabel } from "./site-label.js";
import { PluginModal } from "./PluginModal.js";
import { plugins } from "../lib/plugins.js";

export const PANEL_KEY = "uspp-settings-panel";

function SettingsPanel({ tab, onClose }) {
    const [cur, setCur] = useState(pageByKey(tab).key);
    const page = pageByKey(cur);
    return h(ModalCard, { title: "Userscript++", subtitle: `${VERSION} · ${siteLabel()}`, onClose, width: 860 },
        h("div", { className: "uspp-panel", "data-uspp-panel": "" },
            h("div", { className: "uspp-tabs", role: "tablist" }, SETTINGS_PAGES.map(p => h("button", {
                key: p.key, type: "button", role: "tab", className: "uspp-chip", "aria-selected": String(p.key === cur), "data-uspp-panel-tab": p.key, onClick: () => setCur(p.key),
            }, p.label))),
            h(page.component, { key: page.key })));
}

/** 打开框架面板;plugin 给出时在面板之上再打开该插件的配置 */
export function openSettingsPanel({ tab = "plugins", plugin } = {}) {
    openModal(({ onClose }) => h(SettingsPanel, { tab, onClose }), { modalKey: PANEL_KEY });
    const p = typeof plugin === "string" ? plugins[plugin] : plugin;
    if (p) openModal(({ onClose }) => h(PluginModal, { plugin: p, onClose }), { modalKey: `uspp-plugin-${p.name}` });
}

export const closeSettingsPanel = () => closeModal(PANEL_KEY);
