import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { destroySession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(`${env.appUrl}/login`, { status: 303 });
}
