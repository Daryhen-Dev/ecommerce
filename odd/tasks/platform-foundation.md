# Feature: platform-foundation

## Objective

Bootstrap the Galápagos fresh-fish ecommerce as a Next.js full-stack monolith
(Next.js + PostgreSQL + Prisma) and encode the core business rules as a pure,
test-driven TypeScript domain module, before any UI, checkout, or payments.

## Problem / why

Selling fresh artisanal fish by air is driven by landings (lots) and flights
(shipments), not by fixed inventory. Pricing, seasons, and order cutoffs are
the riskiest logic; they must be correct and testable independently of the
framework, so later features (catalog UI, admin, checkout, payments, pickup)
build on verified rules.

## Business rules (confirmed with the owner)

- Supply comes from the owner's fishing cooperative (licensing and legal
  origin are covered). Product is **fresh only** (1–2 weeks at sea max).
- Destinations: **Quito (UIO), Guayaquil (GYE), Cuenca (CUE)** only. Cuenca
  flights have 1–2 extra stops.
- **Customer picks up at the destination airport.** Cold chain ends at the
  airport; the airport dispatches cargo (no storage), so pickup is the
  customer's sole responsibility.
- Sold **per kilogram**, decimals allowed (e.g. 7.5 kg). **Number standard
  (owner, 2025-10-05): `.` is the only decimal separator**, in input and in
  display (e.g. `7.5 kg`, `$12.50`); `,` is not accepted as a decimal
  separator. Customer pays the
  **full amount upfront** and waits for the shipment.
- Real weight may differ by about ±2–3 lb (~±1.4 kg); the business absorbs it.
  **No post-weighing price adjustment or refund.**
- **Volume discount per customer order (option 3, confirmed):** each species
  has its own list price per kg; global percentage tiers apply to all species,
  selected by the order's **total kg across species** (cargo is billed by kg
  regardless of species). **Exceptions:** a species may use its own tiers
  (replacing the global tiers for its lines) or be excluded from discounts
  (e.g. lobster). Modeled as `discountPolicy`: GLOBAL | CUSTOM | NONE. Price
  is locked at payment.
- A shipment **always departs**, even with few kg (no minimum, no cancel).
- Seasonal species (e.g. lobster) are **pre-sale within the season window**;
  after the season ends they cannot be purchased.
- Customers are end consumers (no B2B yet). No rush; quality over speed.

## Scope

In: project scaffold, tooling, database schema, domain rules (money/weight,
volume pricing, season availability, shipment ordering window, lot
reservation).

Out (future features): storefront UI, admin panel, auth, checkout, payment
gateway (Payphone/Kushki), electronic invoicing (SRI), notifications, pickup
validation.

## Constraints and assumptions

- Stack: Next.js 16 (App Router) + TypeScript, PostgreSQL 17 (Docker for
  local dev), Prisma 7, Vitest. Package manager: pnpm.
- Domain module (`src/domain`) has no framework or database imports.
- Money stored as integer US cents (Ecuador uses USD); weight stored as integer
  grams. No floating-point arithmetic for money.
- Assumption (configurable, owner to confirm): per-species minimum order and
  order step (default min 1 kg, step 0.5 kg).
- Confirmed (2025-10-05): per-species CUSTOM tiers are selected by the
  order's **total kg across species** (option a); only their percentages
  differ from the global tiers.
- **VAT is configurable, not hardcoded** (owner, 2025-10-05): currently 15% in
  Ecuador, must change by configuration when national policy changes,
  effective-dated so historical orders keep the rate they were charged.
  Parent flag (from memory, not verified against the current law text): the
  LRTI 0% VAT list has historically included fish kept in its natural
  state; owner to confirm with the accountant. Species therefore carry a VAT
  category (STANDARD | ZERO_RATED, default STANDARD per owner) so either
  outcome needs only configuration.

## Checks

- TDD: **enabled**, source: explicit user choice (2025-10-05), runner:
  `pnpm vitest run`.
- Per task: `pnpm lint`, `pnpm typecheck`, `pnpm vitest run`, and `pnpm build`
  when app code changes.

## Delivery

- Strategy: `ask-on-risk` → chain strategy chosen: **stacked-to-main**.
- Forecast: ~1,000 authored changed lines (generated scaffold excluded) →
  chained PRs.
  - PR 1: T1 + T2 (scaffold + schema)
  - PR 2: T3 + T3b (pricing domain + configurable VAT schema)
  - PR 3: T4 + T5 (season/shipment windows + lot reservation)
- Running count: 272 (T1) + 401 (T2) + 1,062 (T3) = 1,735, lockfile and
  migration SQL excluded.
- Remote: GitHub `Daryhen-Dev/ecommerce` (public). Owner chose an empty root
  commit on `main` (`2c3dd69`) and the local history was rebased onto it
  (tree unchanged, `b3adbe7`); commit ids below are the rebased ones.
  - PR #1 `feat/platform-foundation-01-setup` → `main`: `c640071..a643bdc`
    (T1 + T2), 1,019 authored lines, size exception noted.
  - PR #2 (draft) `feat/platform-foundation-02-pricing` → PR #1 branch:
    `ee9c62d..` (T3 + T3b + decimal standard).
  - PR #3: T4 + T5, branch from PR #2.

## Tasks

- [x] T1 — Scaffold Next.js 16 + TypeScript + ESLint + Vitest + pnpm scripts
      (`lint`, `typecheck`, `test`), README with local setup. Route: delegated
      (multi-file write rule) to gentle-ai-worker; parent fixed `.env.example`
      ignore negation and Vitest ESM config (`vitest.config.mts`).
      Commit `d4679ec`. Checks: lint/typecheck/test/build pass (worker +
      independent gentle-ai-verify). Review: native assess unavailable (root
      commit, no base ref) → treated as high; independent verifier passed.
- [x] T2 — PostgreSQL via docker-compose (host port 5433), Prisma 7 setup
      (`prisma.config.ts`, `prisma-client` generator, `@prisma/adapter-pg`),
      initial schema: Airport, Species, Season, DiscountTier (global or
      per-species exception), Lot, Shipment, Order, OrderItem; first
      migration. Route: delegated (multi-file write rule) to gentle-ai-worker.
      Commit `1663c54`. Checks: prisma validate, fresh `migrate deploy`, seed
      x2 idempotent, CHECK overselling guard proven, lint/typecheck/test/build
      (worker + independent gentle-ai-verify). Native review: assess
      unavailable → started on commit; tier medium, lens reliability,
      approved and acknowledged (`review-ca8ba087c5824378`).
- [x] T3 — Domain: `Money` (cents) and `Weight` (grams) value objects;
      volume tier pricing (global % tiers by order total kg, per-species tier
      exceptions, VAT by category with the applicable rate as input, locked
      order totals). TDD. Route: delegated to gentle-ai-worker.
      Commit `bf463d2`. TDD RED→GREEN observed per module (money, weight,
      pricing, barrel); 55 tests; lint/typecheck/build pass; independent
      gentle-ai-verify pass with hand recomputation. Native review: assess
      unavailable → started on commit; medium, reliability lens, approved
      and acknowledged (`review-e3b59cd431b36bc5`). 1,062 authored lines
      (about 60% tests) — exceeds the 400 heuristic because each money rule
      carries concrete-number tests; not split.
- [x] T3c — Domain: decimal standard `.` — `parseKilograms` rejects `,`;
      `formatUsd` / `formatKilograms` output `.` decimals (`$12.50`,
      `7.5 kg`) independent of runtime ICU. TDD. Route: delegated (multi-file
      write rule: money + weight modules and tests). Commit `9226811`. RED
      (8 failing) → GREEN 58 tests; lint/typecheck/build pass; independent
      verify pass (29 probes). Native review: medium, reliability, approved
      and acknowledged (`review-6d0ab5a9039afcf5`); 1 advisory warning at
      `weight.ts:35` (kg regex accepts unbounded leading digits; huge values
      are rejected only by the `grams` safe-integer guard).
- [x] T3b — Schema: configurable effective-dated VAT (`tax_rate` table:
      category, rate bps, effective from; species `vat_category` replaces
      `vat_rate_bps`); seed STANDARD 15% and ZERO_RATED 0%; orders keep the
      locked rate per line. New migration. Route: delegated.
      Commit `9a4c4fb` (migrations `configurable_vat` +
      `configurable_vat_checks`). TDD RED→GREEN for `resolveVatRates`; 73
      tests; validate, migrate status, fresh deploy, seed x2, CHECK proofs
      (order/line total formulas, rate range, duplicate rate) by worker and
      independent gentle-ai-verify. Parent: `.gitattributes` forces LF on
      migrations (CRLF caused a Prisma checksum mismatch on Windows; dev DB
      checksum metadata was repaired by the worker, no schema/data change);
      seed no longer rewrites existing tax rows (append-only). Native review:
      approved and acknowledged (`review-cbabcb5b70df8cb8`, medium,
      reliability; covers T3b + T3c + docs since 98780bd; 3 advisory
      findings: CHECK/formula coupling, nonempty-table migration warning,
      seed rate immutability note).
- [x] T4 — Domain: season availability (pre-sale only inside the window) and
      shipment ordering window (cutoff before departure, per-city). TDD.
      Route: delegated. Commit `b69cbf2`. TDD RED→GREEN (season, shipment,
      barrel); 127 tests total; lint/typecheck/build pass; independent
      gentle-ai-verify pass (36 semantic probes). Native review: medium,
      reliability, approved and acknowledged (`review-1aa752034b30a27d`);
      2 advisory findings (shipmentPhase precedence warning,
      species input shape suggestion). Documented product choices:
      overlapping seasons → latest startsAt wins; phase between arrival and
      pickupStartsAt → PICKUP; pickupEndsAt before arrival allowed (flagged
      as possible future invariant).
- [x] T5 — Domain: lot reservation (available kg per lot, no overselling,
      min/step order validation). TDD. Route: delegated. Commit `d6b3211`.
      TDD RED→GREEN; 159 tests total; lint/typecheck/build pass; independent
      gentle-ai-verify pass (56 probes). Native review: medium, reliability,
      approved and acknowledged (`review-a3ee72ef232f6725`); 2 advisory
      suggestions on `canFulfillOrder` boundary and test coverage of the
      invalid min/step branch. Documented choices: release on a CLOSED lot
      is allowed (cancelled orders); `canReserve` returns false instead of
      throwing; step anchored to `(grams − min) % step`.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm vitest run`, `pnpm build` pass.
- Prisma migration applies on a fresh local Postgres.
- Domain rules covered by behavior-first unit tests with observed RED → GREEN.

## Progress / evidence

- Branch: stacked chain (see Delivery). Pre-rebase ids in task lines map to:
  d4679ec→c640071, 7dd5300→4d7da03, 1663c54→ce8fcde, bb4e242→a643bdc,
  bf463d2→ee9c62d, c8923be→98780bd.
- T1: `d4679ec` chore: scaffold Next.js 16 app with TypeScript, ESLint and
  Vitest. Versions: next 16.3.8, react 19.2.8, typescript 5.9.3, vitest 5.0.3.
- T2: `1663c54` feat(db). Versions: prisma/@prisma/client/@prisma/adapter-pg
  7.10.0, dotenv 17.4.2, tsx 4.23.15, image postgres:17.6-alpine. Table
  `orders` (reserved word). DiscountTier→Species FK forced to RESTRICT.

## Follow-ups (non-blocking review findings, not yet scheduled)

- `src/lib/db.ts`: fail fast with a clear error when `DATABASE_URL` is unset.
- ~~Add CHECK constraints on `orders` totals~~ — done in T3b (`9a4c4fb`).
- `tax_rate` append-only is convention + seed only; consider a DB trigger
  that blocks UPDATE/DELETE.
- Integration test for migration + seed (opt-in, outside the default run).
- Add `server-only` guard to `src/lib/db.ts` when the first UI imports it.
- `grossOf`/`percentOf`: guard the intermediate product with
  `Number.isSafeInteger` (silent ±1¢ only far beyond realistic orders).
- `formatUsd`/`formatKilograms`: output depends on runtime ICU data; pin or
  test in CI on the deploy runtime.
- Pricing validation: reject `null` elements inside tier arrays explicitly.
- Storefront kg input must accept only `.` as decimal separator (domain
  enforces it from T3c on).

## Next step

Feature complete. Close: PR #3 body update + owner decides merges/next
feature.
