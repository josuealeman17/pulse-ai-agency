-- ─────────────────────────────────────────────────────────────
-- Pulse — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ─────────────────────────────────────────────────────────────

-- Multi-tenant clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_type TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  google_review_url TEXT,
  logo_url TEXT,
  accent_color TEXT DEFAULT '#2563EB',
  -- Booking config (Model B: Pulse-managed). 'calcom' books live; 'capture' just
  -- records the request + emails the client (no calendar).
  booking_mode TEXT DEFAULT 'calcom',
  -- The client's event type on the Pulse Cal.com account.
  calcom_event_type_id TEXT,
  -- Optional per-client API key. NULL = use the global Pulse key (CALCOM_API_KEY env).
  calcom_api_key TEXT,
  calcom_timezone TEXT DEFAULT 'America/Denver',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chatbot configuration per client
CREATE TABLE IF NOT EXISTS chat_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL,
  greeting_message TEXT DEFAULT 'Hi! How can I help you today?',
  business_info JSONB,
  tools_enabled TEXT[] DEFAULT ARRAY['book_appointment', 'get_available_slots', 'transfer_to_human'],
  max_messages_per_session INT DEFAULT 50,
  max_sessions_per_day INT DEFAULT 200,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- Chat conversation logs
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  visitor_id TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  tool_calls JSONB DEFAULT '[]',
  appointment_booked BOOLEAN DEFAULT false,
  transferred_to_human BOOLEAN DEFAULT false,
  message_count INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Review campaigns
CREATE TABLE IF NOT EXISTS review_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  campaign_type TEXT DEFAULT 'google_review',
  satisfaction_threshold INT DEFAULT 4,
  email_subject_1 TEXT DEFAULT 'How was your experience at {{business_name}}?',
  email_subject_2 TEXT DEFAULT 'Quick reminder — we''d love your feedback!',
  email_subject_3 TEXT DEFAULT 'Last chance to share your experience',
  email_body_1 TEXT,
  email_body_2 TEXT,
  email_body_3 TEXT,
  incentive TEXT,
  reminder_1_delay_hours INT DEFAULT 48,
  reminder_2_delay_hours INT DEFAULT 120,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual review requests (one per customer per campaign)
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES review_campaigns(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  stars_given INT,
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  reminder_1_sent BOOLEAN DEFAULT false,
  reminder_1_at TIMESTAMPTZ,
  reminder_2_sent BOOLEAN DEFAULT false,
  reminder_2_at TIMESTAMPTZ,
  feedback_text TEXT,
  rated_ip TEXT,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments booked via chatbot
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  chat_session_id UUID REFERENCES chat_sessions(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  service_type TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  external_booking_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agency admin users (Supabase Auth handles auth; this stores role/permissions)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT DEFAULT 'admin',
  client_id UUID REFERENCES clients(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_client ON chat_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_campaign ON review_requests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
