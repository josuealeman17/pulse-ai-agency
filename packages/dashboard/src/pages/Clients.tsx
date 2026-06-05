import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Client } from "@pulse/db";
import { supabase } from "../lib/supabase.js";
import { Button, Card, PageHeader } from "../components/ui.js";

export function Clients() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Every business you manage."
        action={<Button onClick={() => navigate("/clients/new")}>+ Add client</Button>}
      />

      {clients === null ? (
        <p className="text-slate-400">Loading…</p>
      ) : clients.length === 0 ? (
        <Card>
          <p className="text-slate-500">No clients yet. Add your first business to get started.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Booking</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: c.accent_color }}
                      />
                      <span className="font-medium text-slate-900">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{c.business_type ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {c.booking_mode === "calcom" && c.calcom_event_type_id ? "Cal.com" : "Capture"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link to={`/clients/${c.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
