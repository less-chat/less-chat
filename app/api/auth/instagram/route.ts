import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/instagram/oauth";
import { setOAuthState } from "@/lib/session";

export const runtime = "nodejs";

/** Starts Instagram Business Login. */
export async function GET() {
  const state = randomBytes(16).toString("hex");
  await setOAuthState(state);
  return NextResponse.redirect(authorizeUrl(state));
}
