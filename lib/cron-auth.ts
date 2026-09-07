import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "./env";

/**
 * Guards the cron routes. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
 * without this check the endpoints would be publicly triggerable.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
