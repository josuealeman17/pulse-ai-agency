import type { ToolName } from "@pulse/db";
import type { ResolvedClientConfig } from "./clientConfig.js";
import { createBooking, getSlots } from "./calcom.js";
import { insertAppointment } from "./appointments.js";
import { sendTransferNotification } from "./notify.js";

export interface ToolContext {
  config: ResolvedClientConfig;
  sessionId: string | null;
}

export interface ToolOutcome {
  /** Text result fed back to Claude as the tool_result content. */
  result: string;
  /** Side-effect flags surfaced to the chat route for session bookkeeping. */
  appointmentBooked?: boolean;
  transferredToHuman?: boolean;
}

type Handler = (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * Best-effort conversion of a preferred date (+ optional time) into an ISO start.
 * Returns undefined when we can't form a confident datetime — callers then fall
 * back to capturing the request as 'pending' for a human to confirm.
 */
function toIsoStart(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  if (date.includes("T")) {
    const d = new Date(date);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (!time) return undefined;
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(time);
  if (!m) return undefined;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  const d = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Tool handlers. Cal.com + Resend integrations with graceful fallback:
 * when an integration isn't configured (or a call fails), the bot still
 * captures the request and gives the customer a coherent answer.
 */
export const toolHandlers: Record<ToolName, Handler> = {
  async get_available_slots(input, ctx) {
    const today = new Date().toISOString().slice(0, 10);
    const requested = str(input.start_date) ?? today;
    // Never query the past — clamp a stale/guessed date up to today.
    const startDate = requested < today ? today : requested;
    const endDate = str(input.end_date);

    const calcom = ctx.config.booking.calcom;
    if (calcom) {
      const res = await getSlots(calcom, startDate, endDate);
      if (res.ok && res.slots.length > 0) {
        // Label every slot with its weekday/date/time (computed in the client's
        // timezone) so the model never has to derive a weekday from an ISO string.
        const dayFmt = new Intl.DateTimeFormat("en-US", {
          timeZone: calcom.timezone,
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const timeFmt = new Intl.DateTimeFormat("en-US", {
          timeZone: calcom.timezone,
          hour: "numeric",
          minute: "2-digit",
        });
        const days = Object.values(res.slotsByDate).map((isoList) => ({
          day: dayFmt.format(new Date(isoList[0])),
          times: isoList.map((iso) => ({ label: timeFmt.format(new Date(iso)), start: iso })),
        }));

        return {
          result: JSON.stringify({
            available: true,
            source: "cal.com",
            note: "Real bookable slots, grouped by day with correct weekday labels. Offer times across the day. Use the `day` and `label` text exactly as given (do not recompute the weekday), and pass the matching `start` value to book_appointment.",
            days,
          }),
        };
      }
      if (res.ok) {
        return {
          result: JSON.stringify({
            available: false,
            note: "No open slots in that range. Ask the customer for a different date.",
          }),
        };
      }
      // fall through to fallback on error
    }

    return {
      result: JSON.stringify({
        available: true,
        source: "fallback",
        note: "Live calendar unavailable; offer to capture a preferred time and have the team confirm.",
        slots: [
          { date: startDate, time: "9:00 AM" },
          { date: startDate, time: "1:30 PM" },
          { date: startDate, time: "4:00 PM" },
        ],
      }),
    };
  },

  async book_appointment(input, ctx) {
    const name = str(input.customer_name) ?? "Customer";
    const email = str(input.customer_email) ?? "";
    const phone = str(input.customer_phone);
    const serviceType = str(input.service_type);
    const notes = str(input.notes);
    const clientId = ctx.config.client.id;

    // Prefer the exact slot start (from get_available_slots); tolerate legacy date/time.
    const isoStart =
      str(input.start) ?? toIsoStart(str(input.preferred_date), str(input.preferred_time));

    if (!email) {
      return {
        result: JSON.stringify({
          booked: false,
          error: "missing_email",
          note: "Ask the customer for their email before booking.",
        }),
      };
    }

    // ── Cal.com is LIVE for this client: a booking must succeed, or we tell the truth. ──
    const calcom = ctx.config.booking.calcom;
    if (calcom) {
      if (!isoStart) {
        return {
          result: JSON.stringify({
            booked: false,
            error: "no_slot_selected",
            note: "Call get_available_slots first, then book one of the exact `start` values it returns.",
          }),
        };
      }

      const booking = await createBooking(calcom, {
        start: isoStart,
        name,
        email,
        phone,
        // Include phone in notes too, so it's visible in the booking even if the
        // event type's phone field is hidden.
        notes:
          [serviceType, phone ? `Phone: ${phone}` : "", notes].filter(Boolean).join(" — ") ||
          undefined,
      });

      if (booking.ok) {
        await insertAppointment({
          clientId,
          chatSessionId: ctx.sessionId,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          serviceType,
          preferredDate: isoStart.slice(0, 10),
          preferredTime: isoStart,
          notes,
          externalBookingId: booking.bookingId,
          status: "confirmed",
        });
        return {
          result: JSON.stringify({
            booked: true,
            confirmed: true,
            start: booking.start ?? isoStart,
            note: "Appointment confirmed on the calendar. Tell the customer they'll receive a confirmation email.",
          }),
          appointmentBooked: true,
        };
      }

      // Booking FAILED — do not claim success. Tell Claude to recover.
      console.error(`[book_appointment] Cal.com booking failed: ${booking.error}`);
      return {
        result: JSON.stringify({
          booked: false,
          error: booking.error,
          note: "That time could not be booked (it may no longer be available). Call get_available_slots again and offer the customer a different open time. Do NOT tell the customer it is booked.",
        }),
      };
    }

    // ── 'capture' mode (no live calendar for this client): record + notify. ──
    await insertAppointment({
      clientId,
      chatSessionId: ctx.sessionId,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      serviceType,
      preferredDate: str(input.preferred_date),
      preferredTime: str(input.preferred_time) ?? isoStart,
      notes,
      status: "pending",
    });
    return {
      result: JSON.stringify({
        booked: true,
        confirmed: false,
        note: "Request captured (no live calendar connected). Tell the customer the team will confirm the exact time by email shortly.",
        details: { name, service_type: serviceType },
      }),
      appointmentBooked: true,
    };
  },

  async transfer_to_human(input, ctx) {
    const reason = str(input.reason) ?? "Customer requested a person";
    const sent = await sendTransferNotification(ctx.config.client, {
      reason,
      customer_email: str(input.customer_email),
      customer_phone: str(input.customer_phone),
    });
    return {
      result: JSON.stringify({
        transferred: true,
        notified: sent,
        note: `The team at ${ctx.config.client.name} has been notified and will follow up${
          sent ? " by email" : ""
        }. Reassure the customer.`,
      }),
      transferredToHuman: true,
    };
  },
};
