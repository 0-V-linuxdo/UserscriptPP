// 核心界面的样式:颜色走 --uspp-* 变量,按 <html data-uspp-theme> 切换明暗;站点适配可以把这些变量映射到站点自己的配色
const LIGHT = `--uspp-surface-base:#fff;--uspp-surface-l1:#fff;--uspp-surface-l2:#f4f4f5;--uspp-surface-l3:#d4d4d8;--uspp-fg-primary:#111;--uspp-fg-secondary:#5f5f66;--uspp-fg-tertiary:#8a8a93;--uspp-fg-danger:#e5484d;--uspp-border-l1:rgb(0 0 0 / .1);--uspp-border-l2:rgb(0 0 0 / .16);--uspp-ring:#888;--uspp-button-ghost-hover:rgb(0 0 0 / .06);`;
const DARK = `--uspp-surface-base:#151517;--uspp-surface-l1:#1c1c1f;--uspp-surface-l2:#26262a;--uspp-surface-l3:#3f3f46;--uspp-fg-primary:#f4f4f5;--uspp-fg-secondary:#a1a1aa;--uspp-fg-tertiary:#71717a;--uspp-fg-danger:#f06a6e;--uspp-border-l1:rgb(255 255 255 / .1);--uspp-border-l2:rgb(255 255 255 / .16);--uspp-ring:#a1a1aa;--uspp-button-ghost-hover:rgb(255 255 255 / .08);`;

export const UI_CSS = `
:root { ${LIGHT} }
:root[data-uspp-theme="dark"] { ${DARK} }
uspp-root { color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
uspp-root { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
uspp-root > * { pointer-events: auto; }
.uspp-overlay { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: flex; align-items: center; justify-content: center; padding: 16px; pointer-events: auto; animation: uspp-fade .12s ease-out; }
.uspp-modal { position: relative; background: var(--uspp-surface-l1); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l1); border-radius: 24px; box-shadow: 0 16px 48px rgb(0 0 0 / .35); width: min(560px, 100%); max-height: min(85vh, 760px); display: flex; flex-direction: column; overflow: hidden; font-size: 14px; animation: uspp-pop .14s ease-out; }
.uspp-modal-header { padding: 20px 56px 8px 24px; }
.uspp-modal-title { font-size: 18px; font-weight: 600; margin: 0; }
.uspp-modal-subtitle { color: var(--uspp-fg-secondary); margin-top: 4px; }
.uspp-modal-body { padding: 8px 24px 16px; overflow-y: auto; }
.uspp-modal-footer { padding: 12px 24px 20px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--uspp-border-l1); }
.uspp-modal-close { position: absolute; top: 14px; right: 14px; }
@keyframes uspp-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes uspp-pop { from { opacity: 0; transform: scale(.97) } to { opacity: 1; transform: none } }

.uspp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 9999px; border: 1px solid var(--uspp-border-l2); background: transparent; color: var(--uspp-fg-primary); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.uspp-btn:hover:not(:disabled) { background: var(--uspp-button-ghost-hover); }
.uspp-btn:disabled { opacity: .5; cursor: default; }
.uspp-btn-primary { background: var(--uspp-fg-primary); color: var(--uspp-surface-base); border-color: transparent; }
.uspp-btn-primary:hover:not(:disabled) { background: var(--uspp-fg-primary); opacity: .88; }
.uspp-btn-danger { background: var(--uspp-fg-danger); color: #fff; border-color: transparent; }
.uspp-btn-danger:hover:not(:disabled) { background: var(--uspp-fg-danger); opacity: .88; }
.uspp-btn-ghost { border-color: transparent; }
.uspp-btn-icon { width: 32px; height: 32px; padding: 0; border-color: transparent; color: var(--uspp-fg-secondary); }
.uspp-btn-icon:hover:not(:disabled) { color: var(--uspp-fg-primary); }
.uspp-btn-icon.uspp-active { color: var(--uspp-fg-primary); }
.uspp-btn-sm { height: 30px; padding: 0 10px; font-size: 13px; }

.uspp-switch { position: relative; width: 44px; height: 24px; border-radius: 9999px; background: var(--uspp-surface-l3); border: none; cursor: pointer; flex-shrink: 0; padding: 0; transition: background .15s; }
.uspp-switch[data-checked="true"] { background: var(--uspp-fg-primary); }
.uspp-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: var(--uspp-surface-base); transition: transform .15s; }
.uspp-switch[data-checked="true"]::after { transform: translateX(20px); }
.uspp-switch:disabled { opacity: .5; cursor: not-allowed; }

.uspp-input, .uspp-textarea, .uspp-select { width: 100%; box-sizing: border-box; background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l1); border-radius: 12px; padding: 8px 12px; font: inherit; outline: none; }
.uspp-input:focus, .uspp-textarea:focus, .uspp-select:focus { border-color: var(--uspp-ring); }
.uspp-select { width: auto; min-width: 140px; }
.uspp-textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; resize: vertical; min-height: 240px; white-space: pre; tab-size: 4; }
.uspp-textarea[readonly] { opacity: .6; }

.uspp-page { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; padding-inline-end: 24px; color: var(--uspp-fg-primary); font-size: 14px; }
.uspp-row { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.uspp-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uspp-row-title { font-weight: 500; }
.uspp-muted { color: var(--uspp-fg-secondary); }
.uspp-small { font-size: 12px; }
.uspp-section { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--uspp-border-l1); border-radius: 16px; background: var(--uspp-surface-l1); }
.uspp-tabs { display: flex; flex-wrap: nowrap; gap: 2px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; flex-shrink: 0; border-bottom: 1px solid var(--uspp-border-l1); }
.uspp-tabs::-webkit-scrollbar { display: none; }
.uspp-chip { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; height: 32px; padding: 0 10px; border: none; border-radius: 8px; background: transparent; color: var(--uspp-fg-secondary); font: inherit; font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.uspp-chip:hover { background: var(--uspp-button-ghost-hover); color: var(--uspp-fg-primary); }
.uspp-chip[aria-selected="true"] { color: var(--uspp-fg-primary); }
.uspp-chip[aria-selected="true"]::after { content: ""; position: absolute; inset-inline: 8px; bottom: -1px; height: 2px; border-radius: 1px; background: var(--uspp-fg-primary); }
.uspp-toolbar { display: flex; flex-wrap: nowrap; gap: 8px; align-items: center; }
.uspp-toolbar > :not(.uspp-input) { flex-shrink: 0; width: auto; }
.uspp-toolbar .uspp-input { flex: 1; min-width: 0; }
.uspp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.uspp-divider { display: flex; align-items: center; gap: 8px; color: var(--uspp-fg-tertiary); font-size: 12px; margin: 4px 0; }
.uspp-divider::before, .uspp-divider::after { content: ""; flex: 1; height: 1px; background: var(--uspp-border-l1); }
.uspp-card { display: flex; flex-direction: column; padding: 0; min-height: 120px; min-width: 0; overflow: hidden; contain: content; border: 1px solid var(--uspp-border-l1); border-radius: 8px; background: var(--uspp-surface-l1); }
.uspp-switch-lock { display: inline-flex; cursor: not-allowed; }
.uspp-switch-lock button, .uspp-switch-lock [role="switch"] { opacity: 1 !important; pointer-events: none; }
.uspp-card[data-failed="true"] { opacity: .5; border-color: color-mix(in srgb, var(--uspp-fg-danger) 45%, transparent); }
.uspp-card-body { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
.uspp-card-head { display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.uspp-card-title { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.uspp-card-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 24px; border-radius: 8px; line-height: 0; color: var(--uspp-fg-primary); background: color-mix(in srgb, var(--uspp-fg-primary) 10%, transparent); }
.uspp-card-icon svg { width: 14px; height: 14px; }
.uspp-card-name { flex-shrink: 1; min-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; }
.uspp-card-controls { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
.uspp-card-btn { width: 28px; height: 28px; border-radius: 8px; color: var(--uspp-fg-tertiary); }
.uspp-card-btn.uspp-active { color: var(--uspp-fg-primary); }
.uspp-card-desc { margin-top: 4px; font-size: 13px; line-height: 1.5; color: var(--uspp-fg-secondary); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.uspp-card-sep { height: 1px; background: var(--uspp-border-l1); }
.uspp-card-foot { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; padding: 6px 12px; min-height: 22px; }
.uspp-card-authors { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--uspp-fg-tertiary); }
.uspp-card-foot .uspp-sites { margin-top: 0; flex-shrink: 0; }
.uspp-card-preview { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 6px; border: none; background: transparent; color: var(--uspp-fg-tertiary); font: inherit; font-size: 11px; cursor: pointer; flex-shrink: 0; }
.uspp-card-preview:hover { color: var(--uspp-fg-primary); background: var(--uspp-button-ghost-hover); }
.uspp-badge { flex-shrink: 0; white-space: nowrap; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 600; background: var(--uspp-fg-primary); color: var(--uspp-surface-base); }
.uspp-icon-badge { display: inline-flex; align-items: center; flex-shrink: 0; line-height: 0; color: var(--uspp-fg-tertiary); }
.uspp-icon-badge.uspp-warn { color: var(--uspp-fg-danger); }
.uspp-empty { padding: 32px 8px; text-align: center; color: var(--uspp-fg-secondary); }
.uspp-banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px; background: var(--uspp-surface-l2); }
.uspp-backup { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-top: 18px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--uspp-border-l1); }
.uspp-backup-text { flex: 1 1 220px; display: flex; flex-direction: column; gap: 2px; }
.uspp-sites { white-space: nowrap; display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.uspp-card-timing { flex-shrink: 0; font-size: 11px; color: var(--uspp-fg-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.uspp-site-badge { flex-shrink: 0; font-size: 11px; padding: 0 6px; border-radius: 6px; color: var(--uspp-fg-secondary); border: 1px solid var(--uspp-border-l1); white-space: nowrap; }
.uspp-panel { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 20px; align-items: start; }
.uspp-panel-nav { position: sticky; top: 0; display: flex; flex-direction: column; gap: 2px; }
.uspp-panel-nav-item { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border: none; border-radius: 10px; background: transparent; color: var(--uspp-fg-secondary); font: inherit; font-size: 14px; font-weight: 500; white-space: nowrap; text-align: start; cursor: pointer; }
.uspp-panel-nav-item:hover { background: var(--uspp-button-ghost-hover); color: var(--uspp-fg-primary); }
.uspp-panel-nav-item[aria-selected="true"] { background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); }
.uspp-panel-nav-item span { overflow: hidden; text-overflow: ellipsis; }
.uspp-panel-content { min-width: 0; }
.uspp-modal:has(.uspp-panel) { container-type: inline-size; }
@container (max-width: 760px) {
  .uspp-panel { grid-template-columns: 44px minmax(0, 1fr); gap: 14px; }
  .uspp-panel-nav-item { justify-content: center; padding: 0; }
  .uspp-panel-nav-item span { display: none; }
}
.uspp-panel .uspp-page { padding-inline-end: 0; }
.uspp-floating { position: fixed; z-index: 2147482000; display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
.uspp-floating[data-pos="bottom-right"] { right: 16px; bottom: 16px; }
.uspp-floating[data-pos="bottom-left"] { left: 16px; bottom: 16px; }
.uspp-floating[data-pos="top-right"] { right: 16px; top: 16px; }
.uspp-floating[data-pos="top-left"] { left: 16px; top: 16px; }
.uspp-floating-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 40px; height: 40px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--uspp-border-l2); background: var(--uspp-surface-l1); color: var(--uspp-fg-primary); box-shadow: 0 4px 16px rgb(0 0 0 / .18); font: inherit; cursor: pointer; }
.uspp-floating-btn:hover:not(:disabled) { background: var(--uspp-surface-l2); }
.uspp-floating-btn[data-active="true"] { background: var(--uspp-fg-primary); color: var(--uspp-surface-base); }
.uspp-error { color: var(--uspp-fg-danger); font-size: 13px; }
.uspp-setting { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--uspp-border-l1); }
.uspp-setting:last-child { border-bottom: none; }
.uspp-slider-row { display: flex; gap: 12px; align-items: center; }
.uspp-slider-row input[type=range] { flex: 1; }
.uspp-tip { display: inline-flex; align-items: center; color: var(--uspp-fg-secondary); cursor: help; margin-left: 4px; }

.uspp-notice { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; max-width: min(640px, calc(100vw - 32px)); padding: 10px 12px 10px 16px; border-radius: 16px; background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l2); box-shadow: 0 8px 32px rgb(0 0 0 / .3); font-size: 14px; pointer-events: auto; }
.uspp-notice[data-type="ERROR"] { border-color: var(--uspp-fg-danger); }
.uspp-notice-msg { flex: 1; }

.uspp-menu-icon { display: inline-flex; margin-inline-end: 8px; color: var(--uspp-fg-secondary); }
.uspp-preview { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 12px; }
.uspp-preview-head { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.uspp-preview-title { font-weight: 600; }
.uspp-preview-nav { margin-left: auto; display: flex; align-items: center; gap: 2px; }
.uspp-preview-img { display: block; max-width: 100%; max-height: 300px; margin: 0 auto; border-radius: 12px; border: 1px solid var(--uspp-border-l1); object-fit: contain; background: var(--uspp-surface-l2); }
.uspp-preview-live { padding: 14px; border-radius: 14px; border: 1px dashed var(--uspp-border-l2); background: var(--uspp-surface-l2); overflow: auto; max-height: 320px; }
.uspp-preview-empty { padding: 24px 8px; text-align: center; border-radius: 14px; background: var(--uspp-surface-l2); }
.uspp-preview-compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.uspp-preview-compare figure { margin: 0; display: flex; flex-direction: column; gap: 4px; }
.uspp-preview-compare figcaption { text-align: center; font-size: 12px; color: var(--uspp-fg-secondary); }
.uspp-preview-caption { text-align: center; }
.uspp-preview-slots { display: flex; flex-direction: column; gap: 8px; border-style: solid; }
.uspp-preview-slot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.uspp-preview-chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--uspp-border-l2); background: var(--uspp-surface-l1); font-weight: 500; font-size: 13px; }
.uspp-code { position: relative; }
.uspp-code-hl { position: absolute; inset: 0; margin: 0; overflow: hidden; pointer-events: none; box-sizing: border-box; border: 1px solid transparent; border-radius: 12px; padding: 8px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; white-space: pre; tab-size: 4; color: var(--uspp-fg-primary); background: var(--uspp-surface-l2); }
.uspp-code .uspp-code-input { position: relative; background: transparent; color: transparent; caret-color: var(--uspp-fg-primary); }
.uspp-code .uspp-code-input::selection { background: color-mix(in srgb, var(--uspp-ring) 40%, transparent); color: transparent; }
.uspp-code .uspp-code-input::placeholder { color: var(--uspp-fg-tertiary); }
.uspp-code-readonly .uspp-code-hl { opacity: .6; }
.uspp-code .uspp-code-input[readonly] { opacity: 1; }
.uspp-hl-comment { color: var(--uspp-fg-tertiary); font-style: italic; }
.uspp-hl-string { color: #16a34a; }
.uspp-hl-at, .uspp-hl-important { color: #c026d3; }
.uspp-hl-selector { color: #2563eb; }
.uspp-hl-property, .uspp-hl-variable { color: #0891b2; }
.uspp-hl-value, .uspp-hl-function { color: var(--uspp-fg-primary); }
.uspp-hl-number, .uspp-hl-color { color: #ea580c; }
.uspp-hl-punct { color: var(--uspp-fg-secondary); }
[data-uspp-theme="dark"] .uspp-hl-string { color: #4ade80; }
[data-uspp-theme="dark"] .uspp-hl-at, [data-uspp-theme="dark"] .uspp-hl-important { color: #e879f9; }
[data-uspp-theme="dark"] .uspp-hl-selector { color: #60a5fa; }
[data-uspp-theme="dark"] .uspp-hl-property, [data-uspp-theme="dark"] .uspp-hl-variable { color: #22d3ee; }
[data-uspp-theme="dark"] .uspp-hl-number, [data-uspp-theme="dark"] .uspp-hl-color { color: #fb923c; }
.uspp-textarea-plain { resize: vertical; min-height: 72px; line-height: 1.5; }
.uspp-section-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.uspp-hint { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--uspp-border-l1); background: var(--uspp-surface-l2); font-size: 13px; color: var(--uspp-fg-primary); }
.uspp-hint[data-type="warn"] { border-color: color-mix(in srgb, #f59e0b 45%, transparent); background: color-mix(in srgb, #f59e0b 10%, var(--uspp-surface-l1)); }
.uspp-hint[data-type="danger"] { border-color: color-mix(in srgb, var(--uspp-fg-danger) 45%, transparent); background: color-mix(in srgb, var(--uspp-fg-danger) 8%, var(--uspp-surface-l1)); }
.uspp-hint[data-type="success"] { border-color: color-mix(in srgb, #22c55e 45%, transparent); background: color-mix(in srgb, #22c55e 8%, var(--uspp-surface-l1)); }
.uspp-hint-title { font-weight: 600; }
.uspp-error-detail { margin: 6px 0 0; max-height: 200px; overflow: auto; font-size: 12px; white-space: pre-wrap; word-break: break-word; color: var(--uspp-fg-secondary); }
.uspp-color-swatch { width: 32px; height: 32px; padding: 0; border: 1px solid var(--uspp-border-l2); border-radius: 8px; background: none; cursor: pointer; }
.uspp-checkbox { width: 16px; height: 16px; accent-color: var(--uspp-fg-primary); cursor: pointer; }
.uspp-selection-bar { position: sticky; bottom: 0; display: flex; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid var(--uspp-border-l2); border-radius: 12px; background: var(--uspp-surface-l1); box-shadow: 0 6px 20px rgb(0 0 0 / .15); }
.uspp-setting-fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.uspp-setting-disabled { opacity: .5; }
.uspp-setting-error { margin-top: 6px; font-size: 12px; color: var(--uspp-fg-danger); }
.uspp-setting-flash { outline: 2px solid var(--uspp-ring); outline-offset: 4px; border-radius: 8px; transition: outline-color .4s; }
.uspp-plugin-about { margin-bottom: 12px; }
.uspp-notify-stack { position: fixed; right: 16px; bottom: 16px; z-index: 2147483600; display: flex; flex-direction: column; gap: 8px; width: min(360px, calc(100vw - 32px)); pointer-events: none; }
.uspp-notify { display: flex; align-items: flex-start; gap: 10px; padding: 10px 8px 10px 14px; border-radius: 14px; background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l2); box-shadow: 0 8px 32px rgb(0 0 0 / .3); font-size: 14px; pointer-events: auto; animation: uspp-fade .12s ease-out; }
.uspp-notify[data-clickable] { cursor: pointer; }
.uspp-notify[data-type="ERROR"] { border-color: var(--uspp-fg-danger); }
.uspp-notify-text { flex: 1; min-width: 0; }
.uspp-notify-title { font-weight: 600; }
.uspp-notify-body { color: var(--uspp-fg-secondary); font-size: 13px; margin-top: 2px; word-break: break-word; }
.uspp-notify-log[data-clickable] { cursor: pointer; }
.uspp-palette { width: min(640px, calc(100vw - 32px)); max-height: min(520px, calc(100vh - 96px)); align-self: flex-start; margin-top: 10vh; display: flex; flex-direction: column; border-radius: 16px; background: var(--uspp-surface-l1); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l2); box-shadow: 0 16px 48px rgb(0 0 0 / .35); overflow: hidden; }
.uspp-palette-input { margin: 10px; width: auto; }
.uspp-palette-list { overflow: auto; padding: 0 6px 6px; }
.uspp-palette-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; cursor: pointer; }
.uspp-palette-item[aria-selected="true"] { background: var(--uspp-button-ghost-hover); }
.uspp-palette-kind { flex: none; width: 64px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--uspp-fg-tertiary); }
.uspp-palette-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.uspp-palette-text > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uspp-kbd { display: inline-block; min-width: 48px; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--uspp-border-l2); background: var(--uspp-surface-l2); font: 12px ui-monospace, monospace; text-align: center; color: var(--uspp-fg-primary); }
.uspp-kbd[data-empty] { color: var(--uspp-fg-tertiary); }
.uspp-keybind { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; }
.uspp-keybind .uspp-setting-error { flex-basis: 100%; text-align: right; }
.uspp-stack { margin: 6px 0 0; max-height: 180px; overflow: auto; font-size: 12px; white-space: pre-wrap; word-break: break-word; color: var(--uspp-fg-secondary); }
.uspp-slot-button { display: inline-flex; align-items: center; gap: 4px; }
.uspp-changelog { display: flex; flex-direction: column; gap: 10px; }
.uspp-changelog-notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
/* 弹窗本身获得焦点时(打开弹窗时焦点先放在这里)不画焦点框 */
.uspp-modal:focus { outline: none; }
/* 系统设置了"减少动态效果"时去掉动画和过渡 */
@media (prefers-reduced-motion: reduce) {
  [class^="uspp-"], [class*=" uspp-"], [class^="uspp-"]::after, [class*=" uspp-"]::after { animation: none !important; transition: none !important; }
}
`;
