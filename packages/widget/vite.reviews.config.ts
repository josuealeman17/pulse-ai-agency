import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the inline review-display embed into a single self-executing bundle
// (reviews.js), a sibling to chat.js. Runs as a SECOND build into the same dist
// folder, so emptyOutDir is off to avoid wiping chat.js. CSS is inlined as a
// string in src/reviews/reviewsStyles.ts and injected into a Shadow DOM.
export default defineConfig({
  plugins: [react()],
  define: {
    __PULSE_API_URL__: JSON.stringify(
      process.env.PUBLIC_API_URL || "http://localhost:8787",
    ),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/reviews/main.tsx",
      name: "PulseReviews",
      formats: ["iife"],
      fileName: () => "reviews.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "reviews.js",
      },
    },
    cssCodeSplit: false,
    target: "es2018",
  },
});
