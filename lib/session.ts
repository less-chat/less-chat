import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE = "mc_session";
const OAUTH_STATE_COOKIE = "mc_oauth_state";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  return new TextEncoder().encode(env.sessionSecret);
}

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function createSession(accountId: string) {
  const token = await new SignJWT({ accountId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, { ...baseCookie, maxAge: MAX_AGE_SECONDS });
}

export async function getSession(): Promise<{ accountId: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    return { accountId: payload.accountId as string };
  } catch {
    // Expired or tampered with — treat as logged out.
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/**
 * CSRF protection for the OAuth round-trip: the `state` we send to Instagram
 * is echoed back on the callback and must match this cookie, otherwise an
 * attacker could trick the user into connecting an account they don't own.
 */
export async function setOAuthState(state: string) {
  (await cookies()).set(OAUTH_STATE_COOKIE, state, { ...baseCookie, maxAge: 600 });
}

export async function consumeOAuthState(): Promise<string | null> {
  const jar = await cookies();
  const state = jar.get(OAUTH_STATE_COOKIE)?.value ?? null;
  jar.delete(OAUTH_STATE_COOKIE);
  return state;
}
