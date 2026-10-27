// Admin authentication E2E (A1): the middleware gate, the login form's
// generic failure, a real login, logout, and axe on both admin states.
//
// The production server is started by `playwright.config.ts`, which forwards
// the same ADMIN_PASSWORD / AUTH_SECRET this spec types into the form
// (see `e2e/support/admin.ts`).

import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./support/axe";
import { ADMIN_E2E_PASSWORD } from "./support/admin";

const WRONG_PASSWORD = "definitely-not-the-password";

async function submitLogin(page: Page, password: string): Promise<void> {
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("visiting /admin without a session redirects to the login page", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Acceso al panel" })).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();

  await expectNoSeriousAxeViolations(page);
});

test("a wrong password shows the generic error and keeps you on the login page", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await submitLogin(page, WRONG_PASSWORD);

  await expect(page.getByText("Contraseña incorrecta.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login\?error=1/);
  await expect(page.getByRole("heading", { level: 1, name: "Acceso al panel" })).toBeVisible();

  // The failure message must not leak which setting is missing or wrong.
  await expect(page.getByText(/AUTH_SECRET|ADMIN_PASSWORD/)).toHaveCount(0);

  await expectNoSeriousAxeViolations(page);
});

test("the shared password logs in and the dashboard renders", async ({ page }) => {
  await page.goto("/admin/login");
  await submitLogin(page, ADMIN_E2E_PASSWORD);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Panel de la cooperativa" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();

  // Next sections are announced, not clickable yet.
  await expect(page.getByRole("heading", { level: 2, name: "Próximamente" })).toBeVisible();
  const upcoming = page.getByRole("listitem").filter({ hasText: "Próximamente" });
  await expect(upcoming).toHaveCount(4);
  for (const name of ["Desembarques", "Vuelos", "Especies", "Pedidos"]) {
    await expect(page.getByText(name, { exact: true })).toHaveCount(1);
  }

  await expectNoSeriousAxeViolations(page);
});

test("logout returns to the storefront and /admin is protected again", async ({ page }) => {
  await page.goto("/admin/login");
  await submitLogin(page, ADMIN_E2E_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("button", { name: "Salir" }).click();

  await expect(page).toHaveURL("http://localhost:3100/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Pesca Artesanal Galápagos" }),
  ).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("a tampered session cookie does not grant access", async ({ page, context }) => {
  await page.goto("/admin/login");
  await submitLogin(page, ADMIN_E2E_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === "admin_session");
  expect(session, "login must set the admin_session cookie").toBeDefined();

  await context.addCookies([
    {
      name: "admin_session",
      value: `${session!.value.slice(0, -2)}xx`,
      domain: session!.domain,
      path: session!.path,
      httpOnly: true,
      secure: session!.secure,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
