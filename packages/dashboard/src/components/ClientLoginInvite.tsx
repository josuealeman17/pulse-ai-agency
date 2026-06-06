import { useState } from "react";
import { inviteClientLogin } from "../lib/api.js";
import { Button, Field, Input } from "./ui.js";

/** Admin control: invite a business owner to their scoped client dashboard. */
export function ClientLoginInvite({ clientId }: { clientId: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await inviteClientLogin(clientId, email.trim());
    setBusy(false);
    if (r.error) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setEmail("");
    setMsg({
      ok: true,
      text: r.existing
        ? `Linked existing account ${r.email} to this client.`
        : `Invite sent to ${r.email}. They'll set a password via the email link.`,
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Business owner email" hint="They receive a Supabase invite to set their password.">
        <div className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@business.com"
            autoComplete="off"
          />
          <Button onClick={invite} disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </Field>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
