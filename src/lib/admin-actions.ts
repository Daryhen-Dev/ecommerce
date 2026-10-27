// Shared admin Server Action kit: the action-result shape every admin form
// returns, multi-field collection with merged field errors, the form-level
// error helper, and the session guard a mutating action must call first.
//
// Server Actions re-validate every field server-side (the client validation
// is a convenience, never the authority), so all of them funnel through
// `collectFields` and return a single `ActionResult`: either parsed data or
// the per-field Spanish messages the form re-renders.

import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getAdminSessionTokenFromCookieStore,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import type { ParseResult } from "@/lib/admin-fields";

/** One Spanish message per invalid field, keyed by input name. */
export type FieldErrors = Record<string, string>;

/**
 * What every admin Server Action returns. `fieldErrors` are rendered next to
 * their inputs, `formError` is an order-level failure (e.g. a uniqueness
 * violation that only the database can detect).
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: FieldErrors; formError?: string };

/** Path of the admin login route (the redirect target of the guard). */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Default panel path, used when the referring page is unknown. */
const DEFAULT_ADMIN_PATH = "/admin";

/** A submitted form entry: text, a file, or absent. */
export type SubmittedEntries = Record<string, FormDataEntryValue | undefined>;

/** Raw text of one submitted entry: files and missing fields become `""`. */
function rawEntry(entry: FormDataEntryValue | undefined): string {
  return typeof entry === "string" ? entry : "";
}

/**
 * Runs every parser against its submitted entry and merges all failures.
 *
 * Parsers are not short-circuited: the form gets the complete set of errors
 * in one pass, so the operator fixes everything at once. Entries without a
 * parser are ignored (never echoed back), and an absent or file entry is
 * parsed as `""` so required-field parsers reject it naturally.
 */
export function collectFields(
  entries: SubmittedEntries,
  parsers: Record<string, (raw: string) => ParseResult<unknown>>,
): { ok: true; values: Record<string, unknown> } | { ok: false; fieldErrors: FieldErrors } {
  const values: Record<string, unknown> = {};
  const fieldErrors: FieldErrors = {};

  for (const [field, parse] of Object.entries(parsers)) {
    const parsed = parse(rawEntry(entries[field]));
    if (parsed.ok) {
      values[field] = parsed.value;
    } else {
      fieldErrors[field] = parsed.error;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, values };
}

/**
 * Builds a failure that has no field to point at, e.g. a unique-slug
 * violation reported by Prisma: "Ese slug ya existe."
 */
export function formErrorResult(message: string): ActionResult<never> {
  return { ok: false, fieldErrors: {}, formError: message };
}

/**
 * Derives the `next` path for the login redirect from a Referer header.
 *
 * Server Actions cannot know the page that hosted the form, and the
 * middleware does not forward the pathname, so the Referer is used as a best
 * effort. Only same-origin admin paths are kept; anything else (a missing
 * header, a non-admin page, a protocol-relative path) falls back to the
 * dashboard. The login page re-validates the value with `safeRedirectPath`
 * before using it as a redirect target.
 */
export function adminLoginRedirectPath(referer: string | null | undefined): string {
  if (typeof referer !== "string" || referer === "") {
    return DEFAULT_ADMIN_PATH;
  }
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return DEFAULT_ADMIN_PATH;
  }
  const path = `${url.pathname}${url.search}`;
  if (path === DEFAULT_ADMIN_PATH || path.startsWith("/admin/") || path.startsWith("/admin?")) {
    return path;
  }
  return DEFAULT_ADMIN_PATH;
}

/**
 * Session guard for admin Server Actions: returns normally with a valid
 * session and redirects to the login page (carrying the current path in
 * `next`) otherwise. The middleware is only a fast gate, so every mutating
 * action re-checks the cookie here before touching the database.
 */
export async function assertAdminSessionOrRedirect(): Promise<void> {
  const cookieStore = await cookies();
  const token = getAdminSessionTokenFromCookieStore(cookieStore);
  if (verifyAdminSessionToken(token)) {
    return;
  }
  const headerList = await headers();
  const next = adminLoginRedirectPath(headerList.get("referer"));
  redirect(`${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(next)}`);
}
