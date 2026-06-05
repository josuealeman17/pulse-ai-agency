import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env, supabaseEnabled } from "./env.js";

// Local dev / always-on Node server entry. (Vercel uses api/index.ts instead.)
serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`\n  Pulse API → http://localhost:${info.port}`);
  console.log(`  Model:    ${env.anthropicModel}`);
  console.log(`  Supabase: ${supabaseEnabled ? "connected" : "fallback (demo config)"}\n`);
});

export default app;
