/**
 * CSS for the inline review-display embed, scoped to its Shadow DOM root so it
 * can't collide with the host page. Theme + accent are driven by CSS custom
 * properties set on :host at mount time (same model as the chat widget).
 */
export const reviewsStyles = `
:host {
  all: initial;
  --pulse-accent: #2563EB;
  --pulse-accent-contrast: #ffffff;
  --pulse-bg: #ffffff;
  --pulse-card: #ffffff;
  --pulse-text: #1f2937;
  --pulse-text-muted: #6b7280;
  --pulse-border: #e5e7eb;
  --pulse-reply-bg: #f9fafb;
  --pulse-star: #f59e0b;
  --pulse-star-empty: #d1d5db;
  --pulse-shadow: 0 1px 3px rgba(0,0,0,0.08);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display: block;
}
:host([data-theme="dark"]) {
  --pulse-bg: #0f172a;
  --pulse-card: #1e293b;
  --pulse-text: #f1f5f9;
  --pulse-text-muted: #94a3b8;
  --pulse-border: #334155;
  --pulse-reply-bg: #0f172a;
  --pulse-star-empty: #475569;
  --pulse-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
* { box-sizing: border-box; margin: 0; padding: 0; }

.wrap { color: var(--pulse-text); background: var(--pulse-bg); }

/* ── Summary header ── */
.summary { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.summary .avg { font-size: 32px; font-weight: 700; line-height: 1; }
.summary .meta { display: flex; flex-direction: column; gap: 2px; }
.summary .count { font-size: 13px; color: var(--pulse-text-muted); }
.summary .cta {
  margin-left: auto; text-decoration: none; font-size: 14px; font-weight: 600;
  background: var(--pulse-accent); color: var(--pulse-accent-contrast);
  padding: 9px 16px; border-radius: 10px; transition: opacity .15s ease;
}
.summary .cta:hover { opacity: .9; }

/* ── Stars ── */
.stars { display: inline-flex; gap: 2px; }
.stars svg { width: 16px; height: 16px; }
.stars.lg svg { width: 20px; height: 20px; }
.star-full { fill: var(--pulse-star); }
.star-empty { fill: var(--pulse-star-empty); }

/* ── Card grid ── */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card {
  background: var(--pulse-card); border: 1px solid var(--pulse-border);
  border-radius: 14px; padding: 18px; box-shadow: var(--pulse-shadow);
  display: flex; flex-direction: column; gap: 10px;
}
.card .comment { font-size: 14.5px; line-height: 1.55; color: var(--pulse-text); }
.card .who { display: flex; align-items: center; gap: 10px; margin-top: auto; }
.card .avatar {
  width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  background: var(--pulse-accent); color: var(--pulse-accent-contrast);
  display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px;
}
.card .name { font-size: 13.5px; font-weight: 600; }
.card .date { font-size: 12px; color: var(--pulse-text-muted); }

.reply {
  background: var(--pulse-reply-bg); border-radius: 10px; padding: 10px 12px;
  font-size: 13px; line-height: 1.5; color: var(--pulse-text-muted);
  border-left: 3px solid var(--pulse-accent);
}
.reply .reply-label { font-weight: 600; color: var(--pulse-text); display: block; margin-bottom: 2px; font-size: 12px; }

.empty, .error { text-align: center; color: var(--pulse-text-muted); padding: 32px 16px; font-size: 14px; }

.badge { text-align: center; font-size: 11px; color: var(--pulse-text-muted); padding: 16px 6px 0; }
.badge a { color: var(--pulse-text-muted); text-decoration: none; font-weight: 600; }
.badge a:hover { text-decoration: underline; }

/* Skeleton while loading */
.skeleton { background: var(--pulse-card); border: 1px solid var(--pulse-border); border-radius: 14px; height: 150px; animation: pulse-shimmer 1.3s ease-in-out infinite; }
@keyframes pulse-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }

@media (max-width: 520px) {
  .grid { grid-template-columns: 1fr; }
  .summary .cta { margin-left: 0; width: 100%; text-align: center; }
}
`;
