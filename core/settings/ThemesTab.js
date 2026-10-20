// Themes 页(规格 8.5)
import { h, useState, useEffect, useForceUpdate, ErrorBoundary } from "../ui/react.js";
import { Switch, Select, Input, Button, IconButton, CodeEditor } from "../ui/components.js";
import { openModal, ModalCard, confirmDialog } from "../ui/modal.js";
import { showToast, ToastType } from "../ui/toast.js";
import { copyToClipboard } from "../lib/utils.js";
import {
    getThemes, subscribeThemes, addTheme, addLocalTheme, updateLocalTheme, removeTheme, enableTheme, disableTheme, setThemeAllSites,
} from "../lib/themes.js";
import { siteLabel } from "./site-label.js";
import { EditIcon, CopyIcon, TrashIcon } from "../ui/icons.js";

function OnlineThemeModal({ onClose }) {
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const submit = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try {
            await addTheme(url);
            onClose();
        } catch (e) {
            setError(e?.message || String(e));
            setBusy(false);
        }
    };
    return h(ModalCard, {
        title: "Add online theme", subtitle: "Paste a link to a .css file.", onClose, width: 480,
        footer: [
            h(Button, { key: "c", onClick: onClose }, "Cancel"),
            h(Button, { key: "i", variant: "primary", onClick: submit, disabled: busy || !url.trim() }, busy ? "Importing..." : "Import"),
        ],
    },
    h(Input, { autoFocus: true, type: "url", placeholder: "https://example.com/theme.css", value: url, onChange: e => setUrl(e.target.value), onEnter: submit, disabled: busy }),
    error && h("div", { className: "uspp-error", role: "alert", style: { marginTop: 8 } }, error));
}

function LocalThemeModal({ onClose, theme }) {
    const [name, setName] = useState(theme?.name || "");
    const [css, setCss] = useState(theme?.css || "");
    const ok = name.trim() && css.trim();
    const save = () => {
        if (!ok) return;
        if (theme) updateLocalTheme(theme.url, { name: name.trim(), css });
        else addLocalTheme(name.trim(), css);
        onClose();
    };
    return h(ModalCard, {
        title: theme ? "Edit local theme" : "New local theme", onClose, width: 640,
        footer: [
            h(Button, { key: "c", onClick: onClose }, "Cancel"),
            h(Button, { key: "s", variant: "primary", onClick: save, disabled: !ok }, theme ? "Save" : "Create"),
        ],
    },
    h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        h("label", { className: "uspp-row-title" }, "Name"),
        h(Input, { autoFocus: true, placeholder: "My theme", value: name, onChange: e => setName(e.target.value) }),
        h("label", { className: "uspp-row-title" }, "CSS"),
        h(CodeEditor, { value: css, onChange: setCss, placeholder: "/* your CSS */", minHeight: 260 })));
}

function ThemeCard({ t }) {
    const remove = async () => {
        const ok = await confirmDialog({ title: "Remove theme", body: `Are you sure you want to remove "${t.name}"?`, confirmText: "Remove", danger: true });
        if (ok) removeTheme(t.url);
    };
    const copy = async () => {
        const ok = await copyToClipboard(t.url);
        showToast(ok ? "Copied URL" : "Couldn't copy URL", ok ? ToastType.SUCCESS : ToastType.ERROR);
    };
    return h("div", { className: "uspp-card", "data-uspp-theme": t.url },
        h("div", { className: "uspp-card-head" },
            h("span", { className: "uspp-card-name" }, t.name),
            h("span", { className: "uspp-badge" }, t.local ? "Local" : "Online"),
            h("div", { className: "uspp-card-controls" },
                t.local
                    ? h(IconButton, { icon: EditIcon, label: "Edit", onClick: () => openModal(({ onClose }) => h(LocalThemeModal, { onClose, theme: t }), { modalKey: "uspp-local-theme" }) })
                    : h(IconButton, { icon: CopyIcon, label: "Copy URL", onClick: copy }),
                h(IconButton, { icon: TrashIcon, label: "Delete", onClick: remove }),
                h(Switch, { checked: t.enabled, label: t.name, onChange: v => (v ? enableTheme : disableTheme)(t.url) }))),
        t.description && h("div", { className: "uspp-card-desc" }, t.description),
        h("div", { className: "uspp-card-authors" }, t.author || ""),
        h("label", { className: "uspp-sites uspp-muted uspp-small" },
            h("input", { type: "checkbox", checked: !!t.allSites, onChange: e => setThemeAllSites(t.url, e.target.checked), "data-uspp-theme-all": t.url }),
            "Use on all sites"));
}

export function ThemesTab() {
    const force = useForceUpdate();
    useEffect(() => subscribeThemes(() => force()), []);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const themes = getThemes();
    const q = query.trim().toLowerCase();
    const list = themes.filter(t => (!q || `${t.name} ${t.author || ""} ${t.description || ""}`.toLowerCase().includes(q))
        && (filter === "all"
            || (filter === "enabled" && t.enabled) || (filter === "disabled" && !t.enabled)
            || (filter === "online" && !t.local) || (filter === "local" && t.local)));

    const section = (title, desc, onManage) => h("div", { className: "uspp-section" },
        h("div", { className: "uspp-row" },
            h("div", { className: "uspp-row-text" },
                h("div", { className: "uspp-row-title" }, title),
                h("div", { className: "uspp-muted uspp-small" }, desc)),
            h(Button, { onClick: onManage }, "Manage")));

    return h("div", { className: "uspp-page", "data-uspp-page": "themes" },
        h("div", { className: "uspp-muted uspp-small" }, `Themes for ${siteLabel()}. Turn on "Use on all sites" to apply a theme everywhere.`),
        section("Online Themes", "Load themes from a URL. They're cached on this device and checked for updates once a day.",
            () => openModal(({ onClose }) => h(OnlineThemeModal, { onClose }), { modalKey: "uspp-online-theme" })),
        section("Local Themes", "Custom CSS that only lives on this device.",
            () => openModal(({ onClose }) => h(LocalThemeModal, { onClose }), { modalKey: "uspp-local-theme" })),
        themes.length > 0 && h("div", { className: "uspp-toolbar" },
            h(Input, { type: "search", placeholder: `Search ${themes.length} themes...`, value: query, onChange: e => setQuery(e.target.value) }),
            h(Select, {
                value: filter, label: "Filter", onChange: setFilter,
                options: [["all", "All"], ["enabled", "Enabled"], ["disabled", "Disabled"], ["online", "Online"], ["local", "Local"]].map(([value, label]) => ({ value, label })),
            })),
        themes.length > 0 && (list.length
            ? h("div", { className: "uspp-grid" }, list.map(t => h(ErrorBoundary, { key: t.url, fallback: null }, h(ThemeCard, { t }))))
            : h("div", { className: "uspp-empty" }, "No themes match your search.")));
}
