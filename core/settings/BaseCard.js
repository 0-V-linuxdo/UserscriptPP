// 插件 / 主题卡片的公共外框:上半部分(图标、名字、徽标、右侧控件、描述),分隔线,底栏
import { h } from "../ui/react.js";
import { classes } from "../lib/utils.js";

export function BaseCard({ className, attrs, name, icon, badges, description, controls, footer }) {
    return h("div", { ...attrs, className: classes("uspp-card", className) },
        h("div", { className: "uspp-card-body" },
            h("div", { className: "uspp-card-head" },
                h("div", { className: "uspp-card-title" },
                    icon != null && h("span", { className: "uspp-card-icon" }, icon),
                    h("span", { className: "uspp-card-name", title: name }, name),
                    badges),
                h("div", { className: "uspp-card-controls" }, controls)),
            description && h("div", { className: "uspp-card-desc", title: description }, description)),
        h("div", { className: "uspp-card-sep" }),
        h("div", { className: "uspp-card-foot" }, footer));
}
