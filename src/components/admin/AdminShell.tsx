// Chrome shared by every authenticated admin page: a header with the panel
// title and the logout form, plus the `main` landmark the pages fill in.

import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/admin/(panel)/actions";

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link
            href="/admin"
            className="font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Panel de la cooperativa
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
