import type { Context, Next } from "hono";
import { getSupabase } from "./supabase.js";

export type Role = "admin" | "client";

export interface AuthUser {
  id: string;
  role: Role | null;
  clientId: string | null;
}

/**
 * Verify the caller's Supabase access token (Authorization: Bearer <jwt>) and
 * resolve their role/scope from admin_users. Returns null when the token is
 * missing or invalid. The admin API uses the service-role key (which bypasses
 * RLS), so these endpoints MUST gate on this — RLS does not protect them.
 */
export async function authenticate(c: Context): Promise<AuthUser | null> {
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: row } = await supabase
    .from("admin_users")
    .select("role, client_id")
    .eq("id", data.user.id)
    .maybeSingle<{ role: Role; client_id: string | null }>();

  return { id: data.user.id, role: row?.role ?? null, clientId: row?.client_id ?? null };
}

/** Middleware: require any authenticated agency admin. */
export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  await next();
}

/**
 * Middleware: require an admin, OR the client user who owns the :id in the path.
 * Used for per-client self-service endpoints (a business owner managing their
 * own Cal.com connection).
 */
export async function requireAdminOrOwner(c: Context, next: Next): Promise<Response | void> {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (user.role === "admin" || (user.role === "client" && user.clientId === id)) {
    await next();
    return;
  }
  return c.json({ error: "Forbidden" }, 403);
}
