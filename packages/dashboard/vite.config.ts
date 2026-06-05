import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

// Reuse the repo-root .env so we don't duplicate Supabase values. SUPABASE_URL and
// the ANON key are browser-safe (that's their purpose); the service-role key is
// never referenced here.
loadDotenv({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ""),
    "import.meta.env.VITE_API_URL": JSON.stringify(
      process.env.PUBLIC_API_URL ?? "http://localhost:8787",
    ),
    "import.meta.env.VITE_WIDGET_URL": JSON.stringify(
      process.env.PUBLIC_WIDGET_URL ?? "http://localhost:5173",
    ),
  },
});
