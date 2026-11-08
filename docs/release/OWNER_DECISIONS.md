# Owner decisions required before public release

These items **block** calling the project a completed public open-source **beta release** (tag / GitHub Release). Technical Phase **7F.2** produced a **CONDITIONAL GO** (see [FINAL_ACCEPTANCE_REPORT.md](./FINAL_ACCEPTANCE_REPORT.md)).

Distinguish:

- **SOURCE-ONLY BETA RELEASE** — GitHub source + docs under Apache-2.0 (this gate track).
- **DOCKER IMAGE DISTRIBUTION** — separate binary redistribution duties (sharp/libvips LGPL); blocked until [DOCKER_THIRD_PARTY_COMPLIANCE.md](./DOCKER_THIRD_PARTY_COMPLIANCE.md) is implemented and verified.

## 1. LICENSE — Apache-2.0 (source license publication)

| Field | Status |
| --- | --- |
| Owner intent | Permissive open source: personal + commercial use, modification, redistribution, proprietary integration without a general share-alike duty |
| Selected SPDX | **Apache-2.0** |
| Official text | Root [`LICENSE`](../../LICENSE) from https://www.apache.org/licenses/LICENSE-2.0.txt (SHA-256 `CFC7749B96F63BD31C3C42B5C471BF756814053E847C10F3EB003417BC523D30`) |
| Root `NOTICE` | **NOT_NEEDED** for the current source package (independent/non-ASF project; no required third-party NOTICE content in-tree) |
| package.json `"license"` | `Apache-2.0` (root + dashboard); both remain `"private": true` (not published to npm) |
| Owner copyright declaration | **Recorded (STEP 2B):** owner states this is a **personal project**, that they are its **sole owner**, and that they hold rights to the **original code**. Treat as owner declaration — not an independently verified legal opinion. No separate named copyright line was inserted (no guessed legal identity). |
| Favicon | Retained create-next-app / Next.js MIT scaffold asset (verified SHA match); not claimed as original brand art |
| Third-party inventory | Reviewed — see [THIRD_PARTY_LICENSE_INVENTORY.md](./THIRD_PARTY_LICENSE_INVENTORY.md) |
| Docker binary compliance | **Separate gate** — dashboard image embeds sharp/libvips (LGPL). Image publication remains **BLOCKED** until [DOCKER_THIRD_PARTY_COMPLIANCE.md](./DOCKER_THIRD_PARTY_COMPLIANCE.md) is implemented and verified. Source Apache-2.0 does **not** by itself satisfy all binary redistribution duties. |
| Source license on GitHub `main` | **Published** (STEP 2B merge; GitHub detects Apache-2.0) |
| Public beta RELEASED | **No** — no tag / GitHub Release |

### SPDX / source headers

- Root `LICENSE` is the primary license instrument.
- Per-file SPDX headers were **not** mass-added.

## 2. Security reporting channel

**Private vulnerability reporting:** **ENABLED** on `pitsssss/FB_-_IG_Scrapper_Tool` (STEP 3A).

- Verified with `GET /repos/.../private-vulnerability-reporting` → `{ "enabled": true }`.
- Advisories entry: https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/security/advisories
- `SECURITY.md` instructs reporters to use **Report a vulnerability** (no public Issues for security bugs).
- **Owner notification preferences:** not auto-changed. Owner should confirm GitHub account/org notification settings include security alerts / vulnerability reports (Watch → Custom, or Settings → Notifications → Security alerts). Status: **OWNER_NOTIFICATION_PENDING**.

## 3. Historical Git privacy

### Rewrite and ordinary history

- History rewrite completed; clean development clone established (`Social-Media-Posts-API-Clean`).
- Six historical customer social URLs: **PRIOR_REWRITE_VERIFIED** (earlier exact-match audits). **CURRENT_EXACT_RESCAN_UNVERIFIED** in this workspace (private denylist fingerprints not present in the clean clone — by design).
- This is **not** a claim of Internet-wide erasure (forks, caches, PR refs may retain old objects).

### Privacy scanner (`npm run privacy:history`) — STEP 3C

- Pickaxe still records synthetic detector needles / placeholders as `commitHits`.
- Targeted classification marks known synthetic contexts **safe** without suppressing realistic token bodies (including in tests/docs).
- Expected post-stabilization result when only synthetic hits remain: **`HISTORICAL_PRIVACY: PASS`**.
- Unresolved realistic credential-shaped hits still yield **`HISTORICAL_PRIVACY: REVIEW_REQUIRED`**.

### Owner credential declaration (STEP 3C)

| Field | Record |
| --- | --- |
| Declaration | Owner states all real local `.env` secrets were kept private and were never knowingly published or shared |
| Nature | **Owner declaration** — not independent forensic proof of every historical exposure surface |
| Confirmed active public credential leak | **None identified** in prior audits / STEP 3B–3C |
| Rotation currently evidenced | **No** — do not rotate without evidence |
| `DATA_ENCRYPTION_KEY` | **Unchanged** — do not regenerate against existing encrypted management data without a migration plan |
| Absolute exclusion of all exposure | **Not claimed** — checks cannot rule out every fork/cache/unknown copy |

### Residual GitHub PR / cache risk — SEPARATE OWNER DECISION

| Item | Status |
| --- | --- |
| Historical PR refs `#1–#7` / cached pre-rewrite commits | **RESIDUAL_RISK** (documented; not accepted by default) |
| Owner acceptance of residual PR/cache risk | **NOT RECORDED** — still required before treating privacy as fully closed for public beta |
| Optional Support escalation | Draft only: [GITHUB_SUPPORT_HISTORY_PURGE_DRAFT.md](./GITHUB_SUPPORT_HISTORY_PURGE_DRAFT.md) — do not submit automatically |

### Open Dependabot PRs `#8–#11` (hygiene)

Post-rewrite dependency bumps based on clean `main` ancestry tip `d82313b` (ahead 1 / behind 3 vs current tip). Ordinary `package.json` / lockfile changes — **not** treated as history contamination. Owner/maintainer should review/merge or close via normal Dependabot process (not auto-deleted in STEP 3C).

## 4. Repository rename (optional)

GitHub repository name may still be historical. Product name is **Social Media Posts API**.

## 5. Live HTTPS & paid Apify acceptance

- `LIVE_HTTPS_NOT_VERIFIED`
- Controlled live Apify: optional; default CI remains mocked (**MOCKED PROVIDER VERIFIED** only)

## 6. Public GitHub Release / tag

Do **not** publish `v0.1.0-beta.1` (or any tag) until remaining readiness items are resolved. License publication ≠ beta release.

## 7. Publication gate summary

| Gate | Status |
| --- | --- |
| Apache-2.0 selected + approved by owner | Yes |
| LICENSE published on `main` | Yes |
| NOTICE | NOT_NEEDED |
| Owner personal ownership declaration recorded | Yes |
| Named copyright line invented | No |
| Private vulnerability reporting enabled | Yes |
| Owner credential declaration recorded | Yes (not a forensic guarantee) |
| Privacy scanner synthetic classification | STEP 3C |
| Residual PR/cache risk accepted by owner | **No / pending** |
| GitHub security notifications confirmed | **OWNER_NOTIFICATION_PENDING** |
| Docker image published | **No / BLOCKED** (LGPL compliance open) |
| npm publish | **No** (`private: true`) |
| Public beta tag/Release | **No** |
