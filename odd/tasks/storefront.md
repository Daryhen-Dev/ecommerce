# Feature: storefront

## Objective

Customer-facing catalog and cart: the customer picks a destination city
(Quito, Guayaquil, Cuenca), sees the next orderable flight and the fresh fish
available for it, builds a cart in kilograms, and sees a server-computed
summary (volume discount + VAT). Payment is out of scope: the flow stops at a
disabled "Ir a pagar" step.

## Problem / why

`platform-foundation` delivered verified business rules but nothing a
customer can use. The storefront is the first consumer of those rules and
validates them end to end in a real browser.

## Decisions (owner, 2025-10-06)

- **City first.** Entry page asks for the destination airport; the catalog is
  scoped to that city's next orderable shipment.
- **Shared lot stock.** A lot's kilograms are available to any shipment until
  sold out (first paid order wins). No per-flight allocation; no schema change.
- **Scope:** catalog + cart + summary; checkout/payment comes with the
  payment gateway feature.
- **Playwright** for browser E2E tests (`@playwright/test`, Chromium only).
- Accountant VAT confirmation stays last, before launch.

## Rules applied (from platform-foundation)

- Orderable shipment: `canOrder` (cutoff inclusive, before departure).
- Seasonal species visible as orderable only inside a season window
  (`isSpeciesAvailable`); out of season shows "vuelve el …" via
  `nextSeasonStart` when known.
- Available kg per species = Σ `availableGrams` of its OPEN lots.
- Cart quantities: `.` decimal only, per-species minimum and step
  (`canFulfillOrder`), never above available kg.
- Prices: server-authoritative `priceOrder` with global/custom tiers by the
  order's total kg and VAT from `resolveVatRates` at the current instant. The
  client never sends prices, only species slugs and grams.

## Constraints and assumptions

- Times shown in mainland Ecuador time (`America/Guayaquil`, UTC−5) because
  customers pick up in UIO/GYE/CUE.
- Numbers follow the `.` decimal standard (`$12.50`, `7.5 kg`).
- No accounts or auth in this feature; cart lives in the browser
  (localStorage) keyed by shipment, re-quoted on the server on every change.
- No product photos yet (text cards with an accessible placeholder); images
  come with the admin panel.
- Demo data: a separate dev-only `prisma/seed-demo.ts` with species, seasons,
  lots and shipments whose dates are relative to "now", so the UI and E2E
  tests always have an open flight. Never run against production.
- Accessibility: semantic landmarks, labelled inputs, keyboard operable,
  visible focus, `lang="es"`; checked with `@axe-core/playwright`.
- Assumption: catalog pages render on the server per request (no static
  caching), because stock and cutoffs change minute to minute.

## Checks

- TDD: **enabled**, source: explicit user choice (platform-foundation,
  2025-10-05, carried into this feature), runner: `pnpm vitest run`. Pure
  server mapping and cart logic are unit-tested first (RED→GREEN).
- E2E: `pnpm test:e2e` (Playwright, Chromium) against a migrated + demo-seeded
  local database.
- Per task: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm test:e2e` once UI exists.

## Delivery

- Chain strategy: **stacked-to-main** (cached from platform-foundation).
- Base: stacked on PR #3 (`feat/platform-foundation-03-rules`) until the
  platform-foundation chain merges, then retargeted.
- Forecast: ~1,600 authored changed lines (lockfile excluded) → chained PRs:
  - PR S-1 `feat/storefront-01-e2e-demo`: S1 + S2
  - PR S-2 `feat/storefront-02-catalog`: S3
  - PR S-3 `feat/storefront-03-cart`: S4 + S5
- Running count: 616 (S1, lockfile excluded).

## Tasks

- [x] S1 — Playwright setup (`@playwright/test`, `@axe-core/playwright`,
      Chromium, `test:e2e` script, webServer config), dev-only demo seed with
      relative dates, `src/lib/db.ts` fail-fast on missing `DATABASE_URL` +
      `server-only` guard (platform-foundation follow-ups), one smoke E2E on
      the home page with an axe check. Route: delegated (multi-file write).
      Commit `d526465`. Versions: @playwright/test 1.63.0, @axe-core/playwright
      4.13.0, server-only 0.0.1, Chromium 153. Checks: lint/typecheck/test
      (159)/build/test:e2e (1 passed, 0 serious/critical axe); demo seed x2
      idempotent; production and non-local host guards exit non-zero without
      printing the URL (independent gentle-ai-verify). Native review: medium,
      reliability, approved and acknowledged (`review-7118a6de52b3f748`); 3
      advisory suggestions. Note: demo seed replaces all seasons/custom tiers
      of demo species (only lots/shipments carry the DEMO marker).
- [ ] S2 — Catalog read service (`src/server/catalog.ts`): orderable
      shipments per airport, species availability for a shipment (season,
      OPEN lots available kg, price, tiers), mapping logic pure and
      unit-tested (TDD), thin Prisma queries. Route: delegated.
- [ ] S3 — Pages: city picker (`/`), city catalog (`/[airport]`) with next
      flight card (cutoff, departure, pickup window in Ecuador time) and
      species cards (price/kg, available kg, tiers, season state), empty
      states (no open flight, sold out). E2E. Route: delegated.
- [ ] S4 — Cart: client cart per shipment (localStorage), kg input with `.`
      only + min/step + max available, server action re-quoting with
      `priceOrder`, summary page with subtotal/discount/VAT/total and a
      disabled "Ir a pagar". TDD for cart logic. Route: delegated.
- [ ] S5 — E2E flows: pick Quito → add 7.5 kg → totals match `priceOrder`;
      seasonal species out of season not addable; invalid kg input errors;
      keyboard-only path; axe on each page. Route: delegated.

## Acceptance criteria

- A customer can go from city choice to a correct cart summary in Chromium.
- Prices and totals come only from the server and match the domain rules.
- lint/typecheck/test/build/test:e2e pass; no axe violations of serious or
  critical impact.

## Progress / evidence

- Branch: `feat/storefront-01-e2e-demo` from `1fff8bb`.

## Next step

S2 — catalog read service.
