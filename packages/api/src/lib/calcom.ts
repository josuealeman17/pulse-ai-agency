import { env } from "../env.js";

/**
 * Minimal Cal.com API v2 client — slots + booking, configured PER CLIENT (Model B:
 * one event type per client on the Pulse Cal.com account). The base URL and API
 * versions stay global (they're API-level); the key, event type, and timezone come
 * from the client's config so each tenant books into their own event type.
 *
 * Docs: https://cal.com/docs/api-reference/v2  (verify versions against your account)
 */

/** Per-client Cal.com settings resolved from the DB (with global key fallback). */
export interface CalcomConfig {
  apiKey: string;
  eventTypeId: string;
  timezone: string;
}

export interface SlotsResult {
  ok: boolean;
  /** Flat list of available start times (ISO), spread across the day(s). */
  slots: string[];
  /** Available start times grouped by date (YYYY-MM-DD) — full day, mornings + afternoons. */
  slotsByDate: Record<string, string[]>;
  error?: string;
}

export interface BookingResult {
  ok: boolean;
  bookingId?: string;
  bookingUid?: string;
  start?: string;
  error?: string;
}

function headers(apiKey: string, version: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "cal-api-version": version,
    "Content-Type": "application/json",
  };
}

/** Evenly sample `n` items spanning the full array (preserves first & last). */
function pickSpread<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

/** Fetch available start times for a client's event type within a date range. */
export async function getSlots(
  cfg: CalcomConfig,
  startDate: string,
  endDate?: string,
): Promise<SlotsResult> {
  // Cal.com treats start==end as a zero-width range (no slots). Models often pass
  // end_date equal to start_date, so always span at least a week forward.
  const startMs = new Date(`${startDate}T00:00:00`).getTime();
  const endMs = endDate ? new Date(`${endDate}T00:00:00`).getTime() : NaN;
  const end =
    !endDate || isNaN(endMs) || endMs <= startMs
      ? new Date(startMs + 14 * 86400000).toISOString().slice(0, 10)
      : endDate;
  const url = new URL(`${env.calcomBaseUrl}/slots`);
  url.searchParams.set("eventTypeId", cfg.eventTypeId);
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", end);
  url.searchParams.set("timeZone", cfg.timezone);

  try {
    const res = await fetch(url, { headers: headers(cfg.apiKey, env.calcomSlotsVersion) });
    const json = (await res.json()) as {
      data?: Record<string, Array<{ start?: string; time?: string }>> | { slots?: unknown };
    };
    if (!res.ok) {
      return { ok: false, slots: [], slotsByDate: {}, error: `calcom_slots_${res.status}` };
    }

    // v2 returns data as { "YYYY-MM-DD": [{ start }, ...], ... }.
    const data = (json.data ?? {}) as Record<string, Array<{ start?: string; time?: string }>>;

    const MAX_DAYS = 10; // cover ~1.5 weeks so any named weekday ("next Tuesday") is included...
    const MAX_PER_DAY = 5; // ...with a spread of times within each day (not just the morning).

    const slotsByDate: Record<string, string[]> = {};
    const flat: string[] = [];

    for (const date of Object.keys(data).sort().slice(0, MAX_DAYS)) {
      const value = data[date];
      if (!Array.isArray(value)) continue;
      const day = value.map((s) => s.start ?? s.time).filter((t): t is string => Boolean(t));
      if (day.length === 0) continue;

      // Evenly sample across the day so morning AND afternoon options are offered.
      const picked = pickSpread(day, MAX_PER_DAY);
      slotsByDate[date] = picked;
      flat.push(...picked);
    }

    return { ok: true, slots: flat, slotsByDate };
  } catch (err) {
    return { ok: false, slots: [], slotsByDate: {}, error: err instanceof Error ? err.message : "calcom_error" };
  }
}

export interface BookingInput {
  start: string; // ISO datetime
  name: string;
  email: string;
  phone?: string;
  notes?: string;
}

/**
 * Cal.com requires attendee phone numbers in E.164 (e.g. +18015550143).
 * Best-effort normalization; returns undefined if we can't form a valid number
 * (caller then omits it so a bad phone never blocks the booking). Defaults to US (+1).
 */
export function toE164(raw?: string): string | undefined {
  if (!raw) return undefined;
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (hasPlus && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`; // US 10-digit
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return undefined;
}

/** Create a booking on a client's event type. */
export async function createBooking(
  cfg: CalcomConfig,
  input: BookingInput,
): Promise<BookingResult> {
  const phoneE164 = toE164(input.phone);
  const body = {
    start: input.start,
    eventTypeId: Number(cfg.eventTypeId),
    attendee: {
      name: input.name,
      email: input.email,
      timeZone: cfg.timezone,
      ...(phoneE164 ? { phoneNumber: phoneE164 } : {}),
    },
    ...(input.notes ? { bookingFieldsResponses: { notes: input.notes } } : {}),
  };

  try {
    const res = await fetch(`${env.calcomBaseUrl}/bookings`, {
      method: "POST",
      headers: headers(cfg.apiKey, env.calcomBookingsVersion),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      data?: { id?: number | string; uid?: string; start?: string };
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: json.error?.message ?? `calcom_booking_${res.status}` };
    }
    return {
      ok: true,
      bookingId: json.data?.id != null ? String(json.data.id) : undefined,
      bookingUid: json.data?.uid,
      start: json.data?.start,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "calcom_error" };
  }
}
