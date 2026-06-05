import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env, supabaseEnabled } from "./env.js";

// Local dev / always-on Node server entry. On Vercel the Hono app is detected and
// served natively from its default export (see src/app.ts), so we must NOT start a
// port listener there — guard on the VERCEL env var.
if (!process.env.VERCEL) {
  serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`\n  Pulse API → http://localhost:${info.port}`);
    console.log(`  Model:    ${env.anthropicModel}`);
    console.log(`  Supabase: ${supabaseEnabled ? "connected" : "fallback (demo config)"}\n`);
  });
}

export default app;
