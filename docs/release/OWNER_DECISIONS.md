# Owner decisions required before public release

These items **block** calling the project a completed public open-source **beta release** (tag / GitHub Release). Technical Phase **7F.2** produced a **CONDITIONAL GO** (see [FINAL_ACCEPTANCE_REPORT.md](./FINAL_ACCEPTANCE_REPORT.md)).

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
| Source license on GitHub `main` | Updated via STEP 2B PR (verify after merge) |
| Public beta RELEASED | **No** — no tag / GitHub Release in this step |

### SPDX / source headers

- Root `LICENSE` is the primary license instrument.
- Per-file SPDX headers were **not** mass-added in this step.

## 2. Security reporting channel

**Private vulnerability reporting:** **ENABLED** on `pitsssss/FB_-_IG_Scrapper_Tool` (STEP 3A).

- Verified with `GET /repos/.../private-vulnerability-reporting` → `{ "enabled": true }` (no settings change was required; already enabled).
- Advisories entry: https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/security/advisories
- `SECURITY.md` instructs reporters to use **Report a vulnerability** (no public Issues for security bugs).
- **Owner notification preferences:** not auto-changed. Owner should confirm GitHub account/org notification settings include security alerts / vulnerability reports (Watch → Custom, or Settings → Notifications → Security alerts). Status: **OWNER_NOTIFICATION_PENDING**.

## 3. Historical Git privacy

Sanitized audit result (`npm run privacy:history`):

- Pattern hits exist (counts only; **values omitted**). Synthetic/placeholder matches are expected.
- Status: **HISTORICAL_PRIVACY: REVIEW_REQUIRED** (residual risk remains noted)

**Owner actions (still open):**

1. Privately review sample commit SHAs printed by the audit.
2. **Rotate** any credentials that were ever real.
3. Decide remediation for forks/CI caches/mirrors of pre-clean history if needed.

## 4. Repository rename (optional)

GitHub repository name may still be historical. Product name is **Social Media Posts API**.

## 5. Live HTTPS & paid Apify acceptance

- `LIVE_HTTPS_NOT_VERIFIED`
- Controlled live Apify: optional; default CI remains mocked (**MOCKED PROVIDER VERIFIED** only)

## 6. Public GitHub Release / tag

Do **not** publish `v0.1.0-beta.1` (or any tag) until remaining readiness items (security channel, privacy confirmation, and any owner-required acceptance) are resolved. License publication ≠ beta release.

## 7. Publication gate summary

| Gate | Status |
| --- | --- |
| Apache-2.0 selected + approved by owner | Yes |
| LICENSE prepared / published on `main` | STEP 2B (verify after merge) |
| NOTICE | NOT_NEEDED |
| Owner personal ownership declaration recorded | Yes |
| Named copyright line invented | No |
| Docker image published | **No / BLOCKED** |
| npm publish | **No** (`private: true`) |
| Public beta tag/Release | **No** |
