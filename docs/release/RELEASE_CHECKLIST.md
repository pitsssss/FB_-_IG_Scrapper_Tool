# Release checklist (owner + maintainer)

## Technical (Phase 7F.2)

- [x] `npm test` (unit suite; includes privacy classification regressions after STEP 3C)
- [x] `npm run e2e` (45 pass)
- [x] `npm run postman:offline` (495 assertions)
- [x] Dashboard `lint` / `typecheck` / `test` / `build`
- [x] `npm run compose:smoke`
- [x] `npm run release:acceptance`
- [x] `npm run browser:acceptance` (27 PASS; 2 NOT VERIFIED — JSON view, 2h idle)
- [x] `npm run privacy:history` — STEP 3C classification; expect **PASS** when only synthetic hits remain
- [x] Backup `VACUUM INTO` test green
- [x] No real Apify Actor calls in default CI / browser acceptance (mocked only)
- [x] Docs links resolve (README → SELF_HOSTING / BACKUP / SECURITY / release pack)
- [x] `npm audit --omit=dev` clean (dev toolchain advisories documented)
- [x] GitHub CI recovered and green on licensed `main`

## Licensing (STEP 2B)

- [x] SPDX **Apache-2.0** selected and approved by owner
- [x] Official root `LICENSE` (unmodified Apache-2.0 text)
- [x] Root `NOTICE` **NOT_NEEDED** for current source package
- [x] Owner declaration recorded: personal project; sole owner of original code (declaration, not independent legal verification)
- [x] No invented legal name / copyright line inserted
- [x] Favicon retained as verified create-next-app MIT scaffold asset (not claimed as original brand)
- [x] Third-party inventory reviewed
- [x] `package.json` / dashboard `"license": "Apache-2.0"` with `"private": true`
- [x] Source license merged to GitHub `main` and verified (GitHub detects Apache-2.0)
- [ ] Docker image publication — **BLOCKED** until [DOCKER_THIRD_PARTY_COMPLIANCE.md](./DOCKER_THIRD_PARTY_COMPLIANCE.md) implemented/verified

## Security reporting (STEP 3A)

- [x] Private vulnerability reporting **enabled**
- [x] `SECURITY.md` documents Advisories → Report a vulnerability
- [ ] Owner confirms GitHub notification settings (`OWNER_NOTIFICATION_PENDING`)

## Historical privacy (STEP 3B / 3C)

- [x] History rewrite completed; clean development clone in use
- [x] Six-target ordinary-history cleanup: **PRIOR_REWRITE_VERIFIED**; **CURRENT_EXACT_RESCAN_UNVERIFIED** (no private denylist in clean clone)
- [x] Owner credential declaration recorded (local `.env` kept private / not knowingly shared) — not a forensic guarantee
- [x] No rotation evidenced; `DATA_ENCRYPTION_KEY` unchanged
- [x] Privacy scanner targeted false-positive classification + regression tests (STEP 3C)
- [ ] Owner **explicitly accepts** residual GitHub PR-ref / cached-commit risk (`#1–#7`) **or** pursues Support using [GITHUB_SUPPORT_HISTORY_PURGE_DRAFT.md](./GITHUB_SUPPORT_HISTORY_PURGE_DRAFT.md)
- [ ] Optional hygiene: review open Dependabot PRs `#8–#11` (post-rewrite dependency bumps)

## Remaining owner blockers (public source-only beta)

- [ ] Residual historical PR/cache risk accepted **or** Support outcome recorded
- [ ] Owner notification preferences confirmed
- [ ] Optional: repository rename
- [ ] Optional: `LIVE_HTTPS` acceptance on real domain
- [ ] Optional: controlled live Apify acceptance (`REAL PROVIDER VERIFIED`)
- [ ] Explicit approval to create GitHub Release / tag

## Docker image distribution (separate from source-only beta)

- [ ] Dashboard Docker LGPL distribution compliance before image publication

## Publish steps (only after remaining approval)

1. Confirm `main` has root `LICENSE` and Apache-2.0 metadata
2. Tag annotated release only after remaining blockers are accepted (e.g. `v0.1.0-beta.1`)
3. Publish GitHub Release notes from `RELEASE_NOTES_DRAFT.md`
4. Announce security reporting path
5. When publishing dashboard images, complete the Docker third-party checklist first
