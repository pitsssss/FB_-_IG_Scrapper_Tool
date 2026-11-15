# Public beta publication exception — external tester skip

**Decision date:** 2026-11-15
**Release candidate:** `v0.1.0-beta.1`
**Source commit (preflight base):** `c7b0ac545da9b7a365e49a598b4a4690a9e7d43c`
**Decision maker:** Repository owner

## Decision

The owner explicitly chose to **skip inviting external beta testers** prepared under `docs/beta/` and to proceed toward a **public GitHub Pre-release** of `v0.1.0-beta.1`.

This document records that exception. It does **not** claim that independent external testing was completed.

## What was actually verified (pre-publication)

| Area | Status |
| --- | --- |
| Unit / integration (`npm test`) | Passed in preflight |
| Local e2e (`npm run e2e`) | Passed |
| Postman offline (`npm run postman:offline`) | Passed |
| Historical privacy (`npm run privacy:history`) | Passed |
| Dashboard lint / typecheck / test / build | Passed |
| Source-build Compose smoke (`npm run compose:smoke`) | Passed |
| Release acceptance (`npm run release:acceptance`) | Passed |
| Isolated release-**image** smoke (local RC tags + `docker-compose.release.yml`) | Passed in preflight |
| Docker license pack (`npm run license:docker`) | Passed |
| GitHub CI on `main` @ `c7b0ac5` | Success |
| Owner local Facebook live scrape | Previously verified by owner (not re-run in preflight) |
| Owner local Instagram live scrape | Previously verified by owner (not re-run in preflight) |
| Owner local functional QA / responsive UI | Previously completed |

## What was **not** performed

| Area | Status |
| --- | --- |
| Invited external tester installs | **Not performed** (owner skip) |
| Independent clean-machine installs by third parties | **Not performed** |
| Public GHCR pull verification | Deferred to Step 5E-2 (images not published in 5E-1) |
| Public GitHub Release | Deferred to Step 5E-2 |
| Live Apify Actor runs during preflight | **Not performed** (quota kept at 0; no paid runs) |

## Accepted beta risks

- Experimental pre-release; not production-stable.
- Provider scraping success is not guaranteed.
- Empty cache on fresh installs can yield upstream/unavailable responses when live fetch is disabled or fails.
- Local `APIFY_DAILY_RUN_LIMIT` is an attempt counter, **not** a USD spending cap.
- First published images are planned as `linux/amd64` only.
- Residual GitHub PR-ref / cache history risk remains as previously accepted in `OWNER_DECISIONS.md`.
- Residual native-library license texts for transitive libvips dependencies are version-pinned but not fully mirrored (see `DOCKER_THIRD_PARTY_COMPLIANCE.md`).

## Non-waived gates

This exception does **not** waive:

- Security-critical defect checks
- Dashboard image LGPL redistribution pack
- Mandatory CI on the release commit
- Isolated release-image smoke before advertising image install
- Secret scanning / no credentials in artifacts
- Reproducible installation documentation

## Post-release validation still recommended

1. Public pull of GHCR tags + digest pin in Compose docs
2. Clean install from published images on a machine without owner data
3. Optional invited tester feedback using `docs/beta/` materials
4. Operator HTTPS acceptance on a real domain (optional)
