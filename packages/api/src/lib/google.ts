import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Google Business Profile (GBP) integration: OAuth handshake + the data calls
 * for reading reviews and posting replies. The handshake works as soon as
 * GOOGLE_CLIENT_ID/SECRET are set; the DATA calls additionally require Google to
 * approve access to the Business Profile APIs (a separate, gated request).
 *
 * Type-only against @pulse/db elsewhere; this module imports no @pulse/db values
 * so it stays safe to bundle as compiled JS on Vercel.
 */

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/business.manage";

// GBP API hosts. Account/location discovery uses the v1 APIs; reviews still live
// on the legacy v4 endpoint (no v1 equivalent for reviews.list / reply yet).
const ACCT_MGMT = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BIZ_INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const LEGACY_V4 = "https://mybusiness.googleapis.com/v4";

/** Server-only secret used to sign the OAuth `state`. Reuses the service-role key
 *  (always present when Supabase is configured); falls back to the cron secret. */
function stateSecret(): string {
  return env.supabaseServiceRoleKey || env.cronSecret || "pulse-dev-state-secret";
}

export interface StatePayload {
  /** client id this connection is for */
  cid: string;
  /** validated dashboard return URL to bounce back to (may be "") */
  rt: string;
  /** expiry (ms epoch) */
  exp: number;
}

/** Sign a state payload as `<base64url(json)>.<base64url(hmac)>`. */
export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify + decode a signed state. Returns null if tampered or expired. */
export function verifyState(state: string): StatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (!payload.cid || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Build the consent URL. access_type=offline + prompt=consent so we always get a
 *  refresh token (Google only returns it on a fresh consent). */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

/** Exchange an authorization code for tokens (returns refresh_token on first consent). */
export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    console.error("[google] token exchange failed:", res.status, await res.text());
    return null;
  }
  return (await res.json()) as TokenResponse;
}

/** Mint a fresh short-lived access token from a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("[google] token refresh failed:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function authedGet<T>(url: string, accessToken: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.error("[google] GET failed:", url, res.status, await res.text());
    return null;
  }
  return (await res.json()) as T;
}

export interface GbpAccount {
  /** e.g. "accounts/123456789" */
  name: string;
  accountName?: string;
}

export interface GbpLocation {
  /** e.g. "locations/987654321" (v1) — prefix with the account for v4 review calls */
  name: string;
  title?: string;
}

export type GbpStarRating = "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";

export interface GbpReview {
  reviewId: string;
  reviewer?: { displayName?: string };
  starRating?: GbpStarRating;
  comment?: string;
  createTime?: string;
  reviewReply?: { comment: string; updateTime: string };
}

/** Map Google's enum star rating to a 1–5 integer. */
export function starToInt(rating: GbpStarRating | undefined): number {
  return { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[rating ?? "FIVE"] ?? 5;
}

/** List the GBP accounts the connected user can manage. */
export async function listAccounts(accessToken: string): Promise<GbpAccount[]> {
  const data = await authedGet<{ accounts?: GbpAccount[] }>(`${ACCT_MGMT}/accounts`, accessToken);
  return data?.accounts ?? [];
}

/** List locations under an account ("accounts/123"). */
export async function listLocations(accessToken: string, accountName: string): Promise<GbpLocation[]> {
  const url = `${BIZ_INFO}/${accountName}/locations?readMask=name,title,storefrontAddress&pageSize=100`;
  const data = await authedGet<{ locations?: GbpLocation[] }>(url, accessToken);
  return data?.locations ?? [];
}

/** List reviews for a location. `locationPath` is the full v4 path,
 *  e.g. "accounts/123/locations/456". */
export async function listReviews(accessToken: string, locationPath: string): Promise<GbpReview[]> {
  const data = await authedGet<{ reviews?: GbpReview[] }>(
    `${LEGACY_V4}/${locationPath}/reviews`,
    accessToken,
  );
  return data?.reviews ?? [];
}

/** Post or update the owner reply to a review. */
export async function replyToReview(
  accessToken: string,
  locationPath: string,
  reviewId: string,
  comment: string,
): Promise<boolean> {
  const res = await fetch(`${LEGACY_V4}/${locationPath}/reviews/${reviewId}/reply`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) console.error("[google] reply failed:", res.status, await res.text());
  return res.ok;
}
