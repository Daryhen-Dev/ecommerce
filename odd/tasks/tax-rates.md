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

- [x] **T1** — Pure admin logic `src/lib/admin-tax.ts` + tests (RED first): form
  parser (category select, percentage, Ecuador `datetime-local`, optional note),
  the append-only date rule, the duplicate-date rule, Spanish messages, labels
  and the "rate in force vs scheduled" summary helper. Route: delegated.
  Spec: S4, S5. Commit `c114e47`. RED first (module missing), then GREEN with
  28 tests. Choices: the bps always come from `resolveVatRates` and the local
  scan only identifies which stored row it resolved, so its date can be printed
  (S4 asked for exactly that split); duplicate is reported before backdated,
  because the same date violates both and the unique constraint is the one the
  operator can see in the history; the note label is "texto de la nota" so the
  shared parser's "El {label}" sentence stays grammatical.
- [x] **T2** — Server layer `src/server/admin-tax.ts` (history per category,
  latest row per category, insert), `/admin/tax` page with the in-force table,
  the history table and the register form, the Server Action, and the fifth
  dashboard card. Updates `e2e/admin-auth.spec.ts` for the new link.
  Route: delegated. Spec: S2, S3, S7. Commit `b05c812`.
- [x] **T3** — `e2e/admin-tax.spec.ts`: the in-force rate is 15% with its date;
  a backdated rate and a duplicate date are refused with the Spanish messages; a
  future-dated rate is stored and labelled scheduled while the in-force rate
  stays 15%; the storefront cart still quotes 15% (proving the quote reads the
  table, not a constant); axe on the page. `prisma/seed-demo.ts` purges the
  `E2E-tax-` rows so reruns are clean. Route: delegated. Spec: S1, S5, S6, S7.
  Commit `3279e96`. The spec writes only a future-dated rate: a rate in force
  other than 15% would break the storefront specs that assert `VAT_BPS = 1500`
  (`e2e/support/demo.ts`).
- [x] **T4** — Docs: record evidence, the decision trail and the follow-ups
  (accountant confirmation of the 15%, and what a future-dated rate does to a
  cart that is already open). Route: parent. Spec: all. This commit.

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

## Evidence

- Gate: **431 unit** (28 new, TDD) + **65 E2E** (4 new), `pnpm lint`,
  `pnpm typecheck` and `pnpm build` clean. Route `/admin/tax` is in the build.
- Axe: 0 serious/critical on the page with and without a scheduled rate.

### Live QA (production build, ego-browser)

The one property the E2E can only prove indirectly is S6 — a live rate change
moving the quote. Proven by hand, in both directions, through the real form and
the real cart:

| Step | Rate in force | Cart totals |
| --- | --- | --- |
| Start | `IVA estándar 15%` (1 abr 2024) | Subtotal $22.00 · IVA **$3.30** (15%) |
| Register 16% | `IVA estándar 16%` (hoy 18:46), the 15% row becomes **Anterior** | Subtotal $44.00 · IVA **$7.04** (16%) |
| Register 15% (append) | `IVA estándar 15%` (hoy 18:47), the 16% row becomes **Anterior** | Subtotal $66.00 · IVA **$9.41** (15%) |

The history kept all three rows and nothing was edited: the restoration is a new
row, which is the whole point of append-only. The demo seed then purged the two
`E2E-tax-` rows and `tax_rate` is back to the two seeded rates.

The no-backdating rule also proved itself by accident, which is the best kind of
proof: the first attempt to register a rate dated 30 seconds ago was **refused**
because a scheduled `E2E-tax-` row 30 days ahead existed for `STANDARD`. That is
the rule working, not a bug — and it is why the seed purge matters for reruns.

### Environment notes (not code defects)

- Port 3000 on this machine is served by a different application (`authjs.csrf-token`
  cookies, not this project's admin cookie), so a `pnpm dev` started there is
  unreachable and misleading. The live QA therefore ran against a production
  build on 3105.
- `pnpm dev` and Playwright's `webServer` must not run at the same time: both
  write `.next`, and the mixed artifacts made every airport page 404. One of the
  runs also left Turbopack with a dead worker (`0xc0000142`) that only a
  `rm -rf .next` fixed.

Risk: none.
