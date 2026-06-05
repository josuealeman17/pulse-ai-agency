import { getSupabase } from "./supabase.js";

export interface NewAppointment {
  clientId: string;
  chatSessionId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  serviceType?: string;
  preferredDate?: string;
  preferredTime?: string;
  notes?: string;
  externalBookingId?: string;
  status?: "pending" | "confirmed" | "cancelled";
}

/**
 * Insert an appointment row. No-op (returns null) without Supabase or for the
 * demo client — the chatbot still confirms verbally; this is just bookkeeping.
 */
export async function insertAppointment(appt: NewAppointment): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || appt.clientId === "demo") return null;

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      client_id: appt.clientId,
      chat_session_id: appt.chatSessionId,
      customer_name: appt.customerName,
      customer_email: appt.customerEmail,
      customer_phone: appt.customerPhone ?? null,
      service_type: appt.serviceType ?? null,
      preferred_date: appt.preferredDate ?? null,
      preferred_time: appt.preferredTime ?? null,
      notes: appt.notes ?? null,
      external_booking_id: appt.externalBookingId ?? null,
      status: appt.status ?? "pending",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    console.error("[appointments] insert failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}
