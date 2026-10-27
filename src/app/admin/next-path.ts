// Post-login redirect target handling. The `next` value comes from the query
// string (`middleware.ts` / the login form), so it is user-controlled: only
// same-origin absolute paths are accepted, otherwise the caller falls back to
// the dashboard. `//host` and `/\host` are protocol-relative and rejected.

export const DEFAULT_ADMIN_PATH = "/admin";

export function safeRedirectPath(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    return DEFAULT_ADMIN_PATH;
  }
  if (!value.startsWith("/")) {
    return DEFAULT_ADMIN_PATH;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_ADMIN_PATH;
  }
  return value;
}
