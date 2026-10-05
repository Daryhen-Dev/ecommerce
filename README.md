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
- Docker (needed later for the local PostgreSQL database)

## Commands

```sh
pnpm install
pnpm dev        # start the dev server
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run
pnpm build      # production build
```

Database setup (PostgreSQL via Docker + Prisma) comes in a later task.
