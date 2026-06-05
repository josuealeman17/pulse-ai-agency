import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { Button, Input } from "../components/ui.js";

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setBusy(false);
  }

  return (
    <div className="grid h-full place-items-center bg-slate-900">
      <form onSubmit={onSubmit} className="w-80 rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <span className="text-lg font-semibold">Pulse Admin</span>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="space-y-3">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" disabled={busy} className="mt-5 w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
