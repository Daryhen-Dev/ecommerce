// Catalog E2E for S3. Requires the local database migrated and demo-seeded
// with fresh relative dates BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
// The demo seed creates shipments whose cutoff dates are relative to "now";
// against a stale database the "next flight" assertions would not hold.
import { test, expect } from "@playwright/test";

import { FLIGHT_NUMBERS, SPECIES, kgText } from "./support/demo";
import { expectNoSeriousAxeViolations } from "./support/axe";

test.describe("city picker (/)", () => {
  test("lists Quito, Guayaquil and Cuenca links in that order", async ({
    page,
  }) => {
    await page.goto("/");

    const airportLinks = page.getByRole("list").getByRole("link");
    await expect(airportLinks.filter({ hasText: "Quito" })).toHaveAttribute(
      "href",
      "/uio",
    );
    const hrefs = await airportLinks.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")),
    );
    expect(hrefs).toEqual(["/uio", "/gye", "/cue"]);
  });

  test("clicking Quito navigates to /uio", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Quito/ }).click();
    await expect(page).toHaveURL(/\/uio$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Quito",
    );
  });

  test("passes axe", async ({ page }) => {
    await page.goto("/");
    await expectNoSeriousAxeViolations(page);
  });
});

test.describe("city catalog (/uio)", () => {
  test("shows the next flight with its cutoff", async ({ page }) => {
    await page.goto("/uio");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Quito",
    );
    const flightSection = page.getByRole("region", { name: /Próximo vuelo/ });
    await expect(flightSection).toContainText(FLIGHT_NUMBERS.UIO);
    await expect(flightSection).toContainText("Pedidos hasta");
    await expect(flightSection).toContainText("Salida");
    await expect(flightSection).toContainText("Llegada estimada");
    await expect(flightSection).toContainText("Retiro en el aeropuerto");
  });

  test("shows lobster available and without volume discount", async ({
    page,
  }) => {
    await page.goto("/uio");

    const lobster = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: SPECIES.lobster.name }),
    });
    await expect(lobster).toContainText(
      `Disponible: ${kgText(SPECIES.lobster.availableGrams)}`,
    );
    await expect(lobster).toContainText("Sin descuento por volumen");
  });

  test("shows mahi-mahi out of season with its return date", async ({
    page,
  }) => {
    await page.goto("/uio");

    const mahi = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: SPECIES.mahiMahi.name }),
    });
    await expect(mahi).toContainText("Fuera de temporada");
    await expect(mahi).toContainText("Vuelve el");
  });

  test("shows snapper custom volume discount tiers", async ({ page }) => {
    await page.goto("/uio");

    const snapper = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: SPECIES.snapper.name }),
    });
    await expect(snapper).toContainText("Desde 3 kg en tu pedido: 3% de descuento");
  });

  test("shows grouper available", async ({ page }) => {
    await page.goto("/uio");

    const grouper = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: SPECIES.grouper.name }),
    });
    await expect(grouper).toContainText(
      `Disponible: ${kgText(SPECIES.grouper.availableGrams)}`,
    );
  });

  test("passes axe", async ({ page }) => {
    await page.goto("/uio");
    await expectNoSeriousAxeViolations(page);
  });
});

test.describe("other cities and errors", () => {
  test("/cue shows the Cuenca flight", async ({ page }) => {
    await page.goto("/cue");
    await expect(page.getByRole("region", { name: /Próximo vuelo/ })).toContainText(
      FLIGHT_NUMBERS.CUE,
    );
  });

  test("/xyz shows a friendly 404 with a link home", async ({ page }) => {
    await page.goto("/xyz");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("404");
    await expect(
      page.getByRole("link", { name: /volver|inicio/i }),
    ).toHaveAttribute("href", "/");
  });

  test("404 page passes axe", async ({ page }) => {
    await page.goto("/xyz");
    await expectNoSeriousAxeViolations(page);
  });
});
