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
.uspp-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.uspp-chip { height: 30px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--uspp-border-l1); background: transparent; color: var(--uspp-fg-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.uspp-chip:hover { background: var(--uspp-button-ghost-hover); }
.uspp-chip[aria-selected="true"] { background: var(--uspp-fg-primary); color: var(--uspp-surface-base); border-color: transparent; }
.uspp-toolbar { display: flex; gap: 8px; align-items: center; }
.uspp-toolbar .uspp-input { flex: 1; }
.uspp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 720px) { .uspp-grid { grid-template-columns: 1fr; } }
.uspp-divider { display: flex; align-items: center; gap: 8px; color: var(--uspp-fg-tertiary); font-size: 12px; margin: 4px 0; }
.uspp-divider::before, .uspp-divider::after { content: ""; flex: 1; height: 1px; background: var(--uspp-border-l1); }
.uspp-card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--uspp-border-l1); border-radius: 16px; background: var(--uspp-surface-l1); min-width: 0; }
.uspp-card[data-failed="true"] { border-color: var(--uspp-fg-danger); background: color-mix(in srgb, var(--uspp-fg-danger) 8%, transparent); }
.uspp-card-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.uspp-card-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uspp-card-controls { margin-left: auto; display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.uspp-card-desc { color: var(--uspp-fg-secondary); font-size: 13px; line-height: 1.4; }
.uspp-card-authors { color: var(--uspp-fg-tertiary); font-size: 12px; }
.uspp-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 600; background: var(--uspp-fg-primary); color: var(--uspp-surface-base); }
.uspp-icon-badge { display: inline-flex; color: var(--uspp-fg-secondary); }
.uspp-icon-badge.uspp-warn { color: var(--uspp-fg-danger); }
.uspp-empty { padding: 32px 8px; text-align: center; color: var(--uspp-fg-secondary); }
.uspp-banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px; background: var(--uspp-surface-l2); }
.uspp-backup { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-top: 18px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--uspp-border-l1); }
.uspp-backup-text { flex: 1 1 220px; display: flex; flex-direction: column; gap: 2px; }
.uspp-sites { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.uspp-site-badge { font-size: 11px; padding: 0 6px; border-radius: 6px; color: var(--uspp-fg-secondary); border: 1px solid var(--uspp-border-l1); white-space: nowrap; }
.uspp-panel { display: flex; flex-direction: column; gap: 14px; }
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
`;
