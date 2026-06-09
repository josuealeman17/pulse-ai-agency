import { useEffect, useState } from "react";
import type { Client, GoogleReview, ReviewReplyStatus } from "@pulse/db";
import { supabase } from "../lib/supabase.js";
import {
  getGoogleReviews,
  postReviewReply,
  skipReviewReply,
  regenerateReviewReply,
} from "../lib/api.js";
import { Button, Card, PageHeader, Textarea } from "../components/ui.js";

const STATUS_BADGE: Record<ReviewReplyStatus, { label: string; cls: string }> = {
  pending_approval: { label: "Needs approval", cls: "bg-amber-100 text-amber-700" },
  posted: { label: "Posted", cls: "bg-emerald-100 text-emerald-700" },
  skipped: { label: "Skipped", cls: "bg-slate-100 text-slate-500" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
};

function Stars({ n }: { n: number }) {
  const filled = Math.max(0, Math.min(5, n));
  return (
    <span className="text-amber-500">
      {"★".repeat(filled)}
      <span className="text-slate-300">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

/** Reputation: review the AI's drafted replies. 4–5★ auto-post; 1–3★ land here for
 *  approval. `forcedClientId` scopes it for a client-role login. */
export function Reputation({ forcedClientId }: { forcedClientId?: string } = {}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(forcedClientId ?? "");
  const [reviews, setReviews] = useState<GoogleReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (forcedClientId) return;
    supabase
      .from("clients")
      .select("*")
      .order("name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        if (list[0]) setClientId(list[0].id);
      });
  }, [forcedClientId]);

  async function load(cid: string) {
    setLoading(true);
    setErr(null);
    const r = await getGoogleReviews(cid);
    if (r.error) setErr(r.error);
    setReviews(r.reviews);
    setLoading(false);
  }

  useEffect(() => {
    if (clientId) load(clientId);
  }, [clientId]);

  const pending = reviews.filter((r) => r.reply_status === "pending_approval" || r.reply_status === "failed");
  const handled = reviews.filter((r) => r.reply_status === "posted" || r.reply_status === "skipped");

  return (
    <div>
      <PageHeader
        title="Reputation"
        subtitle="AI replies to Google reviews — 4–5★ auto-post, 1–3★ wait for your approval."
      />

      {!forcedClientId && (
        <div className="mb-6 flex items-center gap-3">
          <span className="text-sm text-slate-500">Client:</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <p className="text-slate-400">Loading reviews…</p>}

      {!loading && reviews.length === 0 && !err && (
        <Card>
          <p className="text-sm text-slate-500">
            No reviews synced yet. Once the Google Business Profile is connected and Google approves API
            access, new reviews appear here automatically — positive ones replied to instantly, critical
            ones queued for your approval.
          </p>
        </Card>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Needs your approval</h2>
          <div className="space-y-4">
            {pending.map((r) => (
              <ReviewCard key={r.id} clientId={clientId} review={r} onChanged={() => load(clientId)} />
            ))}
          </div>
        </>
      )}

      {handled.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">Handled</h2>
          <div className="space-y-4">
            {handled.map((r) => (
              <ReviewCard key={r.id} clientId={clientId} review={r} onChanged={() => load(clientId)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReviewCard({
  clientId,
  review,
  onChanged,
}: {
  clientId: string;
  review: GoogleReview;
  onChanged: () => void;
}) {
  const [text, setText] = useState(review.reply_text ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const editable = review.reply_status === "pending_approval" || review.reply_status === "failed";
  const badge = STATUS_BADGE[review.reply_status];

  async function run(fn: () => Promise<{ ok?: boolean; text?: string; error?: string }>, reloadOnOk: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.error) setMsg(r.error);
    else if (r.text !== undefined) setText(r.text);
    else if (reloadOnOk) onChanged();
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Stars n={review.star_rating} />
            <span className="text-sm font-medium text-slate-900">{review.reviewer_name ?? "Anonymous"}</span>
            {review.review_created_at && (
              <span className="text-xs text-slate-400">{new Date(review.review_created_at).toLocaleDateString()}</span>
            )}
          </div>
          {review.comment && <p className="mt-1 text-sm text-slate-600">{review.comment}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        {editable ? (
          <>
            <div className="mb-1 text-xs font-medium text-slate-500">AI-drafted reply (edit before posting)</div>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button onClick={() => run(() => postReviewReply(clientId, review.id, text.trim()), true)} disabled={busy || !text.trim()}>
                {busy ? "Working…" : "Approve & post"}
              </Button>
              <Button variant="secondary" onClick={() => run(() => regenerateReviewReply(clientId, review.id), false)} disabled={busy}>
                Regenerate
              </Button>
              <Button variant="secondary" onClick={() => run(() => skipReviewReply(clientId, review.id), true)} disabled={busy}>
                Skip
              </Button>
              {msg && <span className="text-sm text-red-600">{msg}</span>}
            </div>
          </>
        ) : review.reply_text ? (
          <div className="text-sm text-slate-600">
            <span className="text-xs font-medium text-slate-500">
              Reply{review.reply_posted_at ? ` · ${new Date(review.reply_posted_at).toLocaleDateString()}` : ""}:
            </span>
            <p className="mt-1">{review.reply_text}</p>
          </div>
        ) : (
          <span className="text-sm text-slate-400">No reply.</span>
        )}
      </div>
    </Card>
  );
}
