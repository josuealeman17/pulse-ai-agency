import { useEffect, useState } from "react";
import type { Client, ReviewCampaign, CampaignType } from "@pulse/db";
import { CAMPAIGN_PRESETS } from "@pulse/db";
import { supabase } from "../lib/supabase.js";
import { uploadRecipients, webhookUrl, rotateWebhookToken, type SendReport } from "../lib/api.js";
import { Button, Card, Field, Input, PageHeader, Textarea } from "../components/ui.js";

interface Agg {
  total: number;
  sent: number;
  clicked: number;
  reviews: number;
  feedback: number;
}

const TYPE_LABELS: Record<CampaignType, string> = {
  google_review: "Google Review",
  reactivation: "Reactivation",
};

const selectCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

export function Campaigns() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [campaigns, setCampaigns] = useState<ReviewCampaign[]>([]);
  const [stats, setStats] = useState<Record<string, Agg>>({});
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CampaignType>("google_review");

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
    const preset = CAMPAIGN_PRESETS[newType];
    await supabase.from("review_campaigns").insert({
      client_id: clientId,
      name: newName.trim(),
      status: "active",
      campaign_type: newType,
      email_subject_1: preset.subjects[0],
      email_subject_2: preset.subjects[1],
      email_subject_3: preset.subjects[2],
      email_body_1: preset.bodies[0],
      email_body_2: preset.bodies[1],
      email_body_3: preset.bodies[2],
      incentive: preset.incentive,
      reminder_1_delay_hours: preset.reminder1DelayHours,
      reminder_2_delay_hours: preset.reminder2DelayHours,
    });
    setNewName("");
    load(clientId);
  }

  return (
    <div>
      <PageHeader title="Review Campaigns" subtitle="Send branded review requests and track results." />

      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm text-slate-500">Client:</span>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectCls + " w-auto"}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <Card className="mb-6">
        <div className="flex items-end gap-3">
          <div className="w-56">
            <Field label="Campaign type" hint={CAMPAIGN_PRESETS[newType].description}>
              <select value={newType} onChange={(e) => setNewType(e.target.value as CampaignType)} className={selectCls}>
                {(Object.keys(CAMPAIGN_PRESETS) as CampaignType[]).map((t) => (
                  <option key={t} value={t}>{CAMPAIGN_PRESETS[t].label}</option>
                ))}
              </select>
            </Field>
          </div>
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
  const [editing, setEditing] = useState(false);
  const [hook, setHook] = useState(false);
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
  const type = campaign.campaign_type ?? "google_review";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{campaign.name}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {TYPE_LABELS[type]}
            </span>
            {campaign.status !== "active" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                {campaign.status}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            Threshold: {campaign.satisfaction_threshold}★ → Google · Reminders at{" "}
            {campaign.reminder_1_delay_hours ?? 48}h / {campaign.reminder_2_delay_hours ?? 120}h
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing((e) => !e)}>{editing ? "Close" : "Edit"}</Button>
          <Button variant="secondary" onClick={() => setHook((h) => !h)}>{hook ? "Close" : "Automation"}</Button>
          <Button variant="secondary" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Add recipients"}</Button>
        </div>
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

      {editing && (
        <CampaignEditor campaign={campaign} onSaved={() => { setEditing(false); onChanged(); }} />
      )}

      {hook && <WebhookPanel campaign={campaign} onRotated={onChanged} />}

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
                  : `Sent ${report.sent} · added ${report.added} · deduped ${report.deduped} · skipped ${report.skipped} · failed ${report.failed}`}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** The automation panel: surfaces the per-campaign trigger URL + token so a
 *  client's CRM / job system / Google Sheet can fire a review request on job-done.
 *  The token is a secret (it lets anyone create requests for this campaign), so
 *  it's revealed on demand and rotatable. */
function WebhookPanel({ campaign, onRotated }: { campaign: ReviewCampaign; onRotated: () => void }) {
  const [reveal, setReveal] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const url = webhookUrl(campaign.id);
  const token = campaign.webhook_token ?? "";

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    });
  }

  async function rotate() {
    const msg = token
      ? "Rotate the token? Any CRM/Sheet using the old one will stop working until you update it."
      : "Generate a trigger token for this campaign?";
    if (!confirm(msg)) return;
    setRotating(true);
    const r = await rotateWebhookToken(campaign.id);
    setRotating(false);
    if (r.error) alert(r.error);
    else onRotated();
  }

  const curl =
    `curl -X POST "${url}" \\\n` +
    `  -H "Authorization: Bearer ${reveal ? token || "<TOKEN>" : "••••••••••••"}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"name":"Jane Doe","email":"jane@example.com"}'`;

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <p className="text-xs text-slate-500">
        Fire a review request automatically when a job is marked done. Point a CRM webhook, Zap, or
        Google Sheet at this endpoint and authenticate with the token below. Re-fires of the same
        email within 14 days are deduped, so retries won't double-email.
      </p>

      <Field label="Endpoint (POST)">
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="secondary" onClick={() => copy("url", url)}>{copied === "url" ? "Copied" : "Copy"}</Button>
        </div>
      </Field>

      <Field label="Token (secret — sends as Bearer auth)">
        {token ? (
          <div className="flex gap-2">
            <Input readOnly value={reveal ? token : "•".repeat(24)} className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" onClick={() => setReveal((r) => !r)}>{reveal ? "Hide" : "Reveal"}</Button>
            <Button variant="secondary" onClick={() => copy("token", token)}>{copied === "token" ? "Copied" : "Copy"}</Button>
          </div>
        ) : (
          <p className="text-xs text-amber-600">No token yet — generate one to enable the trigger.</p>
        )}
      </Field>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Example request</div>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{curl}</pre>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={rotate} disabled={rotating}>
          {rotating ? "Working…" : token ? "Rotate token" : "Generate token"}
        </Button>
        {token && <span className="text-xs text-slate-400">Rotating invalidates the old token immediately.</span>}
      </div>
    </div>
  );
}

/** Inline editor for a campaign's settings and copy. Writes directly via Supabase
 *  (authenticated admins have full access under RLS). Steps map to: 1 = initial,
 *  2 = reminder, 3 = final. */
function CampaignEditor({ campaign, onSaved }: { campaign: ReviewCampaign; onSaved: () => void }) {
  const type = campaign.campaign_type ?? "google_review";
  const preset = CAMPAIGN_PRESETS[type];
  const [draft, setDraft] = useState({
    name: campaign.name,
    status: campaign.status,
    campaign_type: type,
    satisfaction_threshold: campaign.satisfaction_threshold,
    reminder_1_delay_hours: campaign.reminder_1_delay_hours ?? preset.reminder1DelayHours,
    reminder_2_delay_hours: campaign.reminder_2_delay_hours ?? preset.reminder2DelayHours,
    incentive: campaign.incentive ?? "",
    email_subject_1: campaign.email_subject_1,
    email_subject_2: campaign.email_subject_2,
    email_subject_3: campaign.email_subject_3,
    email_body_1: campaign.email_body_1 ?? preset.bodies[0],
    email_body_2: campaign.email_body_2 ?? preset.bodies[1],
    email_body_3: campaign.email_body_3 ?? preset.bodies[2],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("review_campaigns")
      .update({
        ...draft,
        incentive: draft.incentive.trim() || null,
      })
      .eq("id", campaign.id);
    setSaving(false);
    if (err) setError(err.message);
    else onSaved();
  }

  const steps = [
    { n: 1, label: "Initial email (sent immediately)", sub: "email_subject_1", body: "email_body_1" },
    { n: 2, label: "Reminder", sub: "email_subject_2", body: "email_body_2" },
    { n: 3, label: "Final", sub: "email_subject_3", body: "email_body_3" },
  ] as const;

  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Name"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Status">
          <select value={draft.status} onChange={(e) => set("status", e.target.value as ReviewCampaign["status"])} className={selectCls}>
            {(["active", "paused", "draft", "completed"] as const).map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </Field>
        <Field label="Type" hint="Drives default copy">
          <select value={draft.campaign_type} onChange={(e) => set("campaign_type", e.target.value as CampaignType)} className={selectCls}>
            {(Object.keys(CAMPAIGN_PRESETS) as CampaignType[]).map((t) => (
              <option key={t} value={t}>{CAMPAIGN_PRESETS[t].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Google threshold (★)" hint="At/above → Google; below → private">
          <Input type="number" min={1} max={5} value={draft.satisfaction_threshold}
            onChange={(e) => set("satisfaction_threshold", Number(e.target.value))} />
        </Field>
        <Field label="Reminder after (hours)">
          <Input type="number" min={1} value={draft.reminder_1_delay_hours}
            onChange={(e) => set("reminder_1_delay_hours", Number(e.target.value))} />
        </Field>
        <Field label="Final after (hours)">
          <Input type="number" min={1} value={draft.reminder_2_delay_hours}
            onChange={(e) => set("reminder_2_delay_hours", Number(e.target.value))} />
        </Field>
      </div>

      <Field
        label="Incentive (optional)"
        hint="Shown as a highlighted offer. Frame it as a next-purchase reward — never 'for leaving a review'."
      >
        <Input value={draft.incentive} onChange={(e) => set("incentive", e.target.value)}
          placeholder="Enjoy 5% off your next visit" />
      </Field>

      {steps.map((step) => (
        <div key={step.n} className="rounded-lg border border-slate-100 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{step.label}</div>
          <div className="space-y-2">
            <Field label="Subject">
              <Input value={draft[step.sub]} onChange={(e) => set(step.sub, e.target.value)} />
            </Field>
            <Field label="Message" hint="Use {{first_name}} and {{business_name}}. Blank lines = new paragraph.">
              <Textarea rows={4} value={draft[step.body]} onChange={(e) => set(step.body, e.target.value)} />
            </Field>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
