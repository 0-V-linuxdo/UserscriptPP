// Backup 页:导出整份设置(含全部站点分区)、从文件导入(整份替换,先确认)
import { h, useState } from "../ui/react.js";
import { Button, Row, Switch } from "../ui/components.js";
import { confirmDialog } from "../ui/modal.js";
import { showToast, ToastType } from "../ui/toast.js";
import { exportSettings, parseBackup, importSettings, downloadJson, backupFilename, pickJsonFile } from "../lib/backup.js";

export async function runImport() {
    const text = await pickJsonFile();
    if (text == null) return false;
    let parsed;
    try { parsed = parseBackup(text); } catch (e) { showToast(e.message, ToastType.ERROR); return false; }
    const s = parsed.summary;
    const ok = await confirmDialog({
        title: "Import settings?",
        body: `This replaces all current Userscript++ settings with the file's: ${s.plugins} plugins (${s.enabled} enabled), ${s.themes} themes in ${s.sites} site${s.sites === 1 ? "" : "s"}${s.exportedAt ? `, exported ${s.exportedAt.slice(0, 10)}` : ""}.`,
        confirmText: "Import", danger: true,
    });
    if (!ok) return false;
    const reload = await importSettings(parsed.settings);
    showToast("Settings imported.", ToastType.SUCCESS);
    if (reload && await confirmDialog({ title: "Reload required", body: "Some imported plugin changes need a page reload.", confirmText: "Reload", cancelText: "Later" })) location.reload();
    return true;
}

export function BackupTab() {
    const [secrets, setSecrets] = useState(false);
    return h("div", { className: "uspp-page", "data-uspp-page": "backup" },
        h("div", { className: "uspp-section" },
            h(Row, { title: "Export settings", description: "Saves all Userscript++ settings, for every site, to a JSON file." },
                h(Button, { onClick: () => downloadJson(exportSettings({ includeSensitive: secrets }), backupFilename()) }, "Export")),
            h(Row, { title: "Include sensitive values", description: "Plugin settings marked sensitive (such as keys) are left out unless this is on." },
                h(Switch, { checked: secrets, label: "Include sensitive values", onChange: setSecrets }))),
        h("div", { className: "uspp-section" },
            h(Row, { title: "Import settings", description: "Replaces all current settings with a file you exported before. You'll be asked to confirm." },
                h(Button, { onClick: () => { runImport(); } }, "Import"))));
}
