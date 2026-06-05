import { useEffect, useState } from "react";
import type { ChatMessage, ChatSession, Client } from "@pulse/db";
import { supabase } from "../lib/supabase.js";
import { Card, PageHeader } from "../components/ui.js";

export function Conversations() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [active, setActive] = useState<ChatSession | null>(null);

  useEffect(() => {
    supabase.from("clients").select("*").order("name").then(({ data }) => {
      const list = (data as Client[]) ?? [];
      setClients(list);
      if (list[0]) setClientId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!clientId) return;
    setActive(null);
    supabase
      .from("chat_sessions")
      .select("*")
      .eq("client_id", clientId)
      .order("started_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setSessions((data as ChatSession[]) ?? []));
  }, [clientId]);

  return (
    <div>
      <PageHeader title="Conversations" subtitle="Every chat your bots have handled." />

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

      {sessions.length === 0 ? (
        <p className="text-slate-400">No conversations yet for this client.</p>
      ) : (
        <div className="grid grid-cols-[280px_1fr] gap-4">
          <div className="space-y-1">
            {sessions.map((s) => {
              const msgs = (s.messages as ChatMessage[]) ?? [];
              const first = msgs.find((m) => m.role === "user")?.content ?? "(no messages)";
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    active?.id === s.id ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="truncate font-medium text-slate-800">{first}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{new Date(s.started_at).toLocaleString()}</span>
                    {s.appointment_booked && <span className="text-emerald-600">· booked</span>}
                    {s.transferred_to_human && <span className="text-amber-600">· transfer</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <Card className="min-h-[300px]">
            {!active ? (
              <p className="text-slate-400">Select a conversation to read the transcript.</p>
            ) : (
              <div className="space-y-3">
                {((active.messages as ChatMessage[]) ?? []).map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                        m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
