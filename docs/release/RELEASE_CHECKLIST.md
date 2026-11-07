# Release checklist (owner + maintainer)

## Technical (Phase 7F.1)

- [ ] `npm test`
- [ ] `npm run e2e`
- [ ] `npm run postman:offline`
- [ ] Dashboard `lint` / `typecheck` / `test` / `build`
- [ ] `npm run compose:config`
- [ ] `npm run compose:smoke`
- [ ] `npm run release:acceptance`
- [ ] `npm run privacy:history` reviewed (sanitized)
- [ ] Backup `VACUUM INTO` test green
- [ ] No real Apify Actor calls in CI
- [ ] Docs links resolve (README → SELF_HOSTING / BACKUP / SECURITY)

## Owner blockers

- [ ] `LICENSE_DECISION_REQUIRED` resolved + `LICENSE` file added
- [ ] GitHub private vulnerability reporting enabled
- [ ] Historical privacy: credentials rotated if ever real; remediation decision recorded
- [ ] Optional: repository rename
- [ ] Optional: `LIVE_HTTPS` acceptance on real domain
- [ ] Optional: controlled live Apify acceptance
- [ ] Explicit approval to create GitHub Release / tag

## Publish steps (only after approval)

1. Confirm working tree clean and `HEAD == origin/main`
2. Add `LICENSE` with chosen SPDX
3. Tag annotated release (e.g. `v0.1.0-beta.1`)
4. Publish GitHub Release notes from `RELEASE_NOTES_DRAFT.md`
5. Announce security reporting path
