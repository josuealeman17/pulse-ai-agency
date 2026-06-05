// ─────────────────────────────────────────────────────────────
// Shared domain types — mirror the Supabase schema (schema.sql).
// Imported by @pulse/api and @pulse/dashboard.
// ─────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  business_type: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  google_review_url: string | null;
  logo_url: string | null;
  accent_color: string;
  booking_mode: BookingMode;
  calcom_event_type_id: string | null;
  calcom_api_key: string | null;
  calcom_timezone: string;
  created_at: string;
  updated_at: string;
}

export type BookingMode = "calcom" | "capture";

/** Structured business data injected into the system prompt template. */
export interface BusinessInfo {
  business_info?: string;
  services_list?: string;
  hours?: string;
  pricing_info?: string;
  policies?: string;
  faqs?: string;
}

export type ToolName = "book_appointment" | "get_available_slots" | "transfer_to_human";

export interface ChatConfig {
  id: string;
  client_id: string;
  system_prompt: string;
  greeting_message: string;
  business_info: BusinessInfo | null;
  tools_enabled: ToolName[];
  max_messages_per_session: number;
  max_sessions_per_day: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A single chat message in a session (Anthropic-compatible shape, simplified for storage). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  client_id: string;
  visitor_id: string | null;
  messages: ChatMessage[];
  tool_calls: unknown[];
  appointment_booked: boolean;
  transferred_to_human: boolean;
  message_count: number;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
}

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface ReviewCampaign {
  id: string;
  client_id: string;
  name: string;
  status: CampaignStatus;
  satisfaction_threshold: number;
  email_subject_1: string;
  email_subject_2: string;
  email_subject_3: string;
  created_at: string;
}

export type ReviewRequestStatus = "pending" | "sent" | "clicked" | "completed" | "bounced";

export interface ReviewRequest {
  id: string;
  campaign_id: string;
  client_id: string;
  customer_name: string;
  customer_email: string;
  token: string;
  status: ReviewRequestStatus;
  stars_given: number | null;
  sent_at: string | null;
  clicked_at: string | null;
  reminder_1_sent: boolean;
  reminder_1_at: string | null;
  reminder_2_sent: boolean;
  reminder_2_at: string | null;
  feedback_text: string | null;
  rated_ip: string | null;
  unsubscribed_at: string | null;
  created_at: string;
}

export type AppointmentStatus = "pending" | "confirmed" | "cancelled";

export interface Appointment {
  id: string;
  client_id: string;
  chat_session_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  service_type: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  notes: string | null;
  status: AppointmentStatus;
  external_booking_id: string | null;
  created_at: string;
}

// ─── Wire types: the /chat API request/response contract ───

export interface ChatRequest {
  clientId: string;
  sessionId?: string;
  visitorId?: string;
  messages: ChatMessage[];
  metadata?: Record<string, unknown>;
}
