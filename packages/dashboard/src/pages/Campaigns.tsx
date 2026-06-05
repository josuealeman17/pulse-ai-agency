import { useEffect, useState } from "react";
import type { Client, ReviewCampaign } from "@pulse/db";
import { supabase } from "../lib/supabase.js";
import { uploadRecipients, type SendReport } from "../lib/api.js";
import { Button, Card, Field, Input, PageHeader, Textarea } from "../components/ui.js";

interface Agg {
  total: number;
  sent: number;
  clicked: number;
  reviews: number;
  feedback: number;
}

export function Campaigns() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [campaigns, setCampaigns] = useState<ReviewCampaign[]>([]);
  const [stats, setStats] = useState<Record<string, Agg>>({});
  const [newName, setNewName] = useState("");

  useEffect(() => {
    supabase.from("clients").select("*").order("name").then(({ data }) => {
      const list = (data as Client[]) ?? [];
      setClients(list);
      if (list[0]) setClientId(list[0].id);
    });
  }, []);

  async function load(cid: string) {
    const { data: camps } = await supabase
      .from("review_campaigns")
      .select("*")
      .eq("client_id", cid)
      .order("created_at", { ascending: false });
    const list = (camps as ReviewCampaign[]) ?? [];
    setCampaigns(list);

    const { data: reqs } = await supabase
      .from("review_requests")
      .select("campaign_id,status,stars_given")
      .eq("client_id", cid);
    const agg: Record<string, Agg> = {};
    for (const camp of list) agg[camp.id] = { total: 0, sent: 0, clicked: 0, reviews: 0, feedback: 0 };
    for (const r of reqs ?? []) {
      const a = agg[r.campaign_id];
      if (!a) continue;
      const camp = list.find((c) => c.id === r.campaign_id);
      const threshold = camp?.satisfaction_threshold ?? 4;
      a.total++;
      if (r.status !== "pending") a.sent++;
      if (r.stars_given != null) {
        a.clicked++;
        if (r.stars_given >= threshold) a.reviews++;
        else a.feedback++;
      }
    }
    setStats(agg);
  }

  useEffect(() => {
    if (clientId) load(clientId);
  }, [clientId]);

  async function createCampaign() {
    if (!newName.trim() || !clientId) return;
    await supabase.from("review_campaigns").insert({ client_id: clientId, name: newName.trim(), status: "active" });
    setNewName("");
    load(clientId);
  }

  return (
    <div>
      <PageHeader title="Review Campaigns" subtitle="Send branded review requests and track results." />

      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm text-slate-500">Client:</span>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <Card className="mb-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="New campaign name">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="June Customers" />
            </Field>
          </div>
          <Button onClick={createCampaign} disabled={!newName.trim()}>Create campaign</Button>
        </div>
      </Card>

      <div className="space-y-4">
        {campaigns.length === 0 && <p className="text-slate-400">No campaigns yet for this client.</p>}
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} agg={stats[c.id]} onChanged={() => load(clientId)} />
        ))}
      </div>
    </div>
  );
}

function CampaignCard({ campaign, agg, onChanged }: { campaign: ReviewCampaign; agg?: Agg; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SendReport | null>(null);

  async function send() {
    setBusy(true);
    setReport(null);
    const r = await uploadRecipients(campaign.id, csv);
    setReport(r);
    setBusy(false);
    if (!r.error) {
      setCsv("");
      onChanged();
    }
  }

  const s = agg ?? { total: 0, sent: 0, clicked: 0, reviews: 0, feedback: 0 };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-900">{campaign.name}</div>
          <div className="text-xs text-slate-400">Threshold: {campaign.satisfaction_threshold}★ → Google</div>
        </div>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Add recipients"}</Button>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2 text-center">
        {([["Sent", s.sent], ["Clicked", s.clicked], ["Reviews", s.reviews], ["Feedback", s.feedback], ["Total", s.total]] as const).map(
          ([label, val]) => (
            <div key={label} className="rounded-lg bg-slate-50 py-2">
              <div className="text-lg font-semibold tabular-nums">{val}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
            </div>
          ),
        )}
      </div>

      {open && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Field label="Paste CSV (name,email — one per line)">
            <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,email\nJane Doe,jane@example.com"} />
          </Field>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={send} disabled={busy || !csv.trim()}>{busy ? "Sending…" : "Send review requests"}</Button>
            {report && (
              <span className="text-sm text-slate-500">
                {report.error
                  ? <span className="text-red-600">{report.error}</span>
                  : `Sent ${report.sent} · added ${report.added} · skipped ${report.skipped} · failed ${report.failed}`}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
