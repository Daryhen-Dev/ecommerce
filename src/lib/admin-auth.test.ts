// Unit tests for the admin auth core: password verification with a
// constant-time comparison and the signed, expiring session token.
//
// The module is `server-only` (a marker package that throws outside a React
// Server bundle), so the tests stub it. Configuration is injected through
// `createAdminAuth({ password, secret })`: no `process.env` mutation and no
// ambient state, so every case is explicit and order-independent.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminAuth,
  type AdminAuth,
} from "./admin-auth";

const PASSWORD = "correct-horse-battery";
const SECRET = "unit-test-signing-secret";

// Fixed clock: the token carries an expiry, so time must be a parameter.
const NOW = Date.parse("2025-10-15T14:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function createAuth(overrides: { password?: string; secret?: string } = {}): AdminAuth {
  return createAdminAuth({
    password: PASSWORD,
    secret: SECRET,
    ...overrides,
  });
}

/** Splits a token into its payload and signature segments. */
function segments(token: string): [string, string] {
  const parts = token.split(".");
  expect(parts).toHaveLength(2);
  return [parts[0], parts[1]];
}

describe("verifyAdminPassword", () => {
  it("accepts the configured password", () => {
    expect(createAuth().verifyAdminPassword(PASSWORD)).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(createAuth().verifyAdminPassword("wrong-password")).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(createAuth().verifyAdminPassword("")).toBe(false);
  });

  it("rejects every password when ADMIN_PASSWORD is not configured", () => {
    const auth = createAdminAuth({ secret: SECRET });
    expect(auth.verifyAdminPassword("")).toBe(false);
    expect(auth.verifyAdminPassword("anything")).toBe(false);
  });

  it("rejects inputs of a different length without throwing", () => {
    // Constant-time comparison digests both sides first, so a length
    // mismatch must not escape as a `timingSafeEqual` range error.
    const auth = createAuth();
    expect(auth.verifyAdminPassword("x".repeat(10_000))).toBe(false);
    expect(auth.verifyAdminPassword("a")).toBe(false);
    expect(auth.verifyAdminPassword(PASSWORD + " ")).toBe(false);
  });
});

describe("createAdminAuth", () => {
  it("throws at factory time when AUTH_SECRET is missing or blank", () => {
    expect(() => createAdminAuth({ password: PASSWORD })).toThrow(/AUTH_SECRET/);
    expect(() => createAdminAuth({ password: PASSWORD, secret: "" })).toThrow(
      /AUTH_SECRET/,
    );
    expect(() => createAdminAuth({ password: PASSWORD, secret: "   " })).toThrow(
      /AUTH_SECRET/,
    );
  });
});

describe("admin session token", () => {
  it("creates a session that verifies and expires in 12 hours", () => {
    const session = createAuth().createAdminSession(NOW);

    expect(typeof session.token).toBe("string");
    expect(segments(session.token)).toHaveLength(2);
    expect(session.expiresAt).toBe(NOW + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);
    expect(createAuth().verifyAdminSession(session.token, NOW)).toBe(true);
  });

  it("keeps the expiry inside the signed payload in epoch seconds", () => {
    const session = createAuth().createAdminSession(NOW);
    const [payload] = segments(session.token);
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    expect(decoded).toEqual({ exp: Math.floor(NOW / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS });
  });

  it("rejects an expired token", () => {
    const session = createAuth().createAdminSession(NOW);
    expect(createAuth().verifyAdminSession(session.token, NOW + 11 * HOUR_MS)).toBe(true);
    expect(createAuth().verifyAdminSession(session.token, NOW + 13 * HOUR_MS)).toBe(false);
  });

  it("rejects the token exactly at its expiry instant", () => {
    const session = createAuth().createAdminSession(NOW);
    expect(createAuth().verifyAdminSession(session.token, session.expiresAt - 1)).toBe(true);
    expect(createAuth().verifyAdminSession(session.token, session.expiresAt)).toBe(false);
  });

  it("rejects a tampered payload even with the original signature", () => {
    const session = createAuth().createAdminSession(NOW);
    const [payload, signature] = segments(session.token);
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp: number;
    };
    const extended = Buffer.from(
      JSON.stringify({ exp: decoded.exp + 365 * 24 * 60 * 60 }),
      "utf8",
    ).toString("base64url");

    const tampered = `${extended}.${signature}`;
    expect(createAuth().verifyAdminSession(tampered, NOW)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const session = createAuth().createAdminSession(NOW);
    const [payload, signature] = segments(session.token);
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);

    expect(createAuth().verifyAdminSession(`${payload}.${flipped}`, NOW)).toBe(false);
  });

  it("rejects a token signed with another secret", () => {
    const foreign = createAdminAuth({ password: PASSWORD, secret: "another-secret" });
    const session = foreign.createAdminSession(NOW);
    expect(createAuth().verifyAdminSession(session.token, NOW)).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    const auth = createAuth();
    for (const token of ["", "garbage", "a.b.c", ".", "payload.", ".signature", "%%%.%%%"]) {
      expect(auth.verifyAdminSession(token, NOW)).toBe(false);
    }
    expect(auth.verifyAdminSession(null, NOW)).toBe(false);
    expect(auth.verifyAdminSession(undefined, NOW)).toBe(false);
  });

  it("rejects a signed payload that is not a JSON expiry", () => {
    // A payload the signer did not produce can be valid JSON and still be
    // rejected: the signature check comes first, and the shape check second.
    const auth = createAuth();
    const weird = Buffer.from(JSON.stringify({ exp: "later" }), "utf8").toString("base64url");
    expect(auth.verifyAdminSession(`${weird}.${"A".repeat(43)}`, NOW)).toBe(false);
  });
});

describe("admin session cookie constants", () => {
  it("uses a 12 hour cookie", () => {
    expect(ADMIN_SESSION_COOKIE).toBe("admin_session");
    expect(ADMIN_SESSION_MAX_AGE_SECONDS).toBe(12 * 60 * 60);
  });
});
