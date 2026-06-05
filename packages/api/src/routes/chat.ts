import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ChatMessage, ChatRequest } from "@pulse/db";
import { resolveClientConfig } from "../lib/clientConfig.js";
import { runChat } from "../lib/claude.js";
import { persistSession } from "../lib/sessions.js";

export const chatRoute = new Hono();

/** GET /chat/config?clientId=... — greeting + branding the widget needs on open. */
chatRoute.get("/config", async (c) => {
  const clientId = c.req.query("clientId");
  if (!clientId) return c.json({ error: "clientId is required" }, 400);

  const config = await resolveClientConfig(clientId);
  if (!config) return c.json({ error: "Unknown or inactive client" }, 404);

  return c.json({
    clientId: config.client.id,
    businessName: config.client.name,
    greeting: config.greeting,
    accentColor: config.client.accent_color,
    logoUrl: config.client.logo_url,
  });
});

/** POST /chat — streams the assistant reply as Server-Sent Events. */
chatRoute.post("/", async (c) => {
  let body: ChatRequest;
  try {
    body = await c.req.json<ChatRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { clientId, sessionId = null, visitorId = null, messages, metadata } = body;

  if (!clientId) return c.json({ error: "clientId is required" }, 400);
  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: "messages must be a non-empty array" }, 400);
  }
  if (messages[messages.length - 1]?.role !== "user") {
    return c.json({ error: "last message must be from the user" }, 400);
  }

  const config = await resolveClientConfig(clientId);
  if (!config) return c.json({ error: "Unknown or inactive client" }, 404);

  if (messages.length > config.maxMessagesPerSession) {
    return c.json({ error: "Session message limit reached" }, 429);
  }

  return streamSSE(c, async (stream) => {
    const assistantParts: string[] = [];
    let appointmentBooked = false;
    let transferredToHuman = false;

    try {
      for await (const event of runChat({
        systemPrompt: config.systemPrompt,
        toolsEnabled: config.toolsEnabled,
        history: messages,
        ctx: { config, sessionId },
      })) {
        switch (event.type) {
          case "text":
            assistantParts.push(event.value);
            await stream.writeSSE({ event: "token", data: event.value });
            break;
          case "tool":
            await stream.writeSSE({ event: "tool", data: event.name });
            break;
          case "done":
            appointmentBooked = event.appointmentBooked;
            transferredToHuman = event.transferredToHuman;
            break;
          case "error":
            await stream.writeSSE({ event: "error", data: event.message });
            break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[chat] stream failed:", message);
      await stream.writeSSE({ event: "error", data: "Something went wrong. Please try again." });
      return;
    }

    // Persist the full turn (user history + assistant reply). No-op without Supabase.
    const fullHistory: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: assistantParts.join("") },
    ];
    const savedSessionId = await persistSession({
      sessionId,
      clientId,
      visitorId,
      messages: fullHistory,
      appointmentBooked,
      transferredToHuman,
      metadata,
    });

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({
        sessionId: savedSessionId ?? sessionId,
        appointmentBooked,
        transferredToHuman,
      }),
    });
  });
});
