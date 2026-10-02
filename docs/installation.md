# Installation

## Prérequis

- Node.js 20+
- PostgreSQL
- Compte Supabase (Auth + Storage)
- npm

## Étapes

1. Copier `.env.example` vers `.env` et renseigner les valeurs.
2. `npm install`
3. `npx prisma migrate deploy`
4. `npx prisma generate`
5. `npm run dev`

## Quality gates

```bash
npm run type-check
npm run lint
npm run test
npm run test:e2e
npm run build
```

`DRY_RUN=true` et `ENABLE_META_PUBLISHING=false` sont recommandés en local.

## Authentification

- Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Rôle applicatif : `user.app_metadata.role` ∈ `VIEWER` | `EDITOR` | `ADMIN` (contrôle serveur uniquement)
- `CRON_SECRET` : header `Authorization: Bearer <CRON_SECRET>` obligatoire pour `/api/cron/*`
- `AUTH_BYPASS=true` : uniquement hors production (tests / e2e). Ne jamais l’activer en production.
- `AUTH_BYPASS_ROLE` : rôle simulé quand le bypass est actif (défaut `ADMIN`)
- `BRANDS_IN_MEMORY=true` : repository marques en mémoire (local/tests). Mettre `false` pour Prisma/PostgreSQL.
- `TEMPLATES_IN_MEMORY=true` : métadonnées templates en mémoire. Mettre `false` pour Prisma.
- `CONTENT_DRAFTS_IN_MEMORY` / `PUBLICATIONS_IN_MEMORY` / `SOCIAL_ACCOUNTS_IN_MEMORY` : idem pour drafts, publications et comptes Meta.

## Documentation

- [architecture.md](./architecture.md)
- [deployment.md](./deployment.md)
- [security.md](./security.md)
- [create-template.md](./create-template.md)
- [meta-connection.md](./meta-connection.md)

## Templates exemple

`templates/brands/botoschool/` — `poster-service-v1` et `carousel-educational-v1` (6 slides).
