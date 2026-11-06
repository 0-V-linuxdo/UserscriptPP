// Notifications 页:本次页面里收到的通知(最近 50 条)
import { h, useSubscription } from "../ui/react.js";
import { Button } from "../ui/components.js";
import { getNotificationHistory, subscribeNotifications, clearNotificationHistory } from "../ui/notify.js";

const time = t => new Date(t).toLocaleTimeString();

export function NotificationsTab() {
    useSubscription(subscribeNotifications);
    const list = getNotificationHistory();
    return h("div", { className: "uspp-page", "data-uspp-page": "notifications" },
        h("div", { className: "uspp-row", style: { marginBottom: 8 } },
            h("div", { className: "uspp-muted uspp-small" }, "Notifications shown since this page was opened (latest 50)."),
            list.length > 0 && h(Button, { size: "sm", variant: "outline", onClick: clearNotificationHistory }, "Clear")),
        list.length ? h("div", { className: "uspp-section" }, list.map(n => h("div", {
            key: n.id, className: "uspp-row uspp-notify-log", "data-type": n.type, "data-clickable": n.onClick ? "" : undefined,
            onClick: () => { try { n.onClick?.(); } catch { /* 忽略 */ } },
        },
        h("div", { className: "uspp-row-text" },
            h("div", { className: "uspp-row-title" }, n.title),
            n.body && h("div", { className: "uspp-muted uspp-small" }, n.body)),
        h("span", { className: "uspp-muted uspp-small" }, time(n.at))))) : h("div", { className: "uspp-empty" }, "No notifications yet."));
}
