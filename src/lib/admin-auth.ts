// Admin authentication core: one shared password (`ADMIN_PASSWORD`) and a
// signed, expiring session cookie (`AUTH_SECRET`).
//
// Design notes:
// - The testable logic lives in a factory that takes its configuration as an
//   argument, so tests never touch `process.env`. The module-level helpers
//   below are the thin, environment-reading singleton around it.
// - No third-party dependency: the token is a JSON payload (`{ exp }` in
//   epoch seconds) encoded as base64url plus an HMAC-SHA256 signature, both
//   compared with `crypto.timingSafeEqual` over SHA-256 digests so the
//   comparison time never depends on the input length or content.
// - `AUTH_SECRET` missing is a configuration error: the message names the
//   variable, never its value. `ADMIN_PASSWORD` missing simply means nobody
//   can log in (the login form shows the generic error, the server logs a
//   warning).

import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Cookie that carries the signed admin session. */
export const ADMIN_SESSION_COOKIE = "admin_session";

/** Session lifetime: 12 hours, in seconds (`maxAge` unit). */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const TOKEN_SEPARATOR = ".";
const SHA256_BYTES = 32;

export type AdminAuthOptions = {
  /** Shared panel password. Empty or missing disables login. */
  password?: string | undefined;
  /** Signing secret. Empty or missing is a configuration error. */
  secret?: string | undefined;
};

export type AdminSession = {
  /** `payload.signature`, safe to store in an HttpOnly cookie. */
  token: string;
  /** Expiry as epoch milliseconds (the payload carries epoch seconds). */
  expiresAt: number;
};

export type AdminAuth = {
  /** Constant-time check of a submitted password. Never throws, never logs. */
  verifyAdminPassword(input: string): boolean;
  /** Builds a session that expires 12 hours after `now` (epoch ms). */
  createAdminSession(now?: number): AdminSession;
  /** Signature + expiry check. Never throws; malformed input is `false`. */
  verifyAdminSession(token: string | null | undefined, now?: number): boolean;
};

function sha256Digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Both sides are always 32-byte digests, so the length check never short
// circuits on attacker-controlled length and `timingSafeEqual` never throws.
function digestsMatch(left: string, right: string): boolean {
  const a = sha256Digest(left);
  const b = sha256Digest(right);
  return a.length === SHA256_BYTES && b.length === SHA256_BYTES && timingSafeEqual(a, b);
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function decodePayload(payload: string): unknown {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Builds an auth instance from explicit configuration.
 *
 * Throws (missing `AUTH_SECRET`) at factory time: signing without a secret is
 * never valid, and failing here is louder than a session that silently never
 * verifies. A missing `password` is not an error: verification just fails.
 */
export function createAdminAuth(options: AdminAuthOptions): AdminAuth {
  const secret = (options.secret ?? "").trim();
  if (secret === "") {
    throw new Error(
      "AUTH_SECRET is not set: the admin session cookie cannot be signed.",
    );
  }
  const password = options.password ?? "";

  return {
    verifyAdminPassword(input: string): boolean {
      if (typeof input !== "string" || input === "") {
        return false;
      }
      if (password === "") {
        return false;
      }
      return digestsMatch(input, password);
    },

    createAdminSession(now: number = Date.now()): AdminSession {
      const expiresAtSeconds = Math.floor(now / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS;
      const payload = Buffer.from(
        JSON.stringify({ exp: expiresAtSeconds }),
        "utf8",
      ).toString("base64url");
      return {
        token: `${payload}${TOKEN_SEPARATOR}${signPayload(payload, secret)}`,
        expiresAt: expiresAtSeconds * 1000,
      };
    },

    verifyAdminSession(token: string | null | undefined, now: number = Date.now()): boolean {
      if (typeof token !== "string" || token.length === 0) {
        return false;
      }
      const parts = token.split(TOKEN_SEPARATOR);
      if (parts.length !== 2) {
        return false;
      }
      const [payload, signature] = parts;
      if (payload.length === 0 || signature.length === 0) {
        return false;
      }
      // Signature first: an unsigned payload is never parsed.
      if (!digestsMatch(signPayload(payload, secret), signature)) {
        return false;
      }
      const decoded = decodePayload(payload);
      if (typeof decoded !== "object" || decoded === null) {
        return false;
      }
      const exp = (decoded as { exp?: unknown }).exp;
      if (typeof exp !== "number" || !Number.isFinite(exp)) {
        return false;
      }
      return exp * 1000 > now;
    },
  };
}

function envValue(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Configuration problem shown by the admin layout, computed once at module
 * load (same fail-fast spirit as `src/lib/db.ts`, but as data instead of a
 * throw so the panel can render an explanation instead of a crash).
 * `null` means the admin auth is usable.
 */
export const adminAuthConfigError: string | null = (() => {
  if (envValue("AUTH_SECRET") === "") {
    return "Falta la variable de entorno AUTH_SECRET: el panel no puede firmar sesiones.";
  }
  return null;
})();

let cachedAuth: { secret: string; auth: AdminAuth } | null = null;

function authForSecret(secret: string): AdminAuth {
  if (cachedAuth?.secret === secret) {
    return cachedAuth.auth;
  }
  const auth = createAdminAuth({ password: envValue("ADMIN_PASSWORD"), secret });
  cachedAuth = { secret, auth };
  return auth;
}

/**
 * Environment-backed singleton for Server Actions and Server Components.
 * Throws only when used without `AUTH_SECRET`; callers that render UI check
 * `adminAuthConfigError` first.
 */
export function getAdminAuth(): AdminAuth {
  return authForSecret(envValue("AUTH_SECRET"));
}

/**
 * Non-throwing session check for the middleware/proxy guard: a missing secret
 * means "not authenticated" (the login page then shows the configuration
 * error) instead of a crash on every request.
 */
export function verifyAdminSessionToken(token: string | null | undefined): boolean {
  const secret = envValue("AUTH_SECRET");
  if (secret === "") {
    return false;
  }
  return authForSecret(secret).verifyAdminSession(token);
}
