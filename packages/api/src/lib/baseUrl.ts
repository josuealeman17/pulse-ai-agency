import type { Context } from "hono";
import { env } from "../env.js";

/**
 * The public origin this request actually arrived on, e.g.
 * "https://pulse-api-ten.vercel.app". Used to build absolute links in emails
 * (star ratings, unsubscribe) and feedback pages so they always point back at
 * the live host — never at a stale PUBLIC_API_URL or the localhost dev default.
 *
 * Behind Vercel's proxy the original host/scheme are in the x-forwarded-* headers;
 * we fall back to the Host header, then to PUBLIC_API_URL for non-HTTP contexts.
 */
export function baseUrl(c: Context): string {
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
  if (!host) return env.publicApiUrl;
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
