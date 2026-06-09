import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.js";
import { Button, Input } from "../components/ui.js";

/**
 * Shown when a user lands from a Supabase invite / recovery link. The link has
 * already established a session (supabase-js parsed it from the URL); here they
 * just choose a password via updateUser, after which they're fully logged in.
 */
export function SetPassword({ email, onDone }: { email?: string | null; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <div className="grid h-full place-items-center bg-slate-900">
      <form onSubmit={onSubmit} className="w-80 rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <span className="text-lg font-semibold">Set your password</span>
        </div>
        <p className="mb-5 text-sm text-slate-500">
          {email ? <>Welcome, <strong>{email}</strong>. </> : null}Choose a password to finish setting up your access.
        </p>
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            autoFocus
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <Button type="submit" disabled={busy} className="mt-5 w-full">
          {busy ? "Saving…" : "Set password & continue"}
        </Button>
      </form>
    </div>
  );
}
