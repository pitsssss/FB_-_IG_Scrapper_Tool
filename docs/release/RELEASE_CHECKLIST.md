# Release checklist (owner + maintainer)

## Technical (Phase 7F.2)

- [x] `npm test` (169 pass)
- [x] `npm run e2e` (45 pass)
- [x] `npm run postman:offline` (495 assertions)
- [x] Dashboard `lint` / `typecheck` / `test` / `build`
- [x] `npm run compose:smoke`
- [x] `npm run release:acceptance`
- [x] `npm run browser:acceptance` (27 PASS; 2 NOT VERIFIED — JSON view, 2h idle)
- [x] `npm run privacy:history` reviewed (sanitized) — status **REVIEW_REQUIRED** for owner
- [x] Backup `VACUUM INTO` test green
- [x] No real Apify Actor calls in default CI / browser acceptance (mocked only)
- [x] Docs links resolve (README → SELF_HOSTING / BACKUP / SECURITY / release pack)
- [x] `npm audit --omit=dev` clean (dev toolchain advisories documented)

## Licensing (STEP 2B)

- [x] SPDX **Apache-2.0** selected and approved by owner
- [x] Official root `LICENSE` (unmodified Apache-2.0 text)
- [x] Root `NOTICE` **NOT_NEEDED** for current source package
- [x] Owner declaration recorded: personal project; sole owner of original code (declaration, not independent legal verification)
- [x] No invented legal name / copyright line inserted
- [x] Favicon retained as verified create-next-app MIT scaffold asset (not claimed as original brand)
- [x] Third-party inventory reviewed
- [x] `package.json` / dashboard `"license": "Apache-2.0"` with `"private": true`
- [ ] Source license merged to GitHub `main` and verified (complete in STEP 2B after merge)
- [ ] Docker image publication — **BLOCKED** until [DOCKER_THIRD_PARTY_COMPLIANCE.md](./DOCKER_THIRD_PARTY_COMPLIANCE.md) implemented/verified

## Remaining owner blockers (public beta)

- [ ] GitHub private vulnerability reporting enabled (`PRIVATE_REPORTING_NOT_VERIFIED`)
- [ ] Historical privacy: credentials rotated if ever real; residual risk acknowledged
- [ ] Optional: repository rename
- [ ] Optional: `LIVE_HTTPS` acceptance on real domain
- [ ] Optional: controlled live Apify acceptance (`REAL PROVIDER VERIFIED`)
- [ ] Explicit approval to create GitHub Release / tag

## Publish steps (only after remaining approval)

1. Confirm `main` has root `LICENSE` and Apache-2.0 metadata
2. Tag annotated release only after remaining blockers are accepted (e.g. `v0.1.0-beta.1`)
3. Publish GitHub Release notes from `RELEASE_NOTES_DRAFT.md`
4. Announce security reporting path
5. When publishing dashboard images, complete the Docker third-party checklist first
