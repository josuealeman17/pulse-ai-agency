import type { Anthropic } from "@anthropic-ai/sdk";
import type { ToolName } from "@pulse/db";

/**
 * Tool definitions available to Claude during chat (PRD §4.3).
 * Handlers are wired in Phase 2 (Cal.com booking + transfer notifications).
 * In Phase 1 the tools are defined so Claude knows its capabilities, but the
 * chat loop completes turns without executing them.
 */
export const ALL_TOOLS: Record<ToolName, Anthropic.Tool> = {
  book_appointment: {
    name: "book_appointment",
    description:
      "Book an appointment for the customer. You MUST call get_available_slots first and book one of the exact `start` values it returns — never invent a time. Pass that exact ISO datetime as `start`.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        customer_email: { type: "string", description: "Customer's email" },
        customer_phone: {
          type: "string",
          description: "Customer's phone number. Always ask the customer for this — never invent it.",
        },
        start: {
          type: "string",
          description:
            "The exact ISO 8601 datetime of the chosen slot, copied verbatim from a `start` value returned by get_available_slots (e.g. '2026-06-05T09:00:00.000-06:00').",
        },
        service_type: { type: "string", description: "Type of service requested" },
        notes: { type: "string", description: "Any additional notes" },
      },
      required: ["customer_name", "customer_email", "customer_phone", "start", "service_type"],
    },
  },
  get_available_slots: {
    name: "get_available_slots",
    description:
      "Check real available appointment slots for a date range. Returns a list of exact `start` datetimes that are bookable. Always call this before book_appointment, and only offer the customer times that appear here.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start of range, YYYY-MM-DD" },
        end_date: { type: "string", description: "End of range, YYYY-MM-DD (optional)" },
        service_type: { type: "string" },
      },
      required: ["start_date"],
    },
  },
  transfer_to_human: {
    name: "transfer_to_human",
    description:
      "Transfer the conversation to a human. Use when the customer explicitly asks to speak to a person, or when the question is too complex or sensitive for AI.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why the transfer is needed" },
        customer_email: { type: "string" },
        customer_phone: { type: "string" },
      },
      required: ["reason"],
    },
  },
};

/** Resolve the subset of tools enabled for a given client config. */
export function resolveTools(enabled: ToolName[]): Anthropic.Tool[] {
  return enabled.map((name) => ALL_TOOLS[name]).filter(Boolean);
}
