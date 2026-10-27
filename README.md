# Pesca Artesanal Galápagos

Ecommerce for fresh artisanal fish from Galápagos, sold per kilogram with
pickup at the destination airports (Quito, Guayaquil, Cuenca). Supply is
driven by fishing landings and flights rather than fixed inventory, so pricing,
seasons, and order windows live in a pure, test-driven domain module.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- Vitest
- pnpm (Node 24)

## Prerequisites

- Node 24
- pnpm 10
- Docker (for the local PostgreSQL database)

## Commands

```sh
pnpm install
pnpm dev        # start the dev server
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run
pnpm build      # production build
```

## Database

PostgreSQL runs locally via Docker Compose (host port 5433) and is accessed
through Prisma.

```sh
cp .env.example .env  # local dev credentials (gitignored)
pnpm db:up            # start the postgres container
pnpm db:migrate       # create/apply migrations (prisma migrate dev)
pnpm db:seed          # seed airports, placeholder discount tiers and VAT rates
pnpm db:studio        # browse data with Prisma Studio
```

`.env.example` documents the expected environment variables. The generated
Prisma client lives in `src/generated/` (gitignored) and is built by the
`postinstall` script.

### Demo data (local only)

`prisma/seed-demo.ts` adds dev-only species, seasons, lots and shipments with
dates relative to "now", so the storefront always has an open flight. It
refuses to run against a non-local database or in production and only touches
rows marked `DEMO-`.

```sh
pnpm db:seed        # base seed first (airports, tiers, tax rates)
pnpm db:seed:demo   # demo species, lots and flights (idempotent)
```

## Admin panel

The cooperative operates the marketplace from `/admin`: landings (lots),
flights (shipments), species with prices and discount tiers, and the orders of
each flight. This first version ships authentication and the panel shell; the
sections are enabled as they land.

The panel uses **one shared password** for the whole cooperative, not user
accounts: a real account model arrives later with the customer accounts
feature. Logging in sets a signed, HttpOnly session cookie (`admin_session`,
12 hours); `/admin/**` is protected by middleware and by a session check in
the admin layout, so a stale or forged cookie never reaches a page.

### Environment variables

| Variable         | Required | Purpose                                                       |
| ---------------- | -------- | ------------------------------------------------------------- |
| `ADMIN_PASSWORD` | yes      | Password typed on `/admin/login`.                             |
| `AUTH_SECRET`    | yes      | Key that signs the session cookie (HMAC-SHA256).              |

Both are documented in `.env.example`. Use a long random value for
`AUTH_SECRET`, for example:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

With `AUTH_SECRET` missing the panel renders a configuration error instead of
signing sessions; with `ADMIN_PASSWORD` missing every login fails with the
usual "Contraseña incorrecta." message (the server logs the real reason).

### Using it locally

```sh
pnpm dev      # with ADMIN_PASSWORD and AUTH_SECRET in .env
```

Open <http://localhost:3000/admin>, log in with `ADMIN_PASSWORD`, and use
**Salir** to close the session. The password is single and shared for now:
changing `ADMIN_PASSWORD` only affects new logins.

## E2E tests

End-to-end tests run with Playwright (Chromium only) against a production
build of the app, using the local, demo-seeded database.

```sh
pnpm exec playwright install chromium  # one-time browser install
pnpm test:e2e                          # requires db:up + migrations + demo seed
```

The Playwright server starts on port 3100 (`pnpm start --port 3100`), so it
does not clash with a running `pnpm dev`. It receives `ADMIN_PASSWORD` and
`AUTH_SECRET` from `playwright.config.ts` (defaults: `admin-demo-password` and
`admin-demo-secret`), and the admin specs log in with those same values; export
your own variables to override both at once.
