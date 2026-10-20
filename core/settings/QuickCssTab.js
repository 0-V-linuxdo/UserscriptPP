// Quick CSS 页:只编辑当前站点分区的 Quick CSS
import { h, useForceUpdate, useEffect } from "../ui/react.js";
import { Switch, CodeEditor, Row } from "../ui/components.js";
import { SettingsStore } from "../lib/settings.js";
import { getQuickCss, setQuickCss, SITES_PATH } from "../lib/themes.js";
import { siteLabel } from "./site-label.js";

export function QuickCssTab() {
    const force = useForceUpdate();
    useEffect(() => {
        const fn = () => force();
        SettingsStore.addPrefixChangeListener(SITES_PATH, fn);
        return () => SettingsStore.removePrefixChangeListener(SITES_PATH, fn);
    }, []);
    const { css, enabled } = getQuickCss();
    return h("div", { className: "uspp-page", "data-uspp-page": "quickcss" },
        h(Row, { title: "Enable Quick CSS", description: `Applies as you type, only on ${siteLabel()}. Turning it off keeps your code but stops applying it.` },
            h(Switch, { checked: enabled, label: "Enable Quick CSS", onChange: v => setQuickCss({ enabled: v }) })),
        h(CodeEditor, { value: css, readOnly: !enabled, placeholder: "Paste your CSS here...", minHeight: 360, onChange: v => setQuickCss({ css: v }) }));
}
