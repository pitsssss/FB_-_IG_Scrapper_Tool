# Third-party license inventory (STEP 2A.1)

**Scope:** Social Media Posts API @ `b8be363` + local `release/apache-2.0-preparation` drafts  
**Method:** lockfiles, `node_modules` SPDX fields, Next standalone output, production dashboard Docker image inspection  
**Not legal advice.**

## Distribution surfaces (keep separate)

| Artifact | What is distributed | Third-party license relevance |
| --- | --- | --- |
| **Git source tree** | Project-owned source + lockfiles declaring deps | npm packages are **referenced**, not vendored as source trees |
| **Root npm install (dev)** | `newman`, `playwright` + transitive | Dev/test only — **not** required to run the API |
| **Dashboard `npm ci` (host)** | Full dependency tree including optional platform binaries | Developer machine only |
| **Dashboard production Docker image** | Next standalone server + traced `node_modules` (incl. native binaries) | **Binary redistribution** obligations apply |
| **API production Docker image** | Project Node sources; **zero** npm runtime deps | Base image `node:22-alpine` is separate (Node/OS licenses) |
| **Compose stack** | api + dashboard + `caddy:2` images | Caddy/base OS licenses apply to those images |

## Project-owned packages (proposed Apache-2.0)

| Package | `license` field | `private` |
| --- | --- | --- |
| root `social-media-posts-api` | `Apache-2.0` (draft) | `true` |
| `apps/dashboard` | `Apache-2.0` (draft) | `true` |

## Runtime vs development dependencies

### API (root)

| Kind | Packages | Licenses (declared) | Bundled in API image? |
| --- | --- | --- | --- |
| Runtime npm | **none** | — | No |
| Dev/test | `newman@6.2.3`, `playwright@1.65.0` | Apache-2.0 | No |

### Dashboard (direct)

| Package | Role | License | In production image? |
| --- | --- | --- | --- |
| `next@16.4.5` | framework | MIT | Yes (standalone) |
| `react` / `react-dom` | UI | MIT | Yes |
| `lucide-react` | icons (JS) | ISC | Yes (bundled JS) |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `next-themes`, `server-only` | UI helpers | MIT | Yes (as used) |
| eslint / vitest / typescript / Testing Library / Tailwind tooling | **dev** | mostly MIT/Apache-2.0 | **No** (not copied into runner stage as the full host `node_modules`) |

## Static assets

| Asset | Evidence | Status | Recommendation |
| --- | --- | --- | --- |
| `apps/dashboard/app/favicon.ico` (15086 bytes, SHA-256 `C28FDD2A4F31E2DC64F653962286DA5C82A4CDFC518B242D32812C624E9A19A4`) | Added in scaffold commit `8aef74d`; **byte-identical** to current `create-next-app` templates `app/ts` and `app-tw/ts` favicon on `next.js` canary | **Verified** as create-next-app / Next.js scaffold asset (Next.js is MIT) — **not** original project branding | **Retained for STEP 2B** as MIT scaffold asset; optional later replacement with original branding |

No project-owned font files or vendored SVG icon packs were found in the git tree.

## Docker: sharp / libvips (verified in production image)

`next` declares **optional** dependency `sharp@^0.35.5`. Dashboard code does **not** import `next/image`, but Next standalone **still traces** sharp into the production image (image optimizer code is present).

**Inspected image:** `smp-dash-license-audit:local` built from `apps/dashboard/Dockerfile` (linux/amd64 Alpine / musl).

| Component found in image | Version | SPDX (package.json / lockfile) | Notes |
| --- | --- | --- | --- |
| `sharp` | **0.35.5** | Apache-2.0 | Present under `/app/node_modules/sharp` |
| `@img/sharp-linuxmusl-x64` | **0.35.5** | Apache-2.0 | Native `.node` addon |
| `@img/sharp-libvips-linuxmusl-x64` | **1.3.4** | **LGPL-3.0-or-later** | Ships `libvips-cpp.so.8.18.7` |
| `@img/sharp-wasm32` | **0.35.5** | Apache-2.0 AND LGPL-3.0-or-later AND MIT | Present in inspected image |
| `@img/colour` | **1.1.0** | MIT | Present |

**Also in lockfile (optional, platform-specific; not all land in one image):** other `@img/sharp-*` / `@img/sharp-libvips-*` variants with LGPL-3.0-or-later or combined Apache-2.0 AND LGPL metadata.

### Practical finding

- **Source git distribution:** sharp/libvips are not copied into the repo; only declared transitively via the lockfile.
- **Dashboard Docker redistribution:** **yes** — LGPL-covered libvips **is** embedded in the production image for the build platform.
- **Gap:** Next standalone copy into the runner **did not include** `LICENSE`/`COPYING` text files under `/app/node_modules/sharp` or `/app/node_modules/@img` in the inspected image. Redistributors should add accompanying notices/license texts (see compliance checklist).

This does **not** force the project’s own source to be GPL/LGPL. It creates **binary redistribution** diligence for published dashboard images.

## Base images / other containers

| Image | Role | Note |
| --- | --- | --- |
| `node:22-alpine` | API + dashboard stages | Node.js / Alpine licenses apply to the base layers |
| `caddy:2` | reverse proxy | Caddy / upstream image licenses apply |
| `alpine:3.20` | smoke helpers only | Test tooling |

## Root NOTICE file

**Verdict for publication:** **NOT_NEEDED** at this stage (see STEP 2A.1 report).

Apache-2.0 §4(d) obligations for NOTICE apply **if** a NOTICE is included in the Work. ASF projects must ship a correct NOTICE; this repository is **not** an ASF project. With no confirmed copyright holder and no third-party NOTICE texts that must travel with *this* source tree, a root NOTICE containing placeholders or marketing disclaimers is inappropriate. Docker LGPL obligations are handled via a **distribution compliance checklist**, not by inventing a project NOTICE.

## Owner checklist

- [x] Owner personal ownership declaration recorded (STEP 2B)
- [x] Favicon retained as verified MIT scaffold asset (STEP 2B)
- [ ] Complete Docker third-party compliance before publishing dashboard images
- [x] Approve Apache-2.0 source license publication (STEP 2B)
