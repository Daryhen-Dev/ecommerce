// Admin login: a Server Component form posting to a Server Action (no client
// JavaScript needed). Failures come back as `?error=1`, always with the same
// generic message: the UI never reveals which variable is misconfigured.
//
// This route lives outside the (panel) route group on purpose: it must be
// reachable without a session, and it has no shell/logout button.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loginAction } from "@/app/admin/login/actions";
import { safeRedirectPath } from "@/app/admin/next-path";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso al panel | Pesca Artesanal Galápagos",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;

  // A valid session does not need the form again.
  const cookieStore = await cookies();
  if (verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect(safeRedirectPath(next));
  }

  const nextValue = typeof next === "string" ? next : "";

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-bold">Acceso al panel</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Ingresa la contraseña de la cooperativa para administrar los
        desembarques, vuelos, especies y pedidos.
      </p>

      <form action={loginAction} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="next" value={nextValue} />
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={error ? "login-error" : undefined}
            className="rounded-md border border-neutral-400 bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>
        {error ? (
          <p id="login-error" role="alert" className="text-sm text-red-800">
            Contraseña incorrecta.
          </p>
        ) : null}
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
