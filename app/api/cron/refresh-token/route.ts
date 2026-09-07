import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { account, db } from "@/db";
import { accessTokenFor } from "@/lib/account";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { encrypt } from "@/lib/crypto";
import { refreshLongLivedToken } from "@/lib/instagram/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refresh once the token is inside this much of its expiry. */
const RENEW_WITHIN_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * Keeps the 60-day Instagram token alive.
 *
 * This is the quiet single point of failure for the whole product: if the
 * token lapses, every automation stops firing with no visible error. The
 * 10-day margin means roughly 10 consecutive daily runs would have to fail
 * before anything breaks.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const accounts = await db.select().from(account);
  const results: { username: string; refreshed: boolean; error?: string }[] = [];

  for (const acct of accounts) {
    const remaining = acct.tokenExpiresAt.getTime() - Date.now();
    if (remaining > RENEW_WITHIN_MS) {
      results.push({ username: acct.username, refreshed: false });
      continue;
    }

    try {
      const refreshed = await refreshLongLivedToken(accessTokenFor(acct));
      await db
        .update(account)
        .set({
          accessToken: encrypt(refreshed.access_token),
          tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(account.id, acct.id));
      results.push({ username: acct.username, refreshed: true });
    } catch (error) {
      console.error("[cron] token refresh failed", acct.username, error);
      results.push({
        username: acct.username,
        refreshed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ results });
}
