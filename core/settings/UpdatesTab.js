// Updates 页:当前版本、检查更新、立即更新、自动检查开关、更新日志
import { VERSION, BUILD_TYPE } from "../env.js";
import { h, useSubscription } from "../ui/react.js";
import { Button, Row, Switch } from "../ui/components.js";
import { openModal, closeModal, ModalCard } from "../ui/modal.js";
import { Settings, PlainSettings } from "../lib/settings.js";
import { CHANGELOG, canUpdate, checkForUpdate, installUpdate, lastCheck, isChecking, subscribeUpdates, compareVersions } from "../lib/updater.js";

const when = t => (t ? new Date(t).toLocaleString() : "never");

export function ChangelogList({ entries = CHANGELOG, current = VERSION }) {
    if (!entries.length) return h("div", { className: "uspp-empty" }, "No changelog in this build.");
    return h("div", { className: "uspp-changelog" }, entries.map(e => h("div", { key: e.version, className: "uspp-section", "data-uspp-changelog-version": e.version },
        h("div", { className: "uspp-row-title" }, `v${e.version}`, e.date && h("span", { className: "uspp-muted uspp-small" }, ` · ${e.date}`),
            compareVersions(e.version, current) === 0 && h("span", { className: "uspp-muted uspp-small" }, " · installed")),
        e.notes.length > 0 && h("ul", { className: "uspp-changelog-notes" }, e.notes.map((n, i) => h("li", { key: i }, n))))));
}

/** 更新日志弹窗:entries 缺省为全部 */
export function openChangelog({ entries = CHANGELOG, title = "What's new" } = {}) {
    const key = "uspp-changelog";
    openModal(() => h(ModalCard, { title, subtitle: `Installed: v${VERSION}`, width: 560, onClose: () => closeModal(key) }, h(ChangelogList, { entries })), { modalKey: key });
    return key;
}

export function UpdatesTab() {
    useSubscription(subscribeUpdates);
    const last = lastCheck();
    const checking = isChecking();
    const plain = PlainSettings.plugins.Settings ?? {};
    const auto = plain.autoCheckUpdates !== false;
    let status = null;
    if (!canUpdate()) status = "This build has no update address; your script manager handles updates.";
    else if (checking) status = "Checking…";
    else if (last?.error) status = `Couldn't check for updates: ${last.error}`;
    else if (last?.hasUpdate) status = `v${last.latest} is available.`;
    else if (last) status = "You're on the latest version.";
    return h("div", { className: "uspp-page", "data-uspp-page": "updates" },
        h("div", { className: "uspp-section" },
            h(Row, { title: `Installed: v${VERSION}`, description: `${BUILD_TYPE} build · last checked ${when(last?.at ?? plain.lastUpdateCheck)}` },
                canUpdate() && h(Button, { size: "sm", disabled: checking, onClick: () => checkForUpdate() }, "Check now")),
            status && h("div", { className: "uspp-muted uspp-small", "data-uspp-update-status": "" }, status),
            last?.hasUpdate && h(Button, { variant: "primary", onClick: () => installUpdate() }, `Update to v${last.latest}`),
            canUpdate() && h(Row, { title: "Check for updates automatically", description: "Once a day, and notify when a new version is out." },
                h(Switch, { checked: auto, label: "Check for updates automatically", onChange: v => { Settings.plugins.Settings.autoCheckUpdates = v; } }))),
        h("h3", { className: "uspp-row-title", style: { margin: "16px 0 8px" } }, "Changelog"),
        h(ChangelogList, {}));
}
