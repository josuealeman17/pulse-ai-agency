import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the widget into a single self-executing JS bundle (chat.js) that can be
// dropped onto any website via a <script> tag. CSS is inlined as a string in
// src/styles.ts and injected into a Shadow DOM, so no separate stylesheet ships.
export default defineConfig({
  plugins: [react()],
  define: {
    // Default API origin baked at build time; overridable per-embed via data-api.
    __PULSE_API_URL__: JSON.stringify(
      process.env.PUBLIC_API_URL || "http://localhost:8787",
    ),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: "src/main.tsx",
      name: "PulseWidget",
      formats: ["iife"],
      fileName: () => "chat.js",
    },
    rollupOptions: {
      output: {
        // Single file — bundle React in so the host site needs nothing.
        inlineDynamicImports: true,
        entryFileNames: "chat.js",
      },
    },
    cssCodeSplit: false,
    target: "es2018",
  },
});
