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

## Owner blockers

- [ ] `LICENSE_DECISION_REQUIRED` resolved + `LICENSE` file added
- [ ] GitHub private vulnerability reporting enabled (`PRIVATE_REPORTING_NOT_VERIFIED` until confirmed)
- [ ] Historical privacy: credentials rotated if ever real; remediation decision recorded
- [ ] Optional: repository rename
- [ ] Optional: `LIVE_HTTPS` acceptance on real domain
- [ ] Optional: controlled live Apify acceptance (`REAL PROVIDER VERIFIED`)
- [ ] Explicit approval to create GitHub Release / tag

## Publish steps (only after approval)

1. Confirm working tree clean and `HEAD == origin/main`
2. Add `LICENSE` with chosen SPDX
3. Tag annotated release (e.g. `v0.1.0-beta.1`)
4. Publish GitHub Release notes from `RELEASE_NOTES_DRAFT.md`
5. Announce security reporting path
