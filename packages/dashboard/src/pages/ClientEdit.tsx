import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { BusinessInfo, ChatConfig, Client } from "@pulse/db";
import { supabase, API_URL, WIDGET_URL } from "../lib/supabase.js";
import { Button, Card, Field, Input, PageHeader, Textarea } from "../components/ui.js";
import { CalcomConnection } from "../components/CalcomConnection.js";
import { GoogleConnection } from "../components/GoogleConnection.js";
import { ClientLoginInvite } from "../components/ClientLoginInvite.js";
import { deleteClient } from "../lib/api.js";

type ClientForm = Pick<
  Client,
  | "name" | "business_type" | "city" | "state" | "phone" | "email" | "website_url"
  | "google_review_url" | "accent_color" | "calcom_timezone"
>;

const blankClient: ClientForm = {
  name: "", business_type: "", city: "", state: "", phone: "", email: "",
  website_url: "", google_review_url: "", accent_color: "#2563EB",
  calcom_timezone: "America/Denver",
};
const blankInfo: BusinessInfo = {
  business_info: "", services_list: "", hours: "", pricing_info: "", policies: "", faqs: "",
};

export function ClientEdit({ forcedId }: { forcedId?: string } = {}) {
  const params = useParams();
  const id = forcedId ?? params.id;
  const isNew = !id;
  // Client self-service mode: a business owner editing their own record (vs an admin).
  const clientMode = Boolean(forcedId);
  const navigate = useNavigate();

  const [client, setClient] = useState<ClientForm>(blankClient);
  const [info, setInfo] = useState<BusinessInfo>(blankInfo);
  const [greeting, setGreeting] = useState("Hi! 👋 How can I help you today?");
  const [promptOverride, setPromptOverride] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data: c } = await supabase.from("clients").select("*").eq("id", id).maybeSingle<Client>();
      const { data: cfg } = await supabase.from("chat_configs").select("*").eq("client_id", id).maybeSingle<ChatConfig>();
      if (c) {
        setClient({
          name: c.name, business_type: c.business_type ?? "", city: c.city ?? "", state: c.state ?? "",
          phone: c.phone ?? "", email: c.email ?? "", website_url: c.website_url ?? "",
          google_review_url: c.google_review_url ?? "", accent_color: c.accent_color,
          calcom_timezone: c.calcom_timezone,
        });
      }
      if (cfg) {
        setGreeting(cfg.greeting_message);
        setInfo({ ...blankInfo, ...(cfg.business_info ?? {}) });
        setPromptOverride(cfg.system_prompt ?? "");
      }
      setLoading(false);
    })();
  }, [id, isNew]);

  function set<K extends keyof ClientForm>(k: K, v: ClientForm[K]) {
    setClient((p) => ({ ...p, [k]: v }));
  }
  function setI<K extends keyof BusinessInfo>(k: K, v: string) {
    setInfo((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!client.name.trim()) {
      setError("Business name is required.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = { ...client };

    let clientId = id;
    if (isNew) {
      const { data, error } = await supabase.from("clients").insert(payload).select("id").single<{ id: string }>();
      if (error || !data) {
        setError(error?.message ?? "Could not create client");
        setSaving(false);
        return;
      }
      clientId = data.id;
    } else {
      const { error } = await supabase.from("clients").update(payload).eq("id", id);
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }

    const { error: cfgErr } = await supabase.from("chat_configs").upsert(
      {
        client_id: clientId,
        system_prompt: promptOverride.trim(), // empty → API renders from business_info
        greeting_message: greeting,
        business_info: info,
        is_active: true,
      },
      { onConflict: "client_id" },
    );
    if (cfgErr) {
      setError(cfgErr.message);
      setSaving(false);
      return;
    }
    navigate(clientMode ? "/" : "/clients");
  }

  async function confirmDelete() {
    if (!id) return;
    setDeleting(true);
    const result = await deleteClient(id);
    if (result.error) {
      setDeleting(false);
      setShowDeleteModal(false);
      setError(result.error);
      return;
    }
    navigate("/clients");
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const widgetBase = WIDGET_URL.replace(/\/$/, "");
  const apiBase = API_URL.replace(/\/$/, "");
  const embed = `<script\n  src="${widgetBase}/chat.js"\n  data-client-id="${id}"\n  data-api="${apiBase}"\n  data-accent="${client.accent_color}"\n  async\n></script>`;

  return (
    <div>
      <PageHeader
        title={isNew ? "New client" : client.name || "Edit client"}
        subtitle="Business details, chatbot knowledge, booking, and branding."
        action={
          <div className="flex gap-2">
            {!isNew && !clientMode && (
              <Button variant="danger" onClick={() => { setDeleteInput(""); setShowDeleteModal(true); }}>
                Delete client
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(clientMode ? "/" : "/clients")}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Business details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Business name"><Input value={client.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Business type"><Input value={client.business_type ?? ""} onChange={(e) => set("business_type", e.target.value)} placeholder="auto detailing shop" /></Field>
            <Field label="City"><Input value={client.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="State"><Input value={client.state ?? ""} onChange={(e) => set("state", e.target.value)} /></Field>
            <Field label="Phone"><Input value={client.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Email" hint="Where booking/feedback notifications go"><Input value={client.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Website"><Input value={client.website_url ?? ""} onChange={(e) => set("website_url", e.target.value)} /></Field>
            <Field label="Google review URL" hint="Where 4–5★ raters are sent"><Input value={client.google_review_url ?? ""} onChange={(e) => set("google_review_url", e.target.value)} /></Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Chatbot knowledge</h2>
          <p className="mb-4 text-xs text-slate-400">The bot answers using only what you provide here.</p>
          <div className="space-y-4">
            <Field label="Greeting"><Input value={greeting} onChange={(e) => setGreeting(e.target.value)} /></Field>
            <Field label="About the business"><Textarea rows={2} value={info.business_info} onChange={(e) => setI("business_info", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Services"><Textarea rows={4} value={info.services_list} onChange={(e) => setI("services_list", e.target.value)} /></Field>
              <Field label="Hours"><Textarea rows={4} value={info.hours} onChange={(e) => setI("hours", e.target.value)} /></Field>
              <Field label="Pricing"><Textarea rows={3} value={info.pricing_info} onChange={(e) => setI("pricing_info", e.target.value)} /></Field>
              <Field label="Policies"><Textarea rows={3} value={info.policies} onChange={(e) => setI("policies", e.target.value)} /></Field>
            </div>
            <Field label="FAQs"><Textarea rows={3} value={info.faqs} onChange={(e) => setI("faqs", e.target.value)} /></Field>
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm text-slate-500">Advanced: custom system prompt override</summary>
              <p className="my-2 text-xs text-slate-400">Leave blank to auto-build the prompt from the fields above.</p>
              <Textarea rows={6} value={promptOverride} onChange={(e) => setPromptOverride(e.target.value)} />
            </details>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Branding & timezone</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timezone" hint="Used for Cal.com availability & booking times"><Input value={client.calcom_timezone} onChange={(e) => set("calcom_timezone", e.target.value)} /></Field>
            <Field label="Accent color">
              <div className="flex items-center gap-2">
                <input type="color" value={client.accent_color} onChange={(e) => set("accent_color", e.target.value)} className="h-9 w-12 rounded border border-slate-300" />
                <Input value={client.accent_color} onChange={(e) => set("accent_color", e.target.value)} />
              </div>
            </Field>
          </div>
        </Card>

        {!isNew && id && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Cal.com booking</h2>
            <p className="mb-4 text-xs text-slate-400">
              Connect this client's own Cal.com account. The bot books into the event type you pick here — use the
              same one they embed on their website, so Cal.com handles availability and conflicts across both.
            </p>
            <CalcomConnection clientId={id} />
          </Card>
        )}

        {!isNew && id && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Google Business Profile</h2>
            <p className="mb-4 text-xs text-slate-400">
              Connect the client's Google reviews so Pulse can display them on their site and post
              AI-drafted, SEO-optimized responses. The connection is held securely server-side.
            </p>
            <GoogleConnection clientId={id} />
          </Card>
        )}

        {!isNew && (
          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Widget embed</h2>
            <p className="mb-3 text-xs text-slate-400">Paste this into the client's website.</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{embed}</pre>
            <Button variant="secondary" className="mt-3" onClick={() => navigator.clipboard.writeText(embed)}>Copy snippet</Button>
          </Card>
        )}

        {!isNew && !clientMode && id && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Client login</h2>
            <p className="mb-4 text-xs text-slate-400">
              Invite the business owner to a scoped dashboard where they can view their reports, connect Cal.com, and
              edit their chatbot knowledge — and nothing else.
            </p>
            <ClientLoginInvite clientId={id} />
          </Card>
        )}
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Delete {client.name}?</h2>
            <p className="mb-4 text-sm text-slate-500">
              This permanently removes the client and all their data — campaigns, reviews, conversations, and
              bot configuration. This cannot be undone.
            </p>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Type <span className="font-mono text-red-600">delete-client</span> to confirm:
            </p>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="delete-client"
              className="mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDelete}
                disabled={deleteInput !== "delete-client" || deleting}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
