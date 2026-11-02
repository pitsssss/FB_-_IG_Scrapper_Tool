# Client integration examples

Recommended pattern: **server-to-server**. Your website backend calls fb-posts-api with a secret API key. Browsers only talk to **your** backend.

## Why frontend API keys are unsafe

Any key shipped as `NEXT_PUBLIC_*`, embedded in HTML/JS, or sent from the browser can be stolen and used to exhaust your Apify quota or read authorized pages.

## Several websites

1. Issue one `name:secret` entry per site in `API_KEYS`.
2. Optionally set `API_KEY_PAGE_SCOPES` so each site may only request its pages.
3. Keep `ALLOWED_ORIGINS` empty (or tightly restricted) if you only use server-to-server.

## Handling errors without a broken empty section

- Prefer showing the last successful payload from **your** server cache/CDN.
- If the API returns `200` with `meta.source = "stale-cache"`, render posts and optionally show a subtle “may be outdated” note.
- On `401/403/429/502`, keep the previous UI state or a friendly placeholder — do not wipe the section to blank.

## Media-only posts

`text` may be `""` while `media` / `image` are present. Always render media when present; do not require text.

## Local checks before wiring a site

1. `npm test` and `npm run e2e` in this repo.
2. Call `/health`.
3. Call posts with the site key for an allowed page → `200`.
4. Call with the same key for another site’s page → `403` (when scopes are enabled).
5. Confirm the key never appears in browser network logs.

## Security checklist (each consuming site)

- [ ] API key only in server env (never `NEXT_PUBLIC_` / public config).
- [ ] Server-side timeout on upstream calls.
- [ ] HTML escaped when rendering post text.
- [ ] External Facebook links use `rel="noopener noreferrer"` where applicable.
- [ ] No logging of API keys or Apify tokens.
- [ ] Page scopes reviewed when adding a new Facebook page.
