import type { ChatMessage } from "@pulse/db";
import { getSupabase } from "./supabase.js";

export interface PersistArgs {
  sessionId: string | null;
  clientId: string;
  visitorId: string | null;
  messages: ChatMessage[];
  appointmentBooked: boolean;
  transferredToHuman: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert a chat session row. No-op when Supabase is not configured (Phase 1).
 * Returns the session id used (the provided one, or a freshly generated row id),
 * or null when persistence is disabled.
 */
export async function persistSession(args: PersistArgs): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || args.clientId === "demo") return null;

  const row = {
    client_id: args.clientId,
    visitor_id: args.visitorId,
    messages: args.messages,
    appointment_booked: args.appointmentBooked,
    transferred_to_human: args.transferredToHuman,
    message_count: args.messages.length,
    metadata: args.metadata ?? {},
  };

  if (args.sessionId) {
    const { error } = await supabase
      .from("chat_sessions")
      .update(row)
      .eq("id", args.sessionId);
    if (error) console.error("[sessions] update failed:", error.message);
    return args.sessionId;
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert(row)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    console.error("[sessions] insert failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}
