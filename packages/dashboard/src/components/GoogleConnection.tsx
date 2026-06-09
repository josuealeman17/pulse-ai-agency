import { useEffect, useState } from "react";
import { getGoogleStatus, connectGoogle, disconnectGoogle, type GoogleStatus } from "../lib/api.js";
import { Button } from "./ui.js";

/** Connect a client's Google Business Profile via OAuth. The handshake bounces the
 *  browser to Google and back (?google=connected|error). The refresh token is held
 *  server-side and never read into the browser. */
export function GoogleConnection({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    setStatus(await getGoogleStatus(clientId));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // Surface (and clear) the OAuth callback result on return.
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") setMsg({ ok: true, text: "Google Business Profile connected." });
    else if (g === "error") setMsg({ ok: false, text: "Google connection failed — please try again." });
    if (g) {
      params.delete("google");
      const q = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function connect() {
    setBusy(true);
    setMsg(null);
    const r = await connectGoogle(clientId, window.location.href);
    setBusy(false);
    if (r.authUrl) window.location.href = r.authUrl;
    else setMsg({ ok: false, text: r.error ?? "Could not start the Google connection." });
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this Google Business Profile? Pulse will stop syncing reviews and posting responses.")) return;
    setBusy(true);
    setMsg(null);
    const r = await disconnectGoogle(clientId);
    setBusy(false);
    if (r.error) setMsg({ ok: false, text: r.error });
    else {
      setMsg({ ok: true, text: "Disconnected." });
      await refresh();
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading Google status…</p>;

  if (status && !status.configured) {
    return (
      <p className="text-sm text-amber-600">
        Google isn't configured on the server yet. Set <code>GOOGLE_CLIENT_ID</code> /{" "}
        <code>GOOGLE_CLIENT_SECRET</code> to enable connecting.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {status?.connected ? (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
            </span>
            {status.connectedAt && (
              <span className="text-slate-500">since {new Date(status.connectedAt).toLocaleDateString()}</span>
            )}
          </div>
          {!status.locationId && (
            <p className="text-xs text-amber-600">
              Connected, but no business location selected yet — location selection unlocks once Google
              approves Business Profile API access.
            </p>
          )}
          <Button variant="danger" onClick={disconnect} disabled={busy}>Disconnect</Button>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Connect the client's Google Business Profile so Pulse can display their reviews and post
            AI-drafted, SEO-optimized responses. Opens Google's secure sign-in.
          </p>
          <Button onClick={connect} disabled={busy}>{busy ? "Starting…" : "Connect Google"}</Button>
        </>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
