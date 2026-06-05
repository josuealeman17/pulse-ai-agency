/**
 * Create the first agency admin login (Supabase Auth user + admin_users row).
 * Run once:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=somethingStrong npx tsx packages/api/src/seedAdmin.ts
 *
 * (PowerShell: $env:ADMIN_EMAIL="..."; $env:ADMIN_PASSWORD="..."; npx tsx packages/api/src/seedAdmin.ts)
 */
import { getSupabase } from "./lib/supabase.js";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error("Supabase not configured (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  // Create the auth user (email pre-confirmed so they can log in immediately).
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let userId = data?.user?.id;
  if (error) {
    if (/already.*registered|exists/i.test(error.message)) {
      console.log(`Auth user ${email} already exists — ensuring admin row.`);
      const { data: list } = await supabase.auth.admin.listUsers();
      userId = list?.users.find((u) => u.email === email)?.id;
    } else {
      console.error("Failed to create user:", error.message);
      process.exit(1);
    }
  } else {
    console.log(`Created auth user ${email}`);
  }

  if (!userId) {
    console.error("Could not resolve the user id.");
    process.exit(1);
  }

  const { error: roleErr } = await supabase
    .from("admin_users")
    .upsert({ id: userId, role: "admin", client_id: null }, { onConflict: "id" });
  if (roleErr) {
    console.error("Created login, but failed to write admin_users row:", roleErr.message);
    process.exit(1);
  }

  console.log(`\n  Admin ready. Log in to the dashboard with:\n    ${email}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seedAdmin failed:", err);
  process.exit(1);
});
