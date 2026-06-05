declare const __PULSE_API_URL__: string;

export interface WidgetSettings {
  clientId: string;
  apiUrl: string;
  theme: "light" | "dark";
  accent: string;
  position: "bottom-right" | "bottom-left";
}

export interface WidgetConfig {
  clientId: string;
  businessName: string;
  greeting: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface UIMessage {
  role: "user" | "assistant";
  content: string;
  /** True while the assistant message is still streaming in. */
  streaming?: boolean;
}

/** Read settings from the host <script> tag's data-* attributes. */
export function readSettings(): WidgetSettings {
  // Prefer the current script only if it actually carries the config attributes
  // (the production single-tag embed). Otherwise find the script that has them
  // (the dev harness, where main.tsx is a separate module script).
  const current = document.currentScript as HTMLScriptElement | null;
  const el =
    current?.hasAttribute("data-client-id")
      ? current
      : document.querySelector<HTMLScriptElement>("script[data-client-id]");

  const clientId = el?.getAttribute("data-client-id") ?? "demo";
  const apiUrl =
    el?.getAttribute("data-api") ??
    (typeof __PULSE_API_URL__ !== "undefined" ? __PULSE_API_URL__ : "http://localhost:8787");
  const theme = (el?.getAttribute("data-theme") as "light" | "dark") ?? "light";
  const accent = el?.getAttribute("data-accent") ?? "#2563EB";
  const position =
    (el?.getAttribute("data-position") as "bottom-right" | "bottom-left") ?? "bottom-right";

  return { clientId, apiUrl: apiUrl.replace(/\/$/, ""), theme, accent, position };
}
