/**
 * Phone-side styles following the Even app design tokens (see Even Hub design
 * guidelines). Glasses green (#3CFA44) is only used for the glasses preview.
 */
const css = `
:root {
  color-scheme: light dark;
  --text: #232323; --text-dim: #7B7B7B; --bg: #FFFFFF; --surface: #EEEEEE;
  --input: rgba(35,35,35,0.08); --accent: #FEF991; --on-accent: #232323;
  --danger: #D92D20; --ok: #1F8A3B; --border: rgba(35,35,35,0.12);
}
@media (prefers-color-scheme: dark) {
  :root {
    --text: #FFFFFF; --text-dim: #8A8A8A; --bg: #111111; --surface: #1A1A1A;
    --input: rgba(255,255,255,0.08); --danger: #FF453A; --ok: #3CD35A; --border: rgba(255,255,255,0.12);
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.45 "FK Grotesk Neue", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Source Han Sans", system-ui, sans-serif;
  letter-spacing: -0.01em; -webkit-text-size-adjust: 100%; touch-action: manipulation; overscroll-behavior: none; }
#app { max-width: 640px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) 20px calc(88px + env(safe-area-inset-bottom)); overflow-x: hidden; }
h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
h2 { font-size: 13px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-dim); margin: 24px 0 8px; }
p { margin: 0 0 8px; }
.dim { color: var(--text-dim); font-size: 13px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: var(--surface); white-space: nowrap; }
.chip.rec { background: var(--danger); color: #fff; }
.chip.rec::before { content: "● "; }
.card { background: var(--surface); border-radius: 16px; padding: 16px; margin-bottom: 12px; }
.btn { appearance: none; border: 0; border-radius: 999px; padding: 14px 20px; font: inherit; font-weight: 600;
  background: var(--accent); color: var(--on-accent); width: 100%; cursor: pointer; }
.btn.secondary { background: var(--input); color: var(--text); font-weight: 500; }
.btn.danger { background: var(--danger); color: #fff; }
.btn:disabled { opacity: 0.5; }
.btn-row { display: flex; gap: 8px; }
.btn-row .btn { width: auto; flex: 1; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field-label { font-size: 13px; color: var(--text-dim); }
select, input, textarea { font: inherit; color: var(--text); background: var(--input); border: 0; border-radius: 12px; padding: 12px; width: 100%; max-width: 100%; }
.glasses { background: #000; color: #3CFA44; border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.35;
  white-space: pre-wrap; word-break: break-word; min-height: 120px; }
.glasses .gh { opacity: 0.8; border-bottom: 1px solid rgba(60,250,68,0.3); padding-bottom: 4px; margin-bottom: 6px; }
.sugg { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.sugg:last-child { border-bottom: 0; }
.kind { font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-dim); min-width: 84px; padding-top: 3px; }
.line { padding: 4px 0; }
.line .who { font-size: 12px; color: var(--text-dim); margin-right: 6px; }
.line.interim { color: var(--text-dim); font-style: italic; }
.error { color: var(--danger); font-size: 14px; margin-top: 8px; }
.tabs { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: var(--bg); border-top: 1px solid var(--border);
  padding: 6px 12px calc(6px + env(safe-area-inset-bottom)); gap: 6px; }
.tabs button { flex: 1; appearance: none; border: 0; background: none; color: var(--text-dim); font: inherit; font-size: 13px; padding: 10px 4px; border-radius: 12px; }
.tabs button.active { color: var(--text); background: var(--surface); font-weight: 600; }
.toggle { display: flex; align-items: center; gap: 10px; margin: 12px 0; font-size: 15px; }
.toggle input { width: 22px; height: 22px; accent-color: var(--text); }
a { color: inherit; word-break: break-all; }
.report { font: 12px/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-all; background: var(--input); border-radius: 12px; padding: 10px; margin-top: 8px; }
.ok { color: var(--ok); } .bad { color: var(--danger); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 14px; margin-top: 8px; }
`

export function injectStyles(): void {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
}
