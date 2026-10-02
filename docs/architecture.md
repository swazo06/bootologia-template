# Architecture

## Principle

The AI **fills** locked SVG canvases. It never creates layouts, fonts, colors, or free positioning.

Visual output comes only from immutable SVG templates + `config.json` under `templates/brands/*`.

Allowed dynamic fields: `label`, `headline`, `subtitle`, `body`, `cta`, `mainImage`, `caption`, `hashtags`, `altText`.

## Layers

```
src/app              # Next.js routes (UI + API)
src/features         # Domain use-cases (generation, designs, publishing, review)
src/providers        # Replaceable adapters (Meta, storage, scheduler, AI)
src/server           # Repositories + application services
src/lib              # Auth, validation, logging, metrics, encryption
templates/brands     # Immutable SVG + config (source of truth for visuals)
```

## Key flows

### Design pipeline

Brief → ContentGenerator → ContentValidator → TextFit → ImageCrop → TemplateRenderer → ImageExport → Storage → Preview.

Each step writes a JobLog (`provider=design-pipeline`) with `correlationId` and `durationMs`.

### Publish pipeline

Schedule → Publication (UTC) → Cron `POST /api/cron/publish` → SocialPostScheduler → `publishScheduledPost` → `MetaPublisher` → persist `externalPostId` / `externalPostUrl`.

### MetaPublisher

- Interface: `MetaPublisher`
- `DryRunMetaPublisher` — zero HTTP, deterministic fake IDs
- `GraphApiMetaPublisher` — Graph HTTP behind `ENABLE_META_PUBLISHING` + `DRY_RUN=false` (hard-off in Vitest)
- Factory: `createMetaPublisher()`

## Data

PostgreSQL via Prisma: Brand, Template, ContentDraft, ContentSlide, Publication, SocialAccount, JobLog.

In-memory repositories available for local/tests via `*_IN_MEMORY` flags.
