import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { PageHeader, Stat } from "../components/ui.js";

interface Totals {
  clients: number;
  chats: number;
  appointments: number;
  reviews: number;
  emails: number;
}

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

export function Overview() {
  const [t, setT] = useState<Totals | null>(null);

  useEffect(() => {
    (async () => {
      const [clients, chats, appointments] = await Promise.all([
        count("clients"),
        count("chat_sessions"),
        count("appointments"),
      ]);
      // Reviews generated = ratings at or above 4; emails sent = requests past 'pending'.
      const { data: rr } = await supabase.from("review_requests").select("stars_given,status");
      const reviews = (rr ?? []).filter((r) => (r.stars_given ?? 0) >= 4).length;
      const emails = (rr ?? []).filter((r) => r.status !== "pending").length;
      setT({ clients, chats, appointments, reviews, emails });
    })();
  }, []);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Performance across all your clients." />
      {!t ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Clients" value={t.clients} />
          <Stat label="Chats" value={t.chats} />
          <Stat label="Appointments" value={t.appointments} />
          <Stat label="Reviews" value={t.reviews} />
          <Stat label="Emails sent" value={t.emails} />
        </div>
      )}
    </div>
  );
}
