# Feature: admin-panel

## Objective

A password-protected panel where the cooperative runs its daily operation:
create and close lots (landings), schedule and manage shipments (flights) per
airport, edit species with prices and discount tiers, and review orders per
shipment.

## Problem / why

The storefront reads everything the demo seed creates. Without a panel, only
SQL hands-on can operate the marketplace, so nothing real can be sold.

## Decisions (owner, 2025-10-06)

- **Single password** for the whole panel, stored in an environment variable
  (`ADMIN_PASSWORD`), no user accounts. A second factor or real auth comes
  later with the customer accounts feature.
- **Scope = daily operation:** lots, shipments, species (price, policy, tiers,
  seasons) and the per-shipment order list. Rule configuration UIs (global
  tiers, tax rates) are out of this version.
- Panel language: Spanish, same `.` number standard.

## Rules applied (from platform-foundation)

- Lot: `totalGrams > 0`, `reservedGrams >= 0 && <= totalGrams` (DB CHECK +
  domain guard); only OPEN lots sell; closing keeps reservations.
- Shipment: `orderCutoffAt <= departsAt < estimatedArrivalAt`,
  `pickupStartsAt < pickupEndsAt`; only SCHEDULED shipments order; the catalog
  uses `canOrder` at the current instant.
- Species: unique slug; tiers valid (0..10000 bps, non-negative min, no
  duplicate threshold); seasonal species need at least one season to sell.
- Editing what the storefront already quoted does not re-price placed orders
  (they store their locked line data).
- Admin mutations must not bypass shared-lot availability logic: reserved kg
  never decrease except via released orders (admin panel does not touch
  `reservedGrams` directly except to close/cancel a lot with a warning).

## Constraints and assumptions

- Auth: session cookie signed with `AUTH_SECRET`; login page at `/admin`,
  middleware protects `/admin/**` except the login route. Constant-time
  comparison for the password; no password in logs or client payloads.
- Admin actions are Server Actions with server-side re-validation of every
  field (never trust the client).
- Money in cents, weight in grams in the UI too: admin types prices like
  `12.50` (USD/kg) and weights like `120 kg` or `25000 g`? Decision: all
  weights in kilograms with `.` (converted server-side to grams), prices in
  USD/kg with `.` — consistent with the storefront standard.
- Deletion policy: species/lots/shipments are deactivated or closed, never
  deleted (orders reference them; DB is Restrict). Season rows and
  draft-only data may be deleted.
- The panel renders dynamic (no caching); list pages paginate simply
  (limit 50, "next" link) — no pagination framework.
- Audit trail out of scope; `updatedAt` + commit history suffice for now.

## Checks

- TDD: **enabled** (owner choice carried from platform-foundation), runner
  `pnpm vitest run`. Server validation/mapping logic is unit-tested first
  (RED→GREEN). Forms/flows covered by Playwright E2E (Chromium) against demo
  data; admin E2E logs in via the login form.
- Per task: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm test:e2e`.

## Delivery

- Chain strategy: **stacked-to-main** (cached).
- Base: stacked on PR #6 (`feat/storefront-03-cart`) until the chain merges.
- Forecast: ~1,900 authored changed lines → chained PRs:
  - PR A-1 `feat/admin-01-foundation`: A1 + A2
  - PR A-2 `feat/admin-02-operation`: A3 + A4
  - PR A-3 `feat/admin-03-species-orders`: A5 + A6
- Running count: 1,037 (A1, lockfile excluded).

## Tasks

- [x] A1 — Admin foundation: auth (login form at `/admin/login`, session
      cookie, middleware, logout, `ADMIN_PASSWORD`/`AUTH_SECRET` in
      `.env.example`, constant-time check unit-tested), admin layout with
      nav, empty dashboard page; E2E: unauthenticated redirect to login,
      wrong password rejected, login works. Route: delegated.
      Commit `1086caf`. TDD RED→GREEN (16 auth unit tests, 255 total);
      41 E2E incl. login flow + axe; independent gentle-ai-verify PASS.
      Verifier caught a blocker the parent fixed before commit:
      `.env.example` had real local values instead of the demo placeholders.
      Native review: **unavailable** — review.start failed persistently with
      a native `schema-incompatible` error (30+ attempts, multiple
      idempotency keys and baseRef forms; no lineage created). Fallback per
      RDD-off path: independent verifier ran. Retry native review later.
      Note: `src/middleware.ts` uses Next 16's deprecated middleware
      convention (build warning); migrate to `src/proxy.ts` later.
- [ ] A2 — Shared admin server kit: form field parsing/validation helpers
      (kg→grams, USD→cents, datetime-local → Date in `America/Guayaquil`),
      action-result pattern, field-error rendering components; unit-tested.
      Route: delegated.
- [ ] A3 — Lots: list + create + close (+ cancel-with-warning), species
      selector, validation vs rules, reflects on storefront immediately
      (catalog availability). E2E: create a lot, see new availability on
      `/uio`, close it and see it disappear. Route: delegated.
- [ ] A4 — Shipments: list per airport + create + close; validates window
      invariants and previews pickup window; catalog picks it up (next
      orderable flight changes). E2E: create a flight for next week, it
      becomes the second orderable flight; close the current one and the
      new one takes over. Route: delegated.
- [ ] A5 — Species: list + edit (price, min, step, policy, vat category,
      seasonal flag) + tiers editor for CUSTOM policy + seasons editor for
      seasonal species; slug immutable after creation; create new species.
      E2E: change Pargo price and see it on `/uio`; add a tier and see the
      storefront card update. Route: delegated.
- [ ] A6 — Orders: per-shipment order list (items, totals, status) with
      manual status transitions (mark paid/cancelled) and pickup-code
      column; read-only except status. E2E: seed an order via the storefront
      demo flow? (No — order creation needs checkout; seed demo orders in
      `seed-demo.ts` instead.) Route: delegated.

## Acceptance criteria

- The cooperative can, from the panel: register a landing, schedule a flight,
  adjust a price, and see orders for a flight — with the storefront reflecting
  every change immediately.
- All admin mutations validated server-side; auth protects everything under
  `/admin`.
- lint/typecheck/test/build/test:e2e pass; 0 serious/critical axe in the panel
  too.

## Progress / evidence

- Branch: `feat/admin-01-foundation` from `7b74806`.

## Follow-ups

- Migrate `src/middleware.ts` to the `proxy` convention (Next 16 deprecation).
- Unit tests for `safeRedirectPath` (open-redirect guard, currently code+
  E2E only).
- `safeRedirectPath` has no unit test yet; add with A2's test kit.

## Next step

A2 — shared admin form/validation kit (TDD).
