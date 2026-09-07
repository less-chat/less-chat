import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the raw request body.
 *
 * This must run on the *raw* bytes, before any JSON parsing — re-serialising
 * the parsed object produces different bytes and the signature will never
 * match. Without this check, anyone who learns the webhook URL could forge
 * comment events and make the account DM arbitrary people.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", env.instagramAppSecret).update(rawBody).digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");

  // timingSafeEqual throws on length mismatch, so guard first.
  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
}
