import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

const SECRET = "test-app-secret";

beforeAll(() => {
  process.env.INSTAGRAM_APP_SECRET = SECRET;
});

async function verify(body: string, header: string | null) {
  const { verifySignature } = await import("../webhook-verify");
  return verifySignature(body, header);
}

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifySignature", () => {
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "1" }] });

  it("accepts a correctly signed body", async () => {
    expect(await verify(body, sign(body))).toBe(true);
  });

  it("rejects a body signed with the wrong secret", async () => {
    expect(await verify(body, sign(body, "attacker-secret"))).toBe(false);
  });

  it("rejects a tampered body — the core forgery defence", async () => {
    const signature = sign(body);
    const tampered = JSON.stringify({ object: "instagram", entry: [{ id: "999" }] });
    expect(await verify(tampered, signature)).toBe(false);
  });

  it("rejects a missing header", async () => {
    expect(await verify(body, null)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", async () => {
    expect(await verify(body, createHmac("sha256", SECRET).update(body).digest("hex")))
      .toBe(false);
  });

  it("rejects a truncated signature without throwing", async () => {
    expect(await verify(body, "sha256=abcd")).toBe(false);
  });

  it("rejects non-hex garbage without throwing", async () => {
    expect(await verify(body, "sha256=zzzz")).toBe(false);
  });

  it("is sensitive to whitespace, since Meta signs the exact bytes", async () => {
    const signature = sign(body);
    expect(await verify(` ${body}`, signature)).toBe(false);
  });
});
