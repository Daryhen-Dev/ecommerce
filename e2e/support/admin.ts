// Admin credentials shared by `playwright.config.ts` (which passes them to the
// production server it starts) and the admin specs (which type them into the
// login form). One definition, so the server and the test can never disagree.
//
// Override them by exporting ADMIN_PASSWORD / AUTH_SECRET before running the
// suite; the config and the specs read the same environment.

import { expect, type Page } from "@playwright/test";

function envOrDefault(name: "ADMIN_PASSWORD" | "AUTH_SECRET", fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : fallback;
}

export const ADMIN_E2E_PASSWORD = envOrDefault("ADMIN_PASSWORD", "admin-demo-password");

export const ADMIN_E2E_SECRET = envOrDefault("AUTH_SECRET", "admin-demo-secret");

export const ADMIN_E2E_ENV: Record<string, string> = {
  ADMIN_PASSWORD: ADMIN_E2E_PASSWORD,
  AUTH_SECRET: ADMIN_E2E_SECRET,
};

/**
 * Logs in through the real login form (the panel's only entry point) and
 * lands on the dashboard. Shared by the operational admin specs, which all
 * need a session before visiting a section page.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
