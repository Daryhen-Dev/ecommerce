// Panel layout for every authenticated page under /admin (the login page is
// a sibling route, outside this group). The middleware already blocks
// requests without a session, but the guard is re-verified here: middleware
// alone is not the security boundary.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    redirect("/admin/login");
  }

  return <AdminShell>{children}</AdminShell>;
}
