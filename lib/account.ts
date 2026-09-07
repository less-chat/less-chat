import "server-only";
import { eq } from "drizzle-orm";
import { account, db } from "@/db";
import { decrypt } from "./crypto";

export type Account = typeof account.$inferSelect;

/**
 * The connected account.
 *
 * Single-tenant: there is one row, so the webhook handler (which has no
 * session cookie to read) can simply take it. When this becomes
 * multi-tenant, the webhook will instead look the account up by the
 * `entry[].id` Instagram sends, and this helper goes away.
 */
export async function getAccount(): Promise<Account | null> {
  const rows = await db.select().from(account).limit(1);
  return rows[0] ?? null;
}

export async function getAccountById(id: string): Promise<Account | null> {
  const rows = await db.select().from(account).where(eq(account.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Resolves an account by the Instagram user id in a webhook payload. */
export async function getAccountByIgUserId(igUserId: string): Promise<Account | null> {
  const rows = await db
    .select()
    .from(account)
    .where(eq(account.igUserId, igUserId))
    .limit(1);
  return rows[0] ?? null;
}

export function accessTokenFor(a: Account): string {
  return decrypt(a.accessToken);
}
