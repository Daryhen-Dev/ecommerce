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
- Running count: 2,166 (A1+A2) + 2,783 (A3+A4) = 4,949, lockfile excluded.
  PR A-2 slice = `d5483c4..` on `feat/admin-02-operation`.

## Specs

The owner-visible contract of the last slice (A5 + A6), quoted from the task
lines below and from the acceptance criteria. Verification reports a verdict
per `S#`.

- **S5.1** — Species list page at `/admin/species`: every species with its
  price per kg, minimum, step, discount policy, VAT category, seasonal flag
  and active state, plus an edit link per row and a "create species" entry
  point.
- **S5.2** — Edit one species: price per kg, minimum order, order step,
  discount policy, VAT category and seasonal flag. The **slug is immutable**
  after creation.
- **S5.3** — Tiers editor: when the policy is `CUSTOM`, the panel edits that
  species's own tiers (threshold in kg + percent discount); tiers of a
  non-CUSTOM species are not editable.
- **S5.4** — Seasons editor for seasonal species: add and remove windows
  (start/end in Ecuador wall clock). A seasonal species without at least one
  season cannot be sold, and the panel says so.
- **S5.5** — Create a new species (slug + name + description + the rest with
  the same validation); the slug is validated on creation only.
- **S5.6** — Storefront reflection: changing the Pargo price changes the
  `/uio` card price, and adding a CUSTOM tier changes the discount the
  storefront quotes. No re-pricing of already placed orders (they keep their
  locked line data).
- **S5.7** — Every admin mutation re-validates server-side; the species rules
  (unique slug, tier range 0..10000 bps, no duplicate threshold, seasonal
  species needs a season to sell) are enforced by the same domain modules the
  storefront uses, never reimplemented in the form.
- **S6.1** — Orders section at `/admin/orders`: pick a shipment and see its
  orders newest first, with the pickup code visibly first-class.
- **S6.2** — Each order shows customer name, phone, status, the items (species,
  kg, line total) and the totals (subtotal, discount, VAT, total) as they were
  locked when the order was placed.
- **S6.3** — Manual status transitions only: mark paid and cancel. Read-only
  otherwise — no editing of items, customer data or amounts.
- **S6.4** — Status transitions are validated server-side (an illegal
  transition is refused with a Spanish message, not silently applied).
- **S6.5** — Demo orders live in `prisma/seed-demo.ts` (idempotent, `DEMO-`
  marked, relative dates) so the section and its E2E have data without a
  checkout flow.
- **S6.6** — The dashboard links to the four operational sections
  (Desembarques, Vuelos, Especies, Pedidos); the placeholder list is gone.

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
- [x] A2 — Shared admin server kit: form field parsing/validation helpers
      (kg→grams, USD→cents, datetime-local → Date in `America/Guayaquil`),
      action-result pattern, field-error rendering components; unit-tested.
      Route: delegated. Commit `256f675`. TDD RED→GREEN (50 new unit tests,
      305 total); lint/typecheck/build/test:e2e pass; independent
      gentle-ai-verify PASS (datetime cross-day probes, money boundaries,
      admin-auth diff strictly additive). Native review: **unavailable** —
      same persistent `schema-incompatible` failure on review.start for both
      commits of this slice; RDD-off fallback applied (independent verifier
      ran). 1,129 authored lines (487 tests).
      Choices: labels are nouns without article ("El peso mínimo es…");
      select is case-sensitive after trim; extra exported message constants
      reused by A3+ forms.
- [x] A3 — Lots: list + create + close (+ cancel-with-warning deferred),
      species selector, validation vs rules, reflects on storefront
      immediately (catalog availability). E2E: create a lot, see new
      availability on `/uio`, close it and see it disappear. Route:
      delegated. Part of commit `d5483c4`. TDD RED→GREEN (21 tests);
      live-flow verified (90 → 97.345 → 90 kg on /uio).
- [x] A4 — Shipments: list per airport + create + close; validates window
      invariants and previews pickup window; catalog picks it up. E2E:
      created flight appears; invalid window / past cutoff errors. Route:
      delegated. Part of commit `d5483c4`. TDD RED→GREEN (19 tests).
      A3+A4 together: 345 unit + 50 E2E (run twice, re-run safe);
      independent gentle-ai-verify PASS (server authority, reservedGrams
      never writable, close semantics, live UI flow). Native review:
      **unavailable** (same `schema-incompatible` outage); RDD-off fallback
      applied. 2,783 authored lines.
      Choices: no confirm dialog on Cerrar (idempotent, guarded);
      per-airport grouping on shipments list; duplicate-day warning instead
      of hard constraint; cancel-with-warning deferred (no schema field);
      domain invariant messages still English after the Spanish preamble.
- [x] A5 — Species: list + edit (price, min, step, policy, vat category,
      seasonal flag) + tiers editor for CUSTOM policy + seasons editor for
      seasonal species; slug immutable after creation; create new species.
      E2E: change Pargo price and see it on `/uio`; add a tier and see the
      storefront card update. Route: **inline** (the writer runtime refused a
      task id outside its `T<n>` contract; see Log L3).
      TDD RED→GREEN: `src/lib/admin-species.ts` (36 tests) plus 10 new cases in
      `src/lib/admin-fields.test.ts`. Pure module holds the parsers, the tier
      and policy coupling and the form prefill; `src/server/admin-species.ts`
      holds the two consistency transactions; pages/actions follow the A3/A4
      layering. The slug is immutable *structurally*: `parseSpeciesEditForm`
      never reads one.
      Reuse instead of duplication: `validateTierSet` (`domain/pricing.ts`) and
      `validateSeasonWindow` (`domain/season.ts`) became exports, so the panel
      enforces the same range/duplicate/ordering rules the quote engine and the
      storefront enforce. `parseKgField` gained `allowZero` (a real 0 kg tier
      threshold) and `parsePercentField` is new; both tested.
      Choices: the create form carries the tier editor so a CUSTOM species is
      never stored without tiers (the quote engine would refuse it) — one
      transaction; a seasonal species may be saved with zero windows (a real
      "not on sale yet" state, warned on the page); non-CUSTOM policies drop
      their stale tier rows instead of leaving dead data; select labels use
      masculine nouns ("tipo de descuento/IVA") because the shared select
      message hardcodes "el".
      E2E `e2e/admin-species.spec.ts` (6, all mutations restored in-test):
      list + axe, price change reflected on `/uio`, CUSTOM tier reflected on the
      card, CUSTOM-without-tiers refused server-side, inverted season window
      refused + valid one added/removed, creation (invalid slug, success).
      Residue: the panel never deletes a species, so the create test leaves an
      `e2e-species-*` row; `seed-demo` now purges those rows guarded by
      `lots: none, orderItems: none`.
- [x] A6 — Orders: per-shipment order list (items, totals, status) with
      manual status transitions (mark paid/cancelled) and pickup-code
      column; read-only except status. E2E: seed an order via the storefront
      demo flow? (No — order creation needs checkout; seed demo orders in
      `seed-demo.ts` instead.) Route: **delegated** to `gentle-ai-worker`
      (context backstop).
      RED first: `src/lib/admin-orders.test.ts` was written as the contract
      (`canTransition`, `transitionFormError`, `paidAtForTransition`,
      `orderStatusLabel`); the worker observed RED (module missing) and then
      GREEN, adding 7 cases of its own (15 total).
      Rules: `PENDING_PAYMENT → PAID | CANCELLED`, repeating the current status
      is a no-op that writes nothing, everything else refused with one Spanish
      sentence. A PAID order is deliberately NOT cancellable from the panel
      (refunds are a business flow, not a status click).
      Guards: every action calls `assertAdminSessionOrRedirect()` first, both
      statuses are re-validated server-side, and the write is a CAS on the
      status the page rendered (`updateMany({ id, status: expected })`), so a
      stale tab cannot flip an order twice. `paidAt` only ever comes from
      `paidAtForTransition`.
      Demo data: three `DEMO-ORDER-*` orders on `DEMO-UIO-1` (pending / paid /
      cancelled) priced by the real `priceOrder` with the DB tiers and the
      STANDARD rate in force, delete-then-recreate inside the seed transaction
      (place BEFORE the lot delete: `order_item → lot` is Restrict), and no
      lot's `reservedGrams` touched.
      E2E `e2e/admin-orders.spec.ts` (5): list + totals, selector, mark paid,
      cancel, and an illegal transition refused by the server through a stale
      tab. Each test re-seeds the demo rows.
      Decision recorded: the order lifecycle lives in `src/lib/admin-orders.ts`
      for now; `src/domain/order.ts` is its home once checkout exists.

## Acceptance criteria

- The cooperative can, from the panel: register a landing, schedule a flight,
  adjust a price, and see orders for a flight — with the storefront reflecting
  every change immediately.
- All admin mutations validated server-side; auth protects everything under
  `/admin`.
- lint/typecheck/test/build/test:e2e pass; 0 serious/critical axe in the panel
  too.

## Progress / evidence

- A5 + A6 branch: `feat/admin-03-species-orders` from `ba22753`.
- Suite runs one file at a time now (`workers: 1` in `playwright.config.ts`):
  A5 mutates Pargo's price/tiers on purpose and A6 re-seeds the demo rows, so
  parallel files failed each other (a re-seed deleted a flight a shipments test
  was closing; a cart read a tier set mid-edit). `fullyParallel: false` only
  serialized tests *inside* a file.
- A5+A6 gate: 403 unit (Vitest), 61 E2E (Playwright, serial), lint, typecheck
  and build clean; every mutation-restoring spec re-run safe.
- Branch: `feat/admin-01-foundation` from `7b74806`.

## Follow-ups

- Migrate `src/middleware.ts` to the `proxy` convention (Next 16 deprecation).
- Unit tests for `safeRedirectPath` (open-redirect guard, currently code+
  E2E only).
- `safeRedirectPath` has no unit test yet; add with A2's test kit.

- ~~Unit tests for `safeRedirectPath`~~ — partial: login redirect covered
  via E2E + code review; parser-level tests still pending.
- Native review outage: `review.start` fails with `schema-incompatible` for
  every committed candidate since A1 (diagnostics identical each time, no
  lineage created). Blocked until the harness recovers; retry per PR slice.

- seed-demo cleanup: add an `E2E-` branch (notes / flightNumber prefixes)
  so repeated E2E runs don't accumulate rows.
- Spanish-ize the domain window invariant messages surfaced in forms.
- ~~Wire Desembarques/Vuelos into the admin nav~~ — done with A6 (S6.6): the
  dashboard links all four sections and `e2e/admin-auth.spec.ts` asserts the
  four hrefs.
- `e2e/admin-orders.spec.ts` runs `pnpm db:seed:demo` in `beforeEach`. It is
  safe while the suite is serial and the seed only deletes `DEMO-` rows, but a
  future parallel-suite change must revisit that call.
- `?shipment=<unknown id>` falls back to the default flight; implemented and
  documented but not asserted.
- A PAID order cannot be cancelled from the panel on purpose. Refunds have no
  flow yet: they need a decision (who refunds, how it is recorded) before a
  `PAID → CANCELLED` transition exists.
- Order cancellation does NOT release stock, by design: nothing reserves stock
  yet (no checkout), so releasing here would decrement reservations these
  orders never took. The release belongs with checkout.
- The order lifecycle rule set lives in `src/lib/admin-orders.ts`; move it to a
  `src/domain/order.ts` when checkout needs the same transitions.

## Next step

Admin panel complete (A1–A6). Next feature needs the owner's call: checkout +
payment gateway (Payphone or Kushki, still undecided) with stock reservation —
the only place `reservedGrams` may increase, and the natural home of
`src/domain/order.ts` and of the reservation release on cancellation.

## Log

- **L1** (owner, verbatim): "arranca con a5/a6, si necesitas levantas seridor y
  usas ego-browser"
- **L2** (owner, earlier this feature, verbatim): "seguimos con el panel"
- **L3** (decision, parent, this slice): A5 and A6 are independent units of
  behavior but NOT independent in the verification environment — Playwright
  runs one production server on port 3100 and `seed-demo` delete-then-recreates
  demo rows, so two concurrent writers would race the same server and the same
  database. They are delegated sequentially instead of launched together; the
  reasoning is recorded here rather than silently serializing independent work.
- **L4** (observation, parent, this slice): `fullyParallel: false` serialized
  tests inside a file, but Playwright still ran FILES in parallel. With A5
  mutating Pargo's price/tiers on purpose and A6 re-seeding the demo rows, three
  specs failed on each other's state (a re-seed deleted a `DEMO-` flight a
  shipments test was closing; the cart read a 9% tier mid-edit; the created
  `e2e-species-*` row was purged by a concurrent seed). Fixed with
  `workers: 1`; the failures were reproduced, not assumed.
- **L5** (defect, parent, this slice): the "created" URL assertion used
  `new RegExp("...\?created=1$")` inside a template literal — `\?` collapses to
  `?`, which in a regex makes the previous character optional, so the assertion
  could never match. Replaced with a predicate on `pathname` +
  `searchParams.get("created")`. The redirect itself was always correct.

## Live QA (A5 + A6, ego-browser)

Walked the panel in a real Chromium against `pnpm dev` on :3000, logged in
through the form, with the demo data as the cooperative would see it:

- Dashboard: no "Próximamente" left; the four sections are links to
  `/admin/lots`, `/admin/shipments`, `/admin/species`, `/admin/orders`.
- `/admin/species`: six rows with price, minimum, step, policy ("Tramos
  propios"), VAT ("IVA estándar") and season ("1 temporada"); Langosta shows
  "Sin descuento".
- `/admin/species/snapper`: slug rendered read-only in a grey box with "El slug
  no se puede cambiar: la tienda y los pedidos ya lo usan"; tiers prefilled
  0/0, 3/3, 8/8 with "Quitar tramo 1..3" and "Agregar tramo".
- Price edit: set 12.75 → banner "Cambios guardados." → `/uio` immediately
  showed "Pargo … $12.75 / kg · Pedido mínimo 1 kg · en pasos de 0.5 kg · Desde
  3 kg en tu pedido: 3% · Desde 8 kg en tu pedido: 8%". Restored to 12 in the
  same session (S5.6 verified end to end).
- `/admin/orders`: defaults to DEMO-UIO-1 ("Quito (UIO) · sale el viernes 30 de
  octubre, 08:00 · 3 pedidos"); each card leads with "CÓDIGO DE RETIRO"
  DEMO-ORDER-…, then status badge, dates, customer grid and the items table with
  Especie / Kilos / Precio por kilo / Total de la línea, and the locked totals.
- Transition: "Marcar pagado" on DEMO-ORDER-PENDING → badge flips to "Pagado",
  the buttons disappear, the cancelled order stays read-only (no actions).
- Unauthenticated check (prod server, no cookie): `/admin/orders`,
  `/admin/species` and `/admin/species/snapper` all answer 307 to
  `/admin/login?next=…` and the denied body contains no customer data
  (0 matches for the demo phone/name/cédula).

Observations not fixed here (out of this slice):
- The orders flight selector lists the `E2E-TEST-*` flights that the shipments
  spec leaves behind; the existing `E2E-` cleanup follow-up now matters for a
  second section.
- Next 16 writes `AGENTS.md` and `CLAUDE.md` into the project root on build/dev.
  They are not in `.gitignore`; the generated copies from this session were
  deleted and nothing was committed. Adding them to `.gitignore` is a
  repository decision, not this feature's.
- Screenshots taken through ego-browser render bold text washed out; axe reports
  no serious/critical violation on the same pages, so it is a capture artifact,
  not a contrast defect.

Risk: none.
