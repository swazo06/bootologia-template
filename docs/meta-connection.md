# Connexion Meta

## Flags

| Variable | Default | Effect |
|----------|---------|--------|
| `DRY_RUN` | `true` | DryRun path / simulated IDs |
| `ENABLE_META_PUBLISHING` | `false` | Preferred enable flag for Graph |
| `META_PUBLISH_ENABLED` | `false` | Alias of `ENABLE_META_PUBLISHING` |
| `META_GRAPH_API_VERSION` | `v21.0` | Graph version |
| `META_GRAPH_TIMEOUT_MS` | `30000` | Per-request timeout |

Real publishing runs only when `ENABLE_META_PUBLISHING=true` **and** `DRY_RUN=false`, and **never** under Vitest.

## Interface Admin

- UI : `/integrations/meta` — lister, connecter (OAuth ou token manuel), rafraîchir, supprimer.
- `POST /api/meta/oauth/start` + `GET /api/meta/oauth/callback` (state HMAC).
- `GET/POST /api/social-accounts`, `PATCH/DELETE /api/social-accounts/:id`.

## Register a social account

1. Create a Meta app; grant Page / Instagram permissions.
2. Prefer UI OAuth, or obtain a long-lived Page token manually.
3. As ADMIN, connect via UI or `POST /api/social-accounts`:

```json
{
  "platform": "FACEBOOK",
  "externalId": "<page-id>",
  "displayName": "My Page",
  "accessToken": "<page-access-token>"
}
```

Token is encrypted at rest. Responses never include the token.

4. Schedule publications with `socialAccountId` = returned account `id`.
5. Keep `DRY_RUN=true` until end-to-end validation.
6. Enable real publish: `ENABLE_META_PUBLISHING=true`, `DRY_RUN=false`.

## Providers

- `DryRunMetaPublisher` — zero HTTP; IDs `dryrun_*` / `https://dry-run.local/posts/...`
- `GraphApiMetaPublisher` — Facebook photo/feed + Instagram media containers with polling
- Errors normalized via `mapMetaError` (never raw Graph payloads in API responses)

## Future

Automatic long-lived token exchange against Graph when `META_APP_ID` / `META_APP_SECRET` are configured.
