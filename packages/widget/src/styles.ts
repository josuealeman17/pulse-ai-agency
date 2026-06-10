/**
 * All widget CSS, scoped to the Shadow DOM root so it can never collide with —
 * or be overridden by — the host page's styles. Theme + accent are driven by
 * CSS custom properties set on :host at mount time.
 */
export const styles = `
:host {
  all: initial;
  --pulse-accent: #2563EB;
  --pulse-accent-contrast: #ffffff;
  --pulse-bg: #ffffff;
  --pulse-panel: #ffffff;
  --pulse-text: #1f2937;
  --pulse-text-muted: #6b7280;
  --pulse-bubble-bot: #f3f4f6;
  --pulse-border: #e5e7eb;
  --pulse-shadow: 0 12px 40px rgba(0,0,0,0.16);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
:host([data-theme="dark"]) {
  --pulse-bg: #0f172a;
  --pulse-panel: #1e293b;
  --pulse-text: #f1f5f9;
  --pulse-text-muted: #94a3b8;
  --pulse-bubble-bot: #334155;
  --pulse-border: #334155;
}
* { box-sizing: border-box; margin: 0; padding: 0; }

.root { position: fixed; bottom: 20px; z-index: 2147483000; }
.root.bottom-right { right: 20px; }
.root.bottom-left { left: 20px; }

/* ── Launcher bubble ── */
.bubble {
  width: 60px; height: 60px; border-radius: 50%;
  background: var(--pulse-accent); color: var(--pulse-accent-contrast);
  border: none; cursor: pointer; box-shadow: var(--pulse-shadow);
  display: flex; align-items: center; justify-content: center;
  transition: transform .18s ease, box-shadow .18s ease;
}
.bubble:hover { transform: scale(1.06); }
.bubble:active { transform: scale(0.96); }
.bubble svg { width: 28px; height: 28px; }

/* ── Chat panel ── */
.panel {
  position: absolute; bottom: 76px; width: 384px; height: 600px;
  max-height: calc(100vh - 110px);
  background: var(--pulse-panel); color: var(--pulse-text);
  border-radius: 16px; box-shadow: var(--pulse-shadow);
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--pulse-border);
  transform-origin: bottom right; animation: pulse-pop .18s ease;
}
.root.bottom-right .panel { right: 0; }
.root.bottom-left .panel { left: 0; transform-origin: bottom left; }
@keyframes pulse-pop {
  from { opacity: 0; transform: scale(.92) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.header {
  background: var(--pulse-accent); color: var(--pulse-accent-contrast);
  padding: 16px; display: flex; align-items: center; gap: 12px;
}
.header .logo { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,.2); }
.header .logo-fallback {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,.22); display: flex; align-items: center;
  justify-content: center; font-weight: 600; font-size: 16px;
}
.header .title { font-weight: 600; font-size: 15px; line-height: 1.2; }
.header .subtitle { font-size: 12px; opacity: .85; }
.header .close { margin-left: auto; background: none; border: none; color: inherit; cursor: pointer; opacity: .85; }
.header .close:hover { opacity: 1; }

.messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 82%; padding: 10px 13px; border-radius: 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; animation: pulse-fade .2s ease; }
@keyframes pulse-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
.msg.user { align-self: flex-end; background: var(--pulse-accent); color: var(--pulse-accent-contrast); border-bottom-right-radius: 4px; }
.msg.assistant { align-self: flex-start; background: var(--pulse-bubble-bot); color: var(--pulse-text); border-bottom-left-radius: 4px; }

.typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--pulse-text-muted); animation: pulse-blink 1.2s infinite; }
.typing span:nth-child(2) { animation-delay: .2s; }
.typing span:nth-child(3) { animation-delay: .4s; }
@keyframes pulse-blink { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }

.tool-note { align-self: flex-start; font-size: 12px; color: var(--pulse-text-muted); font-style: italic; padding: 0 4px; }

.composer { border-top: 1px solid var(--pulse-border); padding: 10px; display: flex; gap: 8px; align-items: flex-end; }
.composer textarea {
  flex: 1; resize: none; border: 1px solid var(--pulse-border); border-radius: 10px;
  padding: 9px 12px; font-size: 14px; font-family: inherit; color: var(--pulse-text);
  background: var(--pulse-bg); max-height: 100px; line-height: 1.4; outline: none;
}
.composer textarea:focus { border-color: var(--pulse-accent); }
.composer .send {
  width: 38px; height: 38px; border-radius: 10px; border: none; cursor: pointer;
  background: var(--pulse-accent); color: var(--pulse-accent-contrast);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.composer .send:disabled { opacity: .45; cursor: not-allowed; }

.badge { text-align: center; font-size: 11px; color: var(--pulse-text-muted); padding: 6px; }
.badge a { color: var(--pulse-text-muted); text-decoration: none; font-weight: 600; }
.badge a:hover { text-decoration: underline; }

@media (max-width: 480px) {
  .root { bottom: 16px; right: 16px; left: auto; }
  .panel {
    position: fixed; inset: 0; width: 100vw;
    /* 100vh ignores the mobile browser's URL/tool bar, which pushed the
       composer below the visible viewport so users could never reach the
       input. dvh tracks the *visible* viewport (and shrinks when the
       on-screen keyboard opens), keeping the composer on screen. */
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
  }
  /* Keep the launcher bubble from floating on top of the full-screen panel. */
  .root:has(.panel) .bubble { display: none; }
  /* Clear the home indicator / browser chrome at the very bottom. */
  .composer { padding-bottom: calc(10px + env(safe-area-inset-bottom)); }
}
`;
