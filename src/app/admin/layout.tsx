// Admin root layout: the configuration gate for the whole `/admin` tree
// (login included). With AUTH_SECRET missing nothing can be signed, so every
// admin route shows an explanation instead of crashing.

import type { ReactNode } from "react";

import AdminConfigError from "@/components/admin/AdminConfigError";
import { adminAuthConfigError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  if (adminAuthConfigError !== null) {
    return <AdminConfigError message={adminAuthConfigError} />;
  }
  return children;
}
