# Security

## Secrets

- Never expose tokens, API keys, or `ENCRYPTION_KEY` to the client.
- Meta page/IG tokens are stored encrypted (`accessTokenEnc`) via AES-256-GCM.
- `GET /api/social-accounts` returns public fields only (no ciphertext, no plaintext token).
- Logs go through `sanitizeForLogs` (Authorization, cookies, tokens, `access_token=`, `client_secret`, api keys).

## AuthZ

- Roles: `VIEWER` | `EDITOR` | `ADMIN` from `user.app_metadata.role` (server-side only).
- Cron routes require `Authorization: Bearer <CRON_SECRET>` (signed internal calls).
- Social account registration: ADMIN only.
- Metrics: ADMIN only.

## CSRF

- Double-submit cookie `sta_csrf` + header `x-csrf-token` (Edge-safe Web Crypto).
- Issue token via `GET /api/csrf`.
- Mutating `/api/*` requests are rejected with `CSRF_REJECTED` when mismatch (skipped under `AUTH_BYPASS` / e2e).

## OAuth state

- `createOAuthState` / `validateOAuthState` (HMAC) for OAuth redirects (Meta/Supabase).

## Rate limiting

- In-process limiter on `/api/*` (default 120 req/min/IP). Returns `429 RATE_LIMITED`.

## SSRF / URL validation

- `assertPublicHttpUrl` blocks localhost, private IPv4, link-local, metadata hosts, non-http(s).
- Applied in DryRun and Graph media upload paths.

## MIME / file size

- ImageCrop validates magic-byte MIME (`png`/`jpeg`/`webp`), forbids SVG, max **15 MB**.

## Auth bypass

`AUTH_BYPASS=true` is for local/e2e only. Forbidden in production.

## Publishing safety

- Vitest / `NODE_ENV=test` hard-disables real Meta publishing.
- Real Graph path requires `ENABLE_META_PUBLISHING=true` (or alias) **and** `DRY_RUN=false`.
- Idempotency keys prevent duplicate Meta posts on scheduler retries.

## Input validation

All external inputs validated with Zod (`.strict()` where applicable), including `publishRequestSchema` and social-account create body.
