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
pnpm db:seed          # seed airports and placeholder discount tiers
pnpm db:studio        # browse data with Prisma Studio
```

`.env.example` documents the expected environment variables. The generated
Prisma client lives in `src/generated/` (gitignored) and is built by the
`postinstall` script.
