import { useEffect, useState } from "react";
import {
  getCalcomStatus,
  connectCalcom,
  setCalcomEventType,
  disconnectCalcom,
  type CalcomStatus,
} from "../lib/api.js";
import { Button, Field, Input } from "./ui.js";

const selectCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

/** Connect a client's own Cal.com account: paste an API key, then pick the event
 *  type the bot books into. The key is stored server-side and never read back. */
export function CalcomConnection({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CalcomStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [selectedEt, setSelectedEt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    const s = await getCalcomStatus(clientId);
    setStatus(s);
    setSelectedEt(s.eventTypeId ?? "");
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function connect() {
    if (!apiKey.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await connectCalcom(clientId, apiKey.trim());
    setBusy(false);
    if (r.error) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setApiKey("");
    setMsg({ ok: true, text: r.selectedEventTypeId ? "Connected." : "Connected — now pick the event type below." });
    await refresh();
  }

  async function saveEventType() {
    setBusy(true);
    setMsg(null);
    const r = await setCalcomEventType(clientId, selectedEt);
    setBusy(false);
    if (r.error) setMsg({ ok: false, text: r.error });
    else {
      setMsg({ ok: true, text: "Event type saved — the bot will book into it." });
      await refresh();
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this Cal.com account? The bot will stop live booking until reconnected.")) return;
    setBusy(true);
    setMsg(null);
    const r = await disconnectCalcom(clientId);
    setBusy(false);
    if (r.error) setMsg({ ok: false, text: r.error });
    else {
      setMsg({ ok: true, text: "Disconnected." });
      await refresh();
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading Cal.com status…</p>;

  const connected = status?.connected;
  const active = status?.eventTypes.find((e) => e.id === status.eventTypeId);

  return (
    <div className="space-y-3">
      {!connected ? (
        <>
          <Field
            label="Cal.com API key"
            hint="In Cal.com: Settings → Developer → API keys. Stored securely; never shown again."
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="cal_live_…"
              autoComplete="off"
            />
          </Field>
          <Button onClick={connect} disabled={busy || !apiKey.trim()}>
            {busy ? "Connecting…" : "Connect Cal.com"}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
            </span>
            {active && <span className="text-slate-500">Active event type: <strong>{active.title}</strong></span>}
          </div>

          {status && status.eventTypes.length > 0 ? (
            <Field
              label="Event type the bot books into"
              hint="Use the same event type you embed on the client's website."
            >
              <div className="flex gap-2">
                <select value={selectedEt} onChange={(e) => setSelectedEt(e.target.value)} className={selectCls}>
                  <option value="" disabled>Select an event type…</option>
                  {status.eventTypes.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.title}{et.lengthInMinutes ? ` (${et.lengthInMinutes} min)` : ""}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  onClick={saveEventType}
                  disabled={busy || !selectedEt || selectedEt === status.eventTypeId}
                >
                  Save
                </Button>
              </div>
            </Field>
          ) : (
            <p className="text-sm text-amber-600">
              {status?.listError
                ? `Couldn't load event types: ${status.listError}`
                : "No event types found on this Cal.com account. Create one in Cal.com, then reconnect."}
            </p>
          )}

          <Button variant="danger" onClick={disconnect} disabled={busy}>Disconnect</Button>
        </>
      )}

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
