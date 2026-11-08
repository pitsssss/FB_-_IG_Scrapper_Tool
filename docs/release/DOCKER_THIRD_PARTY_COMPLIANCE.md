# Docker third-party compliance checklist (dashboard image)

**Status:** STEP 4A pack implemented in-tree (not legal advice). Dashboard images are **not published** yet.  
**Verified against:** production multi-stage `apps/dashboard/Dockerfile` build on linux/amd64 Alpine (`node:22-alpine`), image tag used for audit: `smp-dash-license-audit:local`

## Why this exists

The dashboard production image embeds Next.js standalone output, which (as inspected) includes:

- `sharp@0.35.5` (Apache-2.0)
- `@img/sharp-linuxmusl-x64@0.35.5` (Apache-2.0)
- `@img/sharp-libvips-linuxmusl-x64@1.3.4` (**LGPL-3.0-or-later**) providing `libvips-cpp.so.*`
- `@img/sharp-wasm32@0.35.5` (Apache-2.0 AND LGPL-3.0-or-later AND MIT)
- `@img/colour@1.1.0` (MIT)

Apache-2.0 on **this project’s source** does not erase third-party terms for **binaries inside the image**.

## What ships with the dashboard image (STEP 4A)

The runner stage copies `third-party/` into `/app/third-party`:

| Artifact | Role |
| --- | --- |
| `licenses/LGPL-3.0.txt` | LGPLv3 text (verbatim GNU) |
| `licenses/GPL-3.0.txt` | GPLv3 text required alongside LGPLv3 |
| `NOTICES.txt` | Prominent attribution, source URLs, replacement steps |
| `sharp-libvips-linuxmusl-x64-1.3.4.versions.json` | Upstream versions bundled in that npm prebuilt (`vips` = **8.18.7**) |

Version-matched libvips source (tag exists; HTTP 302 to codeload):

`https://github.com/libvips/libvips/archive/refs/tags/v8.18.7.tar.gz`

Exact prebuilt redistributed via npm:

`https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-x64/-/sharp-libvips-linuxmusl-x64-1.3.4.tgz`

No written postal source offer was invented. Project source stays **Apache-2.0**.

`npm run license:docker` fails the release pack if texts, pins, Dockerfile copy, or an automatic publish trigger are missing.

## Checklist for anyone publishing the dashboard image

1. **Inventory the image** for each architecture you publish (`docker run` / `find` for `sharp`, `libvips`, `@img`, `/app/third-party`).
2. **Confirm** `/app/third-party/licenses` and `NOTICES.txt` are present in the built image (standalone tracing no longer has to carry upstream LICENSE files).
3. **Re-verify** `versions.json` `vips` against the `.so` SONAME after any sharp upgrade, and update the source URL to that tag.
4. **Do not strip** the shared `libvips-cpp.so` or document replacement under `/app/node_modules/@img/sharp-libvips-linuxmusl-x64/lib`.
5. **Document base images** (`node:22-alpine`, Compose `caddy:2` upstream — not republished here).
6. **Supported architecture for the first beta image:** `linux/amd64` only (musl x64 package pin).
7. **Residual:** other native libraries listed in `versions.json` (glib, png, webp, …) are identified by version. Their upstream tarballs are not mirrored in this repository. Recipients use those version pins plus the npm prebuilt tarball. This is not a claim that every transitive license text is vendored.

## Out of scope for this checklist

- Relicensing this repository’s original source as LGPL/GPL
- npm registry publication (`private: true`)
- Apify / Meta platform terms
