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
- Sold **per kilogram**, decimals allowed (e.g. 7.5 kg). Customer pays the
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
- Assumption (revisit in T3): per-species exception tiers also measure the
  order's total kg; only their percentages differ.
- Assumption (verify with accountant): unprocessed fresh fish is VAT 0% in
  Ecuador; tax rate kept per species, not hardcoded.

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
  - PR 2: T3 (money/weight + volume pricing)
  - PR 3: T4 + T5 (season/shipment windows + lot reservation)
- Running count: 272 (T1) + 401 (T2) = 673, lockfile and migration SQL
  excluded. PR 1 slice = `d4679ec..1663c54` (+ docs commits).

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
- [ ] T3 — Domain: `Money` (cents) and `Weight` (grams) value objects;
      volume tier pricing (global % tiers by order total kg, per-species tier
      exceptions, locked order total). TDD. Route: delegated.
- [ ] T4 — Domain: season availability (pre-sale only inside the window) and
      shipment ordering window (cutoff before departure, per-city). TDD.
      Route: delegated.
- [ ] T5 — Domain: lot reservation (available kg per lot, no overselling,
      min/step order validation). TDD. Route: delegated.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm vitest run`, `pnpm build` pass.
- Prisma migration applies on a fresh local Postgres.
- Domain rules covered by behavior-first unit tests with observed RED → GREEN.

## Progress / evidence

- Branch: `feat/platform-foundation`.
- T1: `d4679ec` chore: scaffold Next.js 16 app with TypeScript, ESLint and
  Vitest. Versions: next 16.3.8, react 19.2.8, typescript 5.9.3, vitest 5.0.3.
- T2: `1663c54` feat(db). Versions: prisma/@prisma/client/@prisma/adapter-pg
  7.10.0, dotenv 17.4.2, tsx 4.23.15, image postgres:17.6-alpine. Table
  `orders` (reserved word). DiscountTier→Species FK forced to RESTRICT.

## Follow-ups (non-blocking review findings, not yet scheduled)

- `src/lib/db.ts`: fail fast with a clear error when `DATABASE_URL` is unset.
- Add CHECK constraints on `orders` totals (non-negative, total = subtotal −
  discount + VAT) once T3 fixes the pricing formula.
- Integration test for migration + seed (opt-in, outside the default run).
- Add `server-only` guard to `src/lib/db.ts` when the first UI imports it.

## Next step

T3 — Money/Weight + volume pricing (TDD).
