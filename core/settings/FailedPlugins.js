// 加载失败汇总:启动结束后仍有启用但没能启动的插件时,弹一条提示,点开列出错误和堆栈,可以直接停用
import { h, useState } from "../ui/react.js";
import { openModal, ModalCard } from "../ui/modal.js";
import { Button } from "../ui/components.js";
import { showNotice } from "../ui/toast.js";
import { plugins, isPluginEnabled, togglePlugin } from "../lib/plugins.js";

export const failedPlugins = () => Object.values(plugins).filter(p => isPluginEnabled(p.name) && !p.started && p.startError);

const errText = e => (e?.stack || `${e?.name ?? "Error"}: ${e?.message ?? e}`);

function FailedList({ onClose }) {
    const [, force] = useState(0);
    const list = failedPlugins();
    return h(ModalCard, { title: "Plugins that failed to start", subtitle: "Each one is still enabled. Disable it if it keeps failing.", onClose, width: 720 },
        list.length ? list.map(p => h("div", { key: p.name, className: "uspp-section uspp-failed", "data-uspp-failed": p.name },
            h("div", { className: "uspp-row" },
                h("div", { className: "uspp-row-text" },
                    h("div", { className: "uspp-row-title" }, p.name),
                    h("div", { className: "uspp-muted uspp-small" }, String(p.startError?.message ?? p.startError))),
                !p.required && h(Button, { size: "sm", variant: "danger", onClick: () => { togglePlugin(p.name); force(x => x + 1); } }, "Disable")),
            h("pre", { className: "uspp-stack" }, errText(p.startError)))) : h("div", { className: "uspp-empty" }, "All plugins are running now."));
}

export const openFailedList = () => openModal(({ onClose }) => h(FailedList, { onClose }), { modalKey: "uspp-failed-plugins" });

/** 有失败的插件时显示提示;返回失败数 */
export function showFailureSummary() {
    const list = failedPlugins();
    if (!list.length) return 0;
    showNotice({
        type: "WARNING",
        message: `${list.length} plugin${list.length === 1 ? "" : "s"} failed to start: ${list.map(p => p.name).join(", ")}`,
        action: { label: "Details", onClick: openFailedList },
    });
    return list.length;
}
