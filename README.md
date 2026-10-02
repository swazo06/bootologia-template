# Social Template Automation

Application Next.js pour générer, valider, programmer et publier des contenus Facebook / Instagram **uniquement** à partir de templates SVG verrouillés.

> L'IA remplit le canevas. Elle ne crée jamais le canevas.

## Stack

- Next.js App Router + TypeScript strict
- Tailwind CSS + shadcn/ui
- PostgreSQL + Prisma 6
- Supabase Auth / Storage
- Zod, Sharp, Vitest, Playwright
- Meta Graph API (`DryRunMetaPublisher` + feature-flagged `GraphApiMetaPublisher`)

## Quick start

See [docs/installation.md](docs/installation.md). More: [architecture](docs/architecture.md), [deployment](docs/deployment.md), [security](docs/security.md), [meta](docs/meta-connection.md).

```bash
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

## Quality gates

```bash
npm run type-check
npm run lint
npm run test
npm run test:e2e
npm run build
```
