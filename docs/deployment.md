# Deployment

## Prerequisites

- Node.js 20+
- PostgreSQL
- Supabase project (Auth + Storage)
- Meta app (only if enabling real publishing)

## Steps

1. Set production env from `.env.example` (never commit secrets).
2. `npx prisma migrate deploy`
3. `npx prisma generate`
4. `npm run build && npm run start` (or deploy to Vercel).

## Cron

Call periodically:

```http
POST /api/cron/publish
Authorization: Bearer <CRON_SECRET>
```

Example: platform cron, Vercel Cron, or n8n (`docs/n8n-publish-poller.json`) — always send `CRON_SECRET`.

Recommended interval: every 1 minute.

## Feature flags (production)

| Variable | Safe default | Notes |
|----------|--------------|-------|
| `DRY_RUN` | `true` until Meta validated | Must be `false` for real posts |
| `ENABLE_META_PUBLISHING` | `false` | Preferred flag |
| `META_PUBLISH_ENABLED` | `false` | Alias |
| `AUTH_BYPASS` | `false` | **Never** true in production |
| `*_IN_MEMORY` | `false` in production | Use Prisma |

## Health / metrics

- `GET /api/health` — liveness + dry-run / meta flag
- `GET /api/metrics` — ADMIN only — in-process counters/timings
