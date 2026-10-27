"use server";

// Admin login Server Action. The password never leaves the server unverified
// and never reaches a log: a failure always renders the same generic message,
// whether the password was wrong or `ADMIN_PASSWORD` is not configured (the
// specific cause is a server-side warning only).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { safeRedirectPath } from "@/app/admin/next-path";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  getAdminAuth,
} from "@/lib/admin-auth";

/** Reads one text field from the submitted form, `""` when absent. */
function readTextField(formData: FormData, field: string): string {
  for (const [name, value] of formData.entries()) {
    if (name === field) {
      return typeof value === "string" ? value : "";
    }
  }
  return "";
}

export async function loginAction(formData: FormData): Promise<void> {
  const next = safeRedirectPath(readTextField(formData, "next") || null);
  const submitted = readTextField(formData, "password");

  let authenticated = false;
  try {
    authenticated = getAdminAuth().verifyAdminPassword(submitted);
  } catch (error) {
    // AUTH_SECRET missing: the layout already renders the configuration
    // error, so the form only needs the generic failure path.
    console.warn(
      "[admin] cannot verify the password:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  if (!authenticated) {
    if ((process.env.ADMIN_PASSWORD ?? "").trim() === "") {
      console.warn("[admin] rejected a login attempt: ADMIN_PASSWORD is not set");
    }
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const session = getAdminAuth().createAdminSession();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  redirect(next);
}
