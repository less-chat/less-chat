import { NextRequest, NextResponse } from "next/server";
import { account, db } from "@/db";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getMe, subscribeWebhooks } from "@/lib/instagram/client";
import { exchangeCode, exchangeForLongLivedToken } from "@/lib/instagram/oauth";
import { consumeOAuthState, createSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(reason: string) {
  return NextResponse.redirect(
    `${env.appUrl}/login?error=${encodeURIComponent(reason)}`,
  );
}

/**
 * OAuth callback: turns the authorization code into a stored, encrypted
 * 60-day token, subscribes the account's webhooks, and logs the user in.
 *
 * This single handler is the entire "Login with Instagram" experience —
 * after it returns, the app is fully wired and ready to publish automations.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const denied = params.get("error");
  if (denied) {
    return fail(params.get("error_description") ?? denied);
  }

  const code = params.get("code");
  if (!code) return fail("Instagram did not return an authorization code.");

  // CSRF: the state we issued must come back unchanged.
  const expectedState = await consumeOAuthState();
  if (!expectedState || params.get("state") !== expectedState) {
    return fail("Login session expired. Please try again.");
  }

  try {
    const shortLived = await exchangeCode(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const token = longLived.access_token;

    const profile = await getMe(token);
    const igUserId = String(profile.user_id ?? shortLived.user_id);

    // Subscribe to comment and message webhooks so the Meta dashboard never
    // needs to be touched again. A failure here is recoverable from the
    // dashboard, so it must not block login.
    let webhookSubscribed = false;
    try {
      const result = await subscribeWebhooks(token);
      webhookSubscribed = Boolean(result.success);
    } catch (error) {
      console.error("[auth] webhook subscription failed", error);
    }

    const values = {
      igUserId,
      username: profile.username,
      profilePictureUrl: profile.profile_picture_url ?? null,
      accessToken: encrypt(token),
      tokenExpiresAt: new Date(Date.now() + longLived.expires_in * 1000),
      webhookSubscribed,
      updatedAt: new Date(),
    };

    const [row] = await db
      .insert(account)
      .values(values)
      .onConflictDoUpdate({ target: account.igUserId, set: values })
      .returning({ id: account.id });

    await createSession(row.id);
    return NextResponse.redirect(`${env.appUrl}/automations`);
  } catch (error) {
    console.error("[auth] login failed", error);
    return fail(error instanceof Error ? error.message : "Login failed.");
  }
}
