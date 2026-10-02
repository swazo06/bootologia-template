# Production readiness report

Date: 2026-08-10  
Project: Social Template Automation  
Scope: Phases 1–18 + residual close-out (gates green)

## Implemented features

- Locked SVG template registry + validation (BotoSchool poster + 6-slide carousel)
- Content generation (mock AI), QA, TextFit, ImageCrop, TemplateRenderer, Sharp export
- Design pipeline with resume/idempotency and JobLogs
- Review / approve / reject workflow
- UTC scheduler with SKIP LOCKED, retries +1/+5/+15, non-retryable Meta errors
- MetaPublisher: DryRun + GraphApi (Facebook photo/feed, IG media + poll) behind feature flags
- SocialAccount store (AES-GCM tokens) + ADMIN API + `/integrations/meta` UI
- OAuth start/callback with HMAC state (demo path without `META_APP_ID`)
- Observability: JobLog `correlationId` / `durationMs`, sanitize logs, in-process metrics
- Docs: installation, architecture, deployment, security, create-template, meta-connection
- Playwright smoke + full business journey + Meta UI connect
- Next.js 16 `src/proxy.ts` (replaces deprecated middleware)

## Architecture summary

Clean layering: `app` → `features` → `providers` / `server` repositories.  
Core rule preserved: AI fills placeholders only; SVG templates immutable.  
Meta publishing is interface-driven (`MetaPublisher`) with DI via factory + optional publisher injection.  
Real Graph HTTP is hard-disabled under Vitest and gated by `ENABLE_META_PUBLISHING` + `DRY_RUN=false`.

## Test statistics

| Suite | Result |
|-------|--------|
| Vitest unit/integration | **167** passed / 29 files |
| Playwright e2e | **10** passed |
| type-check / lint / build | green |

## Quality gates

```
npm run type-check  ✔
npm run lint        ✔
npm run test        ✔
npm run test:e2e    ✔
npm run build       ✔
```

## Remaining technical debt

- `metaPublisher` deprecated facade wraps factory (prefer `createMetaPublisher()`)
- In-memory metrics are process-local (not multi-instance / Prometheus)
- No Prisma integration tests against a live Postgres in CI (memory repos dominate)
- Live Meta Graph token exchange still gated (`TOKEN_EXCHANGE_NOT_CONFIGURED` until wired)

## Remaining TODOs (product)

- Wire real Meta code→token exchange when `META_APP_ID` / `META_APP_SECRET` are set
- OpenTelemetry / Datadog export
- Vercel Cron config in-repo (`vercel.json`) if deploying on Vercel
- Meta webhook deauthorize

## Security review

- Tokens encrypted at rest; never returned by social-account API
- Graph client sends Bearer header; logs sanitize Authorization / access_token / cookies / secrets
- Cron protected by `CRON_SECRET`
- CSRF + rate limit enforced in `proxy`
- `AUTH_BYPASS` documented as non-production
- Zod `.strict()` on publish + social-account payloads
- Real Meta hard-off in tests

## Performance review

- Scheduler claims with `FOR UPDATE SKIP LOCKED` (Prisma path)
- Graph timeouts configurable (`META_GRAPH_TIMEOUT_MS`)
- Pipeline/storage/publish timings recorded in metrics registry
- Risk: IG polling is sequential; large carousels increase publish latency

## Production readiness score: **96 / 100**

Ready for a controlled DRY_RUN pilot. Remaining gap is primarily live Meta token exchange + multi-instance observability.

## Risks before deployment

1. Enabling Meta without validated long-lived tokens → permanent failures / account disconnect
2. Leaving `*_IN_MEMORY=true` in production → data loss
3. Leaving `AUTH_BYPASS=true` → auth bypass
4. Multi-instance metrics incomplete for SLOs
5. Prisma migrate must be applied (`20260810000000_social_account_joblog`)

## Recommended future improvements

1. Complete Meta token exchange + webhook deauthorize
2. Export metrics to OTel/Prometheus
3. Contract tests against Meta Graph sandbox
4. CI job against real Postgres
