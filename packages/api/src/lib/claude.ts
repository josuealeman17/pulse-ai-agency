import { Anthropic } from "@anthropic-ai/sdk";
import type { ChatMessage, ToolName } from "@pulse/db";
import { env } from "../env.js";
import { resolveTools } from "../config/tools.js";
import { toolHandlers, type ToolContext } from "./toolHandlers.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const MAX_TOKENS = 1024;
/** Guard against runaway tool loops within a single user turn. */
const MAX_TOOL_ROUNDS = 5;

export type ChatStreamEvent =
  | { type: "text"; value: string }
  | { type: "tool"; name: ToolName }
  | { type: "done"; appointmentBooked: boolean; transferredToHuman: boolean }
  | { type: "error"; message: string };

export interface RunChatArgs {
  systemPrompt: string;
  toolsEnabled: ToolName[];
  history: ChatMessage[];
  ctx: ToolContext;
}

/**
 * Run one assistant turn against Claude Haiku 4.5 with streaming + tool calling.
 * Yields text deltas as they arrive, runs any requested tools, and loops until
 * the model produces a final text answer (or the tool-round cap is hit).
 */
export async function* runChat({
  systemPrompt,
  toolsEnabled,
  history,
  ctx,
}: RunChatArgs): AsyncGenerator<ChatStreamEvent> {
  const tools = resolveTools(toolsEnabled);
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // The model has no inherent sense of "today" — without this it guesses dates
  // near its training cutoff. Anchor it (with weekday) so "soonest", "tomorrow",
  // "Tuesday next week" resolve correctly.
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: env.calcomTimezone }); // YYYY-MM-DD
  const todayLabel = now.toLocaleDateString("en-US", {
    timeZone: env.calcomTimezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const system = `${systemPrompt}

CURRENT DATE: ${todayLabel} (${today}, timezone ${env.calcomTimezone}).

DATE & SCHEDULING RULES — follow exactly:
- NEVER calculate a calendar date or weekday yourself. You are bad at it and will be wrong.
- When the customer names a day ("next Tuesday", "this weekend", "the 10th"), do NOT state a specific date. Instead call get_available_slots with start_date = today (${today}); it returns days each with an authoritative \`day\` label like "Tuesday, June 9, 2026".
- Find the day whose \`day\` label matches what the customer asked for, and offer those times. If their requested weekday isn't in the results, tell them and offer the closest available day.
- When offering or confirming a time, copy the \`day\` and \`label\` text verbatim. Pass the matching \`start\` value to book_appointment. Do not paraphrase or recompute the date.

BOOKING INFO — before calling book_appointment, collect ALL of: full name, email, and phone number. Always ask for the phone number (e.g. "And the best phone number to reach you?") if the customer hasn't given it. Pass it as customer_phone.`;

  let appointmentBooked = false;
  let transferredToHuman = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: env.anthropicModel,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", value: event.delta.text };
      }
    }

    const final = await stream.finalMessage();

    if (final.stop_reason !== "tool_use") {
      yield { type: "done", appointmentBooked, transferredToHuman };
      return;
    }

    // Persist the assistant's tool-use turn, then execute each requested tool.
    messages.push({ role: "assistant", content: final.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      const name = block.name as ToolName;
      yield { type: "tool", name };

      const handler = toolHandlers[name];
      const outcome = handler
        ? await handler(block.input as Record<string, unknown>, ctx)
        : { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };

      if (outcome.appointmentBooked) appointmentBooked = true;
      if (outcome.transferredToHuman) transferredToHuman = true;

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: outcome.result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Hit the tool-round cap without a final answer.
  yield {
    type: "text",
    value:
      "\n\nLet me connect you with our team to finish this up — you can reach us anytime.",
  };
  yield { type: "done", appointmentBooked, transferredToHuman };
}
