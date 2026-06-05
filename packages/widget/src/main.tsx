import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Widget } from "./Widget.js";
import { readSettings } from "./types.js";
import { styles } from "./styles.js";

/** Pick a readable text color (#000/#fff) for a given hex background. */
function contrastColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

function mount() {
  const settings = readSettings();

  // Host container + isolated Shadow DOM so host-page CSS can't leak in or out.
  const host = document.createElement("div");
  host.id = "pulse-widget-host";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  // Theme + accent applied via :host custom properties.
  const styleHost = shadow.host as HTMLElement;
  styleHost.setAttribute("data-theme", settings.theme);
  styleHost.style.setProperty("--pulse-accent", settings.accent);
  styleHost.style.setProperty("--pulse-accent-contrast", contrastColor(settings.accent));

  createRoot(mountPoint).render(
    <StrictMode>
      <Widget settings={settings} />
    </StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
