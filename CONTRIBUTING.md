# Contributing

Internal development guide for the DONICY GST Billing monorepo.

## Setup
See the [README Quick start](README.md#quick-start). TL;DR:
```bash
npm install
cp .env.example .env && cp .env apps/backend/.env   # fill DATABASE_URL, JWT_SECRET
npm run prisma:generate && npm run prisma:migrate
npm --workspace apps/backend run prisma:rls
npm --workspace apps/backend run seed
npm run dev:backend   # :4000
npm run dev:web       # :5173
```

## Workflow
- Branch off `main`: `feat/<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`.
- Keep commits focused; write imperative messages (e.g. "Add GSTR-3B JSON builder").
- Open a PR into `main`; ensure typecheck + build pass.

## Conventions
- **TypeScript everywhere**; match the style of surrounding code.
- **Backend**: one NestJS module per domain (`src/modules/<name>/`) with
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, and DTOs under `dto/`.
  Tenant-scoped queries **must** go through `PrismaService.withTenant(tenantId, …)`.
- **Frontend**: pages in `src/pages/`, reusable UI in `src/components/`, all API
  calls through `src/lib/api.ts`; use design tokens from `src/styles/tokens.css`
  (never hardcode brand colors).
- **DB**: change `schema.prisma` → `npm run prisma:migrate --name <change>`. If a new
  table is tenant-scoped, add it to `prisma/rls/policies.sql`.

## Checks before pushing
```bash
npm --workspace apps/web run build        # tsc -b + vite build
npx --workspace apps/backend tsc --noEmit # backend typecheck
npm --workspace apps/backend test         # unit tests (GST engine, …)
```

## Don't commit
- `.env` / real credentials, `node_modules/`, build artifacts (`dist/`, `*.tsbuildinfo`),
  large design binaries (`design/*.pdf`, `design/*.fig`) — all gitignored.
