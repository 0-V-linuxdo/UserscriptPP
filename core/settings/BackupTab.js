// Backup 页:导出整份设置(含全部站点分区)、从文件导入(整份替换,先确认)
import { SCRIPT_NAME } from "../env.js";
import { h, useState, useEffect } from "../ui/react.js";
import { Button, Row, Switch } from "../ui/components.js";
import { confirmDialog } from "../ui/modal.js";
import { showToast, ToastType, showNotice } from "../ui/toast.js";
import { exportSettings, exportSettingsWithData, parseBackup, importSettings, previewImport, lastImportInvalid, undoImport, lastImport, downloadJson, backupFilename, pickJsonFile } from "../lib/backup.js";

const list = names => names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : names.join(", ");
const invalidText = inv => inv.map(x => x.key === "*" ? x.plugin : `${x.plugin}.${x.key} (${x.reason})`);

/** 撤销上一次导入;返回是否撤销了 */
export async function runUndoImport() {
    const reload = await undoImport();
    if (reload === null) { showToast("There is no import to undo.", ToastType.INFO); return false; }
    showToast("Import undone. Your previous settings are back.", ToastType.SUCCESS);
    if (reload && await confirmDialog({ title: "Reload required", body: "Some restored plugin changes need a page reload.", confirmText: "Reload", cancelText: "Later" })) location.reload();
    return true;
}

export async function runImport() {
    const text = await pickJsonFile();
    if (text == null) return false;
    let parsed;
    try { parsed = parseBackup(text); } catch (e) { showToast(e.message, ToastType.ERROR); return false; }
    const s = parsed.summary;
    const pv = previewImport(parsed.settings);
    const ok = await confirmDialog({
        title: "Import settings?",
        body: h("div", { "data-uspp-import-preview": "" },
            h("p", null, `This replaces all current ${SCRIPT_NAME} settings with the file's: ${s.plugins} plugins (${s.enabled} enabled), ${s.themes} themes in ${s.sites} site${s.sites === 1 ? "" : "s"}${s.dataPlugins ? `, and stored data for ${s.dataPlugins} plugin${s.dataPlugins === 1 ? "" : "s"}` : ""}${s.exportedAt ? `, exported ${s.exportedAt.slice(0, 10)}` : ""}.`),
            pv.turnOn.length > 0 && h("p", null, `Turns on: ${list(pv.turnOn)}.`),
            pv.turnOff.length > 0 && h("p", null, `Turns off: ${list(pv.turnOff)}.`),
            pv.changed > 0 && h("p", null, `Changes ${pv.changed} plugin setting${pv.changed === 1 ? "" : "s"}.`),
            pv.invalid.length > 0 && h("p", null, `Skips ${pv.invalid.length} invalid value${pv.invalid.length === 1 ? "" : "s"}, which keep their defaults: ${list(invalidText(pv.invalid))}.`),
            h("p", null, "You can undo the import afterwards.")),
        confirmText: "Import", danger: true,
    });
    if (!ok) return false;
    const reload = await importSettings(parsed.settings, { data: parsed.data });
    const skipped = lastImportInvalid().length;
    showNotice({
        message: `Settings imported${skipped ? ` (${skipped} invalid value${skipped === 1 ? "" : "s"} skipped)` : ""}.`,
        type: "SUCCESS", duration: 20000,
        action: { label: "Undo", onClick: () => { runUndoImport(); } },
    });
    if (reload && await confirmDialog({ title: "Reload required", body: "Some imported plugin changes need a page reload.", confirmText: "Reload", cancelText: "Later" })) location.reload();
    return true;
}

function UndoRow() {
    const [last, setLast] = useState(null);
    useEffect(() => { let live = true; lastImport().then(v => { if (live) setLast(v); }); return () => { live = false; }; }, []);
    if (!last) return null;
    return h(Row, { title: "Undo last import", description: `Restores the settings you had before the import on ${new Date(last.at).toLocaleString()}.` },
        h(Button, { onClick: async () => { if (await runUndoImport()) setLast(null); } }, "Undo import"));
}

export function BackupTab() {
    const [secrets, setSecrets] = useState(false);
    const [withData, setWithData] = useState(false);
    const doExport = async () => downloadJson(withData ? await exportSettingsWithData({ includeSensitive: secrets }) : exportSettings({ includeSensitive: secrets }), backupFilename());
    return h("div", { className: "uspp-page", "data-uspp-page": "backup" },
        h("div", { className: "uspp-section" },
            h(Row, { title: "Export settings", description: `Saves all ${SCRIPT_NAME} settings, for every site, to a JSON file.` },
                h(Button, { onClick: () => { doExport(); } }, "Export")),
            h(Row, { title: "Include sensitive values", description: "Plugin settings marked sensitive (such as keys) are left out unless this is on." },
                h(Switch, { checked: secrets, label: "Include sensitive values", onChange: setSecrets })),
            h(Row, { title: "Include plugin data", description: "Also saves data plugins keep outside their settings, such as caches and history. Can make the file large." },
                h(Switch, { checked: withData, label: "Include plugin data", onChange: setWithData }))),
        h("div", { className: "uspp-section" },
            h(Row, { title: "Import settings", description: "Replaces all current settings with a file you exported before. You'll be asked to confirm." },
                h(Button, { onClick: () => { runImport(); } }, "Import")),
            h(UndoRow, null)));
}
