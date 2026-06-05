import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env, supabaseEnabled } from "./env.js";
import { chatRoute } from "./routes/chat.js";
import { reviewsRoute } from "./routes/reviews.js";
import { campaignsRoute } from "./routes/campaigns.js";
import { cronRoute } from "./routes/cron.js";

// The Hono app, framework-agnostic. The local dev server (index.ts) wraps it with
// @hono/node-server; on Vercel this default export is detected and served natively
// (zero-config Hono support), which routes every path to the app.
export const app = new Hono();

app.use("*", logger());

const allowed = env.allowedOrigins.split(",").map((o) => o.trim());
app.use(
  "*",
  cors({
    origin: allowed.includes("*") ? "*" : allowed,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/", (c) =>
  c.json({
    service: "pulse-api",
    status: "ok",
    supabase: supabaseEnabled ? "connected" : "fallback (in-memory demo config)",
    model: env.anthropicModel,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/chat", chatRoute);
app.route("/api/campaigns", campaignsRoute);
app.route("/api/cron", cronRoute);
// Public review flow (defines full paths: /api/rate, /feedback/:token, /api/unsubscribe).
app.route("/", reviewsRoute);

export default app;
