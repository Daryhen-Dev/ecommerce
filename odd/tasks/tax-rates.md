# Feature: tax-rates

The cooperative sets the IVA percentages from the panel instead of SQL: the
standard rate (15% today) and the zero rate (0%), each with the date it starts
to apply, and the storefront quotes new orders with the rate in force.

## Specs

- **S1** — "El IVA es del 15%": the `STANDARD` category is at 1500 basis points
  (15%) and `ZERO_RATED` at 0, as the seed already has them.
- **S2** — "hay que dejarlo para que sea editable para el admin": an admin
  registers a rate change from `/admin/tax` with the date it starts to apply;
  no code change and no SQL are needed to move the rate.
- **S3** — The history is append-only, as `tax_rate` is designed: the panel adds
  rows and never edits or deletes them, so an order quoted months ago keeps the
  rate it was charged.
- **S4** — The rate in force for a category at instant T is the row with the
  greatest `effectiveFrom <= T`, resolved by `resolveVatRates` from
  `src/domain/tax.ts` (the same function the cart quote uses). The panel never
  reimplements that selection.
- **S5** — Server-side validation of a new rate: a valid percentage between 0
  and 100 with `.` decimals, a required effective date, no duplicate
  `(category, effectiveFrom)`, and the new date must be **strictly later** than
  the latest row of that category. Backdating is refused: a rate inserted in the
  past would not be the rate the panel shows as current, and the append-only
  table has no way to retract it.
- **S6** — New orders quote with the rate in force: changing the `STANDARD` rate
  changes the IVA of the next cart quote, while orders already placed keep their
  locked `vatRateBps`.
- **S7** — The panel shows, per category, the rate in force with its date, and
  the full history; a rate dated in the future is labelled as scheduled and the
  page states that the current rate still applies.

## Decisions

- Route `/admin/tax` ("IVA") plus a fifth card on the dashboard. The A1 ruling
  that "tax rate configuration is out of this version" is superseded by S2.
- Backdating forbidden (S5): with an append-only table a past row cannot be
  retracted, and the panel would show a "current" rate the operator did not
  intend. A correction is a new row from now on.
- `ZERO_RATED` stays editable too: the 0% is a tax decision (fresh fish may be
  0%), not a constant, and the accountant's confirmation lands as a row.
- The panel never writes `TaxRate.note` from free text longer than 200 chars;
  it is the audit line of the change.

## Checks

TDD enabled. Runner `pnpm vitest run`; E2E `pnpm playwright test` (serial, one
file at a time — see `playwright.config.ts`). Per task: `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.

## Tasks

- [ ] **T1** — Pure admin logic `src/lib/admin-tax.ts` + tests (RED first): form
  parser (category select, percentage, Ecuador `datetime-local`, optional note),
  the append-only date rule, the duplicate-date rule, Spanish messages, labels
  and the "rate in force vs scheduled" summary helper. Route: delegated.
  Spec: S4, S5.
- [ ] **T2** — Server layer `src/server/admin-tax.ts` (history per category,
  latest row per category, insert), `/admin/tax` page with the in-force table,
  the history table and the register form, the Server Action, and the fifth
  dashboard card. Updates `e2e/admin-auth.spec.ts` for the new link.
  Route: delegated. Spec: S2, S3, S7.
- [ ] **T3** — `e2e/admin-tax.spec.ts`: the in-force rate is 15% with its date;
  a backdated rate and a duplicate date are refused with the Spanish messages; a
  future-dated rate is stored and labelled scheduled while the in-force rate
  stays 15%; the storefront cart still quotes 15% (proving the quote reads the
  table, not a constant); axe on the page. `prisma/seed-demo.ts` purges the
  `E2E-tax-` rows so reruns are clean. Route: delegated. Spec: S1, S5, S6, S7.
- [ ] **T4** — Docs: record evidence, the decision trail and the follow-ups
  (accountant confirmation of the 15%, and what a future-dated rate does to a
  cart that is already open). Route: parent. Spec: all.

## Acceptance criteria

- The admin moves the IVA from 15% to another value, dated, without touching
  code; the next cart quote uses it; an order quoted before keeps its rate.
- Nothing in the panel can edit or delete a historical rate row.
- lint/typecheck/test/build/test:e2e pass; 0 serious/critical axe on the page.

## Log

- **L1** (owner, verbatim): "demosle merge en orden. Vamos con el siguiente
  feature. El IVA es del 15% pero hay que dejarlo para que sea editable para el
  admin. Lo que genera next 16 pongo en el .gitignore"
- **L2** (parent): the 9 stacked PRs were merged into `main` in order before
  this feature started; `main` was verified green there (403 unit, lint,
  typecheck) before branching.
