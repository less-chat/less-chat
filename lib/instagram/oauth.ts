import "server-only";
import { env } from "@/lib/env";

/**
 * Instagram Business Login.
 *
 * This is the app's *only* authentication mechanism — there is no separate
 * password. Three-step token dance:
 *   1. authorize  → short-lived code
 *   2. exchange   → short-lived token (1 hour)
 *   3. upgrade    → long-lived token (60 days), refreshed by daily cron
 */

export const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.instagramAppId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

interface ShortLivedToken {
  access_token: string;
  user_id: string;
  permissions?: string;
}

export async function exchangeCode(code: string): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: env.instagramAppId,
    client_secret: env.instagramAppSecret,
    grant_type: "authorization_code",
    redirect_uri: env.redirectUri,
    // Instagram appends "#_" to the code on redirect; it is not part of the code.
    code: code.replace(/#_$/, ""),
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Code exchange failed: ${JSON.stringify(json)}`);
  }
  return { ...json, user_id: String(json.user_id) };
}

interface LongLivedToken {
  access_token: string;
  /** Seconds until expiry, normally 5,184,000 (60 days). */
  expires_in: number;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: env.instagramAppSecret,
    access_token: shortLivedToken,
  });

  const res = await fetch(`https://graph.instagram.com/access_token?${params}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Long-lived token exchange failed: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Extends a long-lived token by another 60 days. The token must be at least
 * 24 hours old and not yet expired. If this stops running, every automation
 * silently dies when the token lapses.
 */
export async function refreshLongLivedToken(token: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  });

  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  }
  return json;
}
