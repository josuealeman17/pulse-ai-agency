# PRD: SceneWithin Review Engine & AI Chatbot Platform

> **Document Version:** 1.0
> **Author:** Josue Aleman / SceneWithin
> **Date:** June 2026
> **Status:** Ready for Development

---

## INSTRUCTIONS FOR CLAUDE CODE

**Read this entire PRD before writing any code.**

You are building a production SaaS platform for SceneWithin, a creative agency based in Salt Lake City. This platform will be sold as a retainer service to local businesses. Before starting each phase, you MUST:

1. **Think out loud** — explain your approach, tradeoffs, and reasoning before writing code.
2. **Ask clarifying questions** — if any requirement is ambiguous, ask before assuming.
3. **Check prerequisites** — before building anything, confirm the user has the necessary accounts, API keys, and environment set up. Walk them through setup if they don't.
4. **Build incrementally** — deploy each phase as a working product before moving to the next.
5. **Recommend and guide** — suggest better approaches when you see them. Push back on bad patterns. You're a senior engineer, not a code monkey.

### Decision Checkpoints

At each `🛑 CHECKPOINT` in this document, stop and ask the user the listed questions before proceeding. Do not assume answers.

---

## 1. PRODUCT OVERVIEW

### 1.1 What We're Building

A multi-tenant SaaS platform with two sellable products:

**Product A: AI Web Chatbot ("24/7 AI Employee")**
An embeddable chat widget that local businesses add to their website. The chatbot answers customer questions, provides business information, and books appointments — 24/7, automatically. Powered by Claude Haiku 4.5.

**Product B: Email Review Request Engine ("Google Reviews Booster")**
An automated email campaign system that sends branded review requests to a business's customers, routes them through a satisfaction gate (5 stars → Google review page, 1-4 stars → private feedback), and follows up with non-responders automatically.

Both products share a single codebase, deployment, database, and admin dashboard. They are sold separately or bundled to local business clients under the SceneWithin brand.

### 1.2 Business Model

| Offer | Client Pays | Your Cost | Margin |
|-------|-------------|-----------|--------|
| AI Chatbot (standalone) | $150/month | ~$5-15/month (Claude API + hosting) | ~90% |
| Email Reviews (standalone) | $297/month | ~$5-20/month (Resend + hosting) | ~93% |
| Bundle (Chatbot + Reviews) | $397/month | ~$10-30/month | ~93% |

### 1.3 Target Users

- **Agency Admin (Josue / SceneWithin team):** Manages all clients, configures chatbots, launches review campaigns, views analytics across the portfolio.
- **Client (local business owner):** Views their own dashboard — chatbot conversations, review campaign results, appointment bookings. Limited access.
- **End Customer (the client's customer):** Interacts with the chatbot on the client's website or receives review request emails. Never sees the admin layer.

---

## 2. TECH STACK

### 2.1 Confirmed Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend (Admin + Dashboard) | React + TypeScript + Vite + Tailwind CSS | Josue's primary stack, fast build times |
| Chat Widget (Embeddable) | React + TypeScript, compiled to standalone JS bundle | Must work on ANY website via `<script>` tag |
| Backend / API | Node.js (Express or Hono) OR Next.js API routes | Lightweight, TypeScript-native |
| Database | Supabase (Postgres + Auth + Realtime) | Josue has Supabase experience, includes auth and realtime subscriptions |
| AI Model | Claude Haiku 4.5 via Anthropic API | $1/$5 per M tokens, fast, tool-calling support |
| Email | Resend API | Free tier 3,000 emails/month, React Email templates, developer-friendly |
| Appointment Booking | Cal.com API (self-hosted or cloud) | Open source, free, API-first |
| Hosting / Deployment | Vercel (frontend + API) + Supabase (DB) | Free tier covers initial clients |
| CDN (Widget) | Vercel or Cloudflare | Widget JS bundle must load fast globally |

### 2.2 Why NOT These Alternatives

| Rejected | Why |
|----------|-----|
| Next.js App Router | Adds complexity for this use case; Vite + Express is lighter and Josue knows it |
| Firebase | Supabase is already in Josue's stack (S&J Asset Recovery uses it) |
| OpenAI GPT | Claude Haiku 4.5 is cheaper and Josue has Anthropic API access |
| Twilio (for now) | SMS comes in Phase 3; email-only first to reduce scope and A2P compliance burden |
| GoHighLevel | The entire point of this project is to NOT depend on GHL |

---

## 3. ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                       │
│              (React + Vite + Tailwind)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Clients  │  │ Chatbot  │  │ Reviews  │  │Analytics│ │
│  │ Manager  │  │ Config   │  │Campaigns │  │  Board  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ API calls
                       ▼
┌─────────────────────────────────────────────────────────┐
│                     API SERVER                           │
│              (Express / Hono + TypeScript)                │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ /chat    │  │ /reviews │  │ /clients │  │ /auth   │ │
│  │ endpoint │  │ campaign │  │   CRUD   │  │ Supabase│ │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └─────────┘ │
│       │              │                                    │
│       ▼              ▼                                    │
│  ┌──────────┐  ┌──────────┐                              │
│  │ Claude   │  │  Resend  │                              │
│  │Haiku 4.5 │  │  Email   │                              │
│  │  + Tool  │  │   API    │                              │
│  │ Calling  │  │          │                              │
│  └──────────┘  └──────────┘                              │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE                               │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ clients  │  │ chat_    │  │ review_  │  │ chat_   │ │
│  │          │  │ configs  │  │ campaigns│  │ logs    │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────┐     ┌──────────────────────────────┐
│   EMBEDDABLE WIDGET │     │   CLIENT'S CUSTOMER          │
│   (standalone JS)   │     │                              │
│                     │     │  Receives review email       │
│  Loads on client's  │◄────│  Clicks star rating          │
│  website via        │     │  → 5 stars: Google review    │
│  <script> tag       │     │  → 1-4: private feedback     │
│                     │     │                              │
│  Chat bubble UI     │     │  Chats with AI on website    │
│  → calls /chat API  │     │  → gets answers + books appt │
└─────────────────────┘     └──────────────────────────────┘
```

---

## 4. PRODUCT A: AI WEB CHATBOT

### 4.1 User Stories

**As a local business owner (client), I want:**
- An AI chat widget on my website that answers common customer questions accurately
- The chatbot to know my business hours, services, pricing, and policies
- Customers to be able to book appointments directly in the chat
- To see transcripts of every conversation
- To know how many chats happened and how many appointments were booked

**As the agency admin (Josue), I want:**
- To configure a new client's chatbot in under 30 minutes
- To write and edit the system prompt / knowledge base per client
- To view all conversations across all clients from one dashboard
- To embed the widget on any client website with a single script tag
- The widget to match the client's brand colors

**As a website visitor (end customer), I want:**
- To ask a question and get an instant, accurate answer
- To book an appointment without leaving the chat
- The chat to feel natural, not robotic
- To be able to close the chat and come back later

### 4.2 Widget Specifications

**Embed Method:**
```html
<!-- Client pastes this in their site's HTML -->
<script
  src="https://widget.scenewithin.com/chat.js"
  data-client-id="client_abc123"
  data-theme="light"
  data-accent="#2563EB"
  async
></script>
```

**Widget UI Requirements:**
- Floating chat bubble (bottom-right corner, customizable position)
- Expands to a chat panel (mobile: full screen; desktop: 400px wide, 600px tall)
- Animated open/close transition
- Client's business name and logo in the chat header
- Message bubbles with typing indicator (streaming response)
- Powered by SceneWithin badge (small, bottom of widget — acts as lead gen for the agency)
- Accent color configurable per client via `data-accent` attribute
- Light and dark theme support
- Responsive — works on mobile, tablet, desktop
- Loads asynchronously — zero impact on client's page speed
- Total bundle size target: under 80KB gzipped

**Chat Behavior:**
- Greeting message appears automatically when widget opens (configurable per client)
- Claude Haiku 4.5 powers all responses
- System prompt is loaded per client from Supabase
- Conversation history is maintained for the session (cleared on page refresh unless persistence is enabled)
- Tool calling enabled for: `book_appointment`, `get_business_hours`, `transfer_to_human` (sends notification)
- If the visitor asks something outside the bot's knowledge, it responds honestly: "I don't have that information, but you can reach us at [phone/email]."
- Rate limiting: max 50 messages per session, max 200 sessions per client per day (adjustable)

### 4.3 Tool Calling Definitions

```typescript
// Tools available to Claude during chat
const tools = [
  {
    name: "book_appointment",
    description: "Book an appointment for the customer. Use when the customer wants to schedule a visit, consultation, or service.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        customer_email: { type: "string", description: "Customer's email" },
        customer_phone: { type: "string", description: "Customer's phone (optional)" },
        preferred_date: { type: "string", description: "Preferred date (ISO format)" },
        preferred_time: { type: "string", description: "Preferred time" },
        service_type: { type: "string", description: "Type of service requested" },
        notes: { type: "string", description: "Any additional notes" }
      },
      required: ["customer_name", "customer_email", "service_type"]
    }
  },
  {
    name: "get_available_slots",
    description: "Check available appointment slots for a given date range.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string" },
        end_date: { type: "string" },
        service_type: { type: "string" }
      },
      required: ["start_date"]
    }
  },
  {
    name: "transfer_to_human",
    description: "Transfer the conversation to a human. Use when the customer explicitly asks to speak to a person, or when the question is too complex or sensitive for AI.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why the transfer is needed" },
        customer_email: { type: "string" },
        customer_phone: { type: "string" }
      },
      required: ["reason"]
    }
  }
];
```

### 4.4 System Prompt Template (Per Client)

```
You are a friendly, knowledgeable assistant for {{business_name}}, a {{business_type}} located in {{city}}, {{state}}.

BUSINESS INFORMATION:
{{business_info}}

SERVICES OFFERED:
{{services_list}}

HOURS OF OPERATION:
{{hours}}

PRICING:
{{pricing_info}}

POLICIES:
{{policies}}

FAQs:
{{faqs}}

INSTRUCTIONS:
- Be warm, professional, and concise. Match the tone of a knowledgeable front-desk employee.
- Answer questions using ONLY the information provided above. Do not make up information.
- If you don't know something, say: "I don't have that specific information, but you can reach us at {{phone}} or {{email}} and our team can help!"
- When a customer wants to book an appointment, use the book_appointment tool. Collect their name, email, preferred date/time, and service type.
- Before booking, use get_available_slots to check availability.
- If a customer is upset, frustrated, or asks to speak to a person, use transfer_to_human immediately. Do not argue or try to resolve complaints yourself.
- Keep responses under 3 sentences when possible. Be helpful, not verbose.
- Never mention that you are an AI unless directly asked. If asked, say: "I'm an AI assistant for {{business_name}}. I can help with questions and booking, and I can also connect you with our team directly."
- NEVER discuss competitors, give medical/legal advice, or make promises about outcomes.
```

---

## 5. PRODUCT B: EMAIL REVIEW REQUEST ENGINE

### 5.1 User Stories

**As the agency admin (Josue), I want:**
- To upload a CSV of customers (name, email) for a client and fire a review campaign
- To see real-time stats: emails sent, opened, clicked, reviews generated
- To configure the satisfaction gate threshold per client (default: 4+ stars → Google)
- To customize email templates per client (logo, colors, copy)
- To set up automatic follow-up sequences (reminder at 48h, final at 5 days)

**As a local business owner (client), I want:**
- To see how many reviews I got this month from the campaign
- To read private feedback from unhappy customers before it goes public
- To provide my customer list easily (CSV upload or manual entry)

**As a customer receiving the email, I want:**
- A short, clear email that doesn't feel spammy
- To be able to rate in one click (no new accounts, no login)
- If I click 5 stars, to go directly to Google Reviews (pre-opened, ready to type)
- If I click 1-4 stars, to share my feedback privately without it being public

### 5.2 Email Flow

```
Customer completes service
         │
         ▼
Admin uploads customer to campaign (CSV or single entry)
         │
         ▼
┌─────────────────────────────────────┐
│  EMAIL 1 (sent immediately)         │
│  "How was your experience at        │
│   [Business Name]?"                 │
│                                     │
│  ⭐ ⭐ ⭐ ⭐ ⭐                      │
│  (each star is a clickable link)    │
└──────────────┬──────────────────────┘
               │
               ▼ customer clicks a star
┌──────────────┴──────────────────────┐
│                                     │
│  Rating 4-5          Rating 1-3     │
│  ┌─────────┐        ┌──────────┐   │
│  │Redirect │        │Redirect  │   │
│  │to Google│        │to private│   │
│  │Reviews  │        │feedback  │   │
│  │page     │        │form      │   │
│  └─────────┘        └──────────┘   │
│                           │         │
│                           ▼         │
│                    Feedback sent    │
│                    to client via    │
│                    email/dashboard  │
└─────────────────────────────────────┘
               │
               ▼ (if no click after 48h)
┌─────────────────────────────────────┐
│  EMAIL 2 (reminder)                  │
│  "Quick reminder — we'd love your   │
│   feedback!"                         │
│  [Same star links]                   │
└──────────────┬──────────────────────┘
               │
               ▼ (if still no click after 5 days)
┌─────────────────────────────────────┐
│  EMAIL 3 (final)                     │
│  "Last chance to share your          │
│   experience"                        │
│  [Same star links]                   │
└─────────────────────────────────────┘
               │
               ▼
         SEQUENCE ENDS
```

### 5.3 Rating Endpoint

```
GET /api/rate?token={unique_token}&stars={1-5}

- Token is a unique, one-time-use identifier per customer per campaign
- Decodes to: { customer_id, campaign_id, client_id }
- Logs the rating, timestamp, and IP
- If stars >= threshold (default 4):
    → HTTP 302 redirect to client's Google review URL
- If stars < threshold:
    → HTTP 302 redirect to /feedback/{token} (private feedback form page)
- If token already used:
    → Redirect to a "thanks, you already submitted" page
```

### 5.4 Email Templates

Three email templates per client, all built with React Email + Resend:

1. **Initial Request** — branded, warm, personal, contains 5 clickable star images
2. **Reminder (48h)** — shorter, lighter, same star links
3. **Final Ask (5 days)** — last touch, emphasizes community impact

All templates include:
- Client's logo and brand colors
- Customer's first name (personalized)
- Business name
- Unsubscribe link (CAN-SPAM compliance)
- SceneWithin attribution footer (small, subtle — lead gen)

### 5.5 Follow-Up Scheduler

A cron job (or Vercel Cron / Supabase pg_cron) that runs every hour:

```
1. Query all review_requests WHERE:
   - status = 'sent' AND sent_at < NOW() - 48 hours AND reminder_1_sent = false
   → Send reminder email, update reminder_1_sent = true

2. Query all review_requests WHERE:
   - status = 'sent' AND sent_at < NOW() - 5 days AND reminder_2_sent = false
   → Send final email, update reminder_2_sent = true

3. Query all review_requests WHERE:
   - status = 'clicked' (any star link was clicked)
   → Mark as 'completed', stop all follow-ups
```

---

## 6. DATABASE SCHEMA (SUPABASE)

```sql
-- Multi-tenant clients table
CREATE TABLE clients (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chatbot configuration per client
CREATE TABLE chat_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL,
  greeting_message TEXT DEFAULT 'Hi! How can I help you today?',
  business_info JSONB, -- structured business data for the prompt
  tools_enabled TEXT[] DEFAULT ARRAY['book_appointment', 'get_available_slots', 'transfer_to_human'],
  max_messages_per_session INT DEFAULT 50,
  max_sessions_per_day INT DEFAULT 200,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- Chat conversation logs
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  visitor_id TEXT, -- anonymous session identifier
  messages JSONB NOT NULL DEFAULT '[]',
  tool_calls JSONB DEFAULT '[]',
  appointment_booked BOOLEAN DEFAULT false,
  transferred_to_human BOOLEAN DEFAULT false,
  message_count INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'  -- browser, page URL, referrer, etc.
);

-- Review campaigns
CREATE TABLE review_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, active, paused, completed
  satisfaction_threshold INT DEFAULT 4, -- stars >= this → Google
  email_subject_1 TEXT DEFAULT 'How was your experience at {{business_name}}?',
  email_subject_2 TEXT DEFAULT 'Quick reminder — we''d love your feedback!',
  email_subject_3 TEXT DEFAULT 'Last chance to share your experience',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual review requests (one per customer per campaign)
CREATE TABLE review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES review_campaigns(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL, -- unique token for rating URL
  status TEXT DEFAULT 'pending', -- pending, sent, clicked, completed, bounced
  stars_given INT, -- null until they click
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  reminder_1_sent BOOLEAN DEFAULT false,
  reminder_1_at TIMESTAMPTZ,
  reminder_2_sent BOOLEAN DEFAULT false,
  reminder_2_at TIMESTAMPTZ,
  feedback_text TEXT, -- private feedback from 1-3 star ratings
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments booked via chatbot
CREATE TABLE appointments (
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
  status TEXT DEFAULT 'pending', -- pending, confirmed, cancelled
  external_booking_id TEXT, -- Cal.com booking ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agency admin users (Supabase Auth handles auth, this stores role/permissions)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT DEFAULT 'admin', -- admin, client_viewer
  client_id UUID REFERENCES clients(id), -- null for agency admin, set for client users
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. BUILD PHASES

### 🛑 CHECKPOINT 0: Prerequisites

**Before writing ANY code, Claude Code must verify the user has:**

- [ ] Node.js 18+ installed
- [ ] A Supabase project created (get URL + anon key + service role key)
- [ ] An Anthropic API key (for Claude Haiku 4.5)
- [ ] A Resend account + API key (free tier is fine)
- [ ] A Vercel account (for deployment)
- [ ] A Cal.com account OR alternative booking tool decided
- [ ] A test business with a Google review link (can use SceneWithin or a friend's business)
- [ ] Git repo initialized

**Ask the user:**
1. "Do you have all of these accounts set up? Which ones are missing?"
2. "What's the Google review URL for your test business?"
3. "Do you want to use Cal.com for appointment booking, or a different tool?"
4. "What domain will this live on? (e.g., app.scenewithin.com, widget.scenewithin.com)"
5. "Do you want the admin dashboard and API in the same repo (monorepo) or separate?"

---

### Phase 1: Chat Widget + Claude Backend (Week 1)

**Goal:** A working chat widget that can be embedded on any website and holds a conversation powered by Claude Haiku 4.5.

**Build order:**
1. Initialize project (monorepo with `/packages/widget`, `/packages/api`, `/packages/dashboard`)
2. Build the API server with a `/chat` endpoint that accepts messages and returns Claude responses
3. Build the chat widget as a standalone React component, compiled to a single JS bundle
4. Test: embed on a test HTML page, have a conversation
5. Add Supabase: store chat sessions and messages
6. Add multi-tenancy: load client config (system prompt, greeting) from Supabase based on `data-client-id`

### 🛑 CHECKPOINT 1: After Phase 1

**Ask the user:**
1. "The basic chat is working. Test it and tell me: does the conversation feel natural? Should we adjust the system prompt template?"
2. "What's the first real client you want to deploy this to? Give me their business name, services, hours, and any FAQs."
3. "Should we add tool calling for appointment booking now (Phase 2) or move to the review email system first?"

---

### Phase 2: Appointment Booking via Tool Calling (Week 2)

**Goal:** The chatbot can check availability and book appointments via Cal.com.

**Build order:**
1. Set up Cal.com integration (API key, event types)
2. Implement `get_available_slots` tool handler — calls Cal.com API
3. Implement `book_appointment` tool handler — creates booking via Cal.com API
4. Implement `transfer_to_human` tool handler — sends notification email via Resend
5. Test full flow: visitor asks to book → bot checks slots → confirms booking
6. Store booking in Supabase `appointments` table

### 🛑 CHECKPOINT 2: After Phase 2

**Ask the user:**
1. "Book a test appointment through the chatbot. Did it work end-to-end?"
2. "Does the client need specific appointment types configured? (e.g., 'Initial Consultation - 30 min', 'Follow-Up - 15 min')"
3. "Ready to build the review email system, or do you want to deploy the chatbot to a real client first?"

---

### Phase 3: Email Review Request Engine (Week 3)

**Goal:** A working email campaign system that sends review requests, routes through the satisfaction gate, and follows up automatically.

**Build order:**
1. Build React Email templates (initial request, reminder, final)
2. Build `/api/campaigns` CRUD endpoints
3. Build CSV upload endpoint (parse, validate, create review_requests)
4. Build `/api/rate` endpoint (token validation, star routing, logging)
5. Build the satisfaction gate page (star rating UI, 1 click = redirect)
6. Build the private feedback form page (for 1-3 star ratings)
7. Build the follow-up cron job (48h reminder, 5-day final)
8. Test full flow: upload CSV → emails sent → click star → redirected to Google

### 🛑 CHECKPOINT 3: After Phase 3

**Ask the user:**
1. "Send yourself a test review request email. Rate the experience — does the flow feel smooth?"
2. "Is the email template branded correctly? Any copy changes?"
3. "Ready to build the admin dashboard, or should we deploy and start selling with what we have?"

---

### Phase 4: Admin Dashboard (Week 4)

**Goal:** A web dashboard where Josue manages all clients, chatbot configs, and review campaigns.

**Build order:**
1. Set up Supabase Auth (email/password for admin)
2. Build dashboard shell (sidebar nav, routing)
3. Clients page: list all clients, add/edit client
4. Chatbot config page: edit system prompt, business info, greeting, accent color per client
5. Review campaigns page: create campaign, upload CSV, view stats
6. Conversations page: view chat transcripts per client
7. Analytics overview: total chats, appointments booked, reviews generated, emails sent

### 🛑 CHECKPOINT 4: After Phase 4

**Ask the user:**
1. "Walk through the dashboard. Is the UX clear? What's confusing?"
2. "Do you want client-facing login (so business owners can see their own stats) now or later?"
3. "Ready to deploy to production and onboard your first paying client?"

---

### Phase 5: Polish, Deploy, Sell (Week 5)

**Goal:** Production deployment, first client onboarded.

**Build order:**
1. Configure custom domains (app.scenewithin.com, widget.scenewithin.com)
2. Set up environment variables for production
3. Deploy API + Dashboard to Vercel
4. Deploy widget JS bundle to CDN
5. Onboard first test client: configure chatbot, embed widget, launch first review campaign
6. Monitor: check error logs, conversation quality, email deliverability
7. Write a simple onboarding checklist for future clients

---

## 8. FUTURE PHASES (Not In Scope Now)

These are documented for context but should NOT be built yet:

- **Phase 6:** SMS review requests via Twilio (adds SMS channel to the email flow)
- **Phase 7:** Missed call text-back via Twilio or Quo integration
- **Phase 8:** Client-facing portal (business owner login to view their own stats)
- **Phase 9:** AI review response generator (monitor GBP for new reviews, draft SEO responses)
- **Phase 10:** White-label branding (remove SceneWithin, allow agency resale)
- **Phase 11:** Stripe billing integration (auto-charge clients monthly)

---

## 9. DESIGN DIRECTION

### Admin Dashboard
- **Aesthetic:** Clean, utilitarian, data-dense. Think Linear or Vercel's dashboard — not flashy, just clear.
- **Typography:** Geist Sans (or similar geometric sans-serif). Monospace for data/metrics.
- **Colors:** Dark sidebar, light content area. Accent color from SceneWithin brand palette.
- **Layout:** Sidebar navigation, main content area, no unnecessary animations.

### Chat Widget
- **Aesthetic:** Soft, approachable, modern. Should feel native to any website it's embedded on.
- **Typography:** System font stack (inherits from host site where possible).
- **Colors:** Configurable accent color per client. Light and dark theme.
- **Animations:** Subtle — bubble appears with a gentle scale-up, messages fade in, typing indicator pulses. Nothing distracting.
- **Mobile:** Full-screen takeover on mobile (like iMessage or WhatsApp). Partial panel on desktop.

### Email Templates
- **Aesthetic:** Simple, personal, not "marketing email." Should feel like a message from a person, not a corporation.
- **Star rating:** Large, tappable, obvious. The entire email exists to get one click.
- **Branding:** Client logo at top, SceneWithin attribution at bottom (tiny).
- **Mobile-first:** Most emails opened on mobile. Stars must be easily tappable with a thumb.

---

## 10. SUCCESS METRICS

### For the Agency (SceneWithin)
- Time to onboard a new client: < 30 minutes
- Monthly recurring revenue per client: $150-$397
- Client churn rate: < 10% monthly
- Number of active clients: target 10 within 3 months

### For Each Client
- Chatbot: > 80% of questions answered without human transfer
- Chatbot: > 5 appointments booked per month via chat
- Reviews: > 12% email-to-click rate on review requests
- Reviews: > 10 new Google reviews per month (from a 100-customer campaign)

---

## 11. NON-GOALS (Explicitly Out of Scope)

- Multi-language support (English only for now)
- Voice AI / phone answering (future phase)
- CRM functionality beyond what's needed for reviews and chat
- Reselling the platform to other agencies (SceneWithin only for now)
- Integration with existing CRMs (Jobber, ServiceTitan, etc.) — CSV is fine
- Real-time chat with human handoff (transfer_to_human sends a notification; it's not a live handoff)
- Payment processing within the chatbot

---

*End of PRD. Claude Code: read this fully, then start at Checkpoint 0.*
