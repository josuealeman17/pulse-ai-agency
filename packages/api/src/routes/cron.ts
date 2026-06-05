import { Hono, type Context } from "hono";
import { env } from "../env.js";
import { runFollowUps } from "../lib/followUps.js";

/**
 * Cron endpoint for review follow-ups. Schedule hourly (Vercel Cron, Supabase
 * pg_cron, or any scheduler). If CRON_SECRET is set, the caller must supply it
 * via the `x-cron-secret` header or `?secret=` query param.
 */
export const cronRoute = new Hono();

function authorized(c: Context): boolean {
  if (!env.cronSecret) return true; // unprotected when no secret configured
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; also allow our own header/query.
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = bearer ?? c.req.header("x-cron-secret") ?? c.req.query("secret");
  return provided === env.cronSecret;
}

async function handle(c: Context) {
  if (!authorized(c)) return c.json({ error: "unauthorized" }, 401);
  const report = await runFollowUps();
  return c.json({ ok: true, ...report });
}

cronRoute.get("/follow-ups", handle);
cronRoute.post("/follow-ups", handle);
