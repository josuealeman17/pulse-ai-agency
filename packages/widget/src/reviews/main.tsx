import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReviewsWidget } from "./ReviewsWidget.js";
import { reviewsStyles } from "./reviewsStyles.js";
import type { ReviewsSettings } from "./reviewsApi.js";

declare const __PULSE_API_URL__: string;

/** Pick a readable text color (#000/#fff) for a given hex background. */
function contrastColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

/** Read embed config from the host <script> tag's data-* attributes. */
function readSettings(): { settings: ReviewsSettings; script: HTMLScriptElement | null } {
  const current = document.currentScript as HTMLScriptElement | null;
  const script =
    current?.hasAttribute("data-client-id")
      ? current
      : document.querySelector<HTMLScriptElement>("script[data-client-id]");

  const minRaw = Number(script?.getAttribute("data-min-stars"));
  const limitRaw = Number(script?.getAttribute("data-limit"));
  const apiUrl =
    script?.getAttribute("data-api") ??
    (typeof __PULSE_API_URL__ !== "undefined" ? __PULSE_API_URL__ : "http://localhost:8787");

  return {
    script,
    settings: {
      clientId: script?.getAttribute("data-client-id") ?? "demo",
      apiUrl: apiUrl.replace(/\/$/, ""),
      theme: (script?.getAttribute("data-theme") as "light" | "dark") ?? "light",
      accent: script?.getAttribute("data-accent") ?? "#2563EB",
      minStars: Number.isInteger(minRaw) && minRaw >= 1 && minRaw <= 5 ? minRaw : undefined,
      limit: Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
    },
  };
}

/**
 * Resolve where to render: an explicit <div id="pulse-reviews"> if the site
 * owner placed one, otherwise insert a container right after the embed script
 * (so the reviews appear where the snippet was pasted).
 */
function resolveTarget(script: HTMLScriptElement | null): HTMLElement {
  const explicit = document.getElementById("pulse-reviews");
  if (explicit) return explicit;

  const container = document.createElement("div");
  container.id = "pulse-reviews";
  if (script && script.parentNode) {
    script.parentNode.insertBefore(container, script.nextSibling);
  } else {
    document.body.appendChild(container);
  }
  return container;
}

function mount() {
  const { settings, script } = readSettings();
  const target = resolveTarget(script);

  // Isolated Shadow DOM so host-page CSS can't leak in or out.
  const shadow = target.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = reviewsStyles;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  const styleHost = shadow.host as HTMLElement;
  styleHost.setAttribute("data-theme", settings.theme);
  styleHost.style.setProperty("--pulse-accent", settings.accent);
  styleHost.style.setProperty("--pulse-accent-contrast", contrastColor(settings.accent));

  createRoot(mountPoint).render(
    <StrictMode>
      <ReviewsWidget settings={settings} />
    </StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
