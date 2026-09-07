import { after, NextRequest, NextResponse } from "next/server";
import { db, webhookEvent } from "@/db";
import { env } from "@/lib/env";
import { verifySignature } from "@/lib/instagram/webhook-verify";
import type { WebhookBody } from "@/lib/instagram/types";
import { PRIVATE_REPLY_WINDOW_MS, processEvent } from "@/lib/automation/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's webhook verification handshake, called once when the callback URL
 * is saved in the app dashboard.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === env.webhookVerifyToken
  ) {
    // Must echo the challenge back verbatim as plain text.
    return new NextResponse(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Receives comment and message notifications.
 *
 * The contract with Meta is strict: acknowledge fast, or the subscription
 * gets throttled and eventually disabled. So this handler does the minimum —
 * verify, persist, respond 200 — and defers all real work to `after()`,
 * which runs once the response is already on its way. Anything that fails
 * there is left `pending`/`failed` in the database for the cron sweeper.
 */
export async function POST(request: NextRequest) {
  // Signature must be checked against the raw bytes, before JSON parsing.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    // Acknowledge malformed bodies: retrying will not make them parse.
    return NextResponse.json({ received: true });
  }

  const field = detectField(body);
  const expiresAt = field === "comments" ? deriveExpiry(body) : null;

  const [event] = await db
    .insert(webhookEvent)
    .values({ field, payload: body, expiresAt })
    .returning({ id: webhookEvent.id });

  after(async () => {
    try {
      await processEvent(event.id);
    } catch (error) {
      // Already recorded on the event row; never let this reject unhandled.
      console.error("[webhook] processing failed", event.id, error);
    }
  });

  return NextResponse.json({ received: true });
}

function detectField(body: WebhookBody): string {
  for (const entry of body.entry ?? []) {
    if (entry.changes?.length) return entry.changes[0].field;
    if (entry.messaging?.length) return "messages";
  }
  return "unknown";
}

/** Deadline after which a private reply can no longer be sent. */
function deriveExpiry(body: WebhookBody): Date | null {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const ts = change.value?.timestamp;
      const base = ts ? new Date(ts) : new Date();
      if (!Number.isNaN(base.getTime())) {
        return new Date(base.getTime() + PRIVATE_REPLY_WINDOW_MS);
      }
    }
  }
  return new Date(Date.now() + PRIVATE_REPLY_WINDOW_MS);
}
