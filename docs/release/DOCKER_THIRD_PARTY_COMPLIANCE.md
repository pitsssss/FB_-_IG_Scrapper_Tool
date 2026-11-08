# Docker third-party compliance checklist (dashboard image)

**Status:** preparation draft — not legal advice  
**Verified against:** production multi-stage `apps/dashboard/Dockerfile` build on linux/amd64 Alpine (`node:22-alpine`), image tag used for audit: `smp-dash-license-audit:local`

## Why this exists

The dashboard production image embeds Next.js standalone output, which (as inspected) includes:

- `sharp@0.35.5` (Apache-2.0)
- `@img/sharp-linuxmusl-x64@0.35.5` (Apache-2.0)
- `@img/sharp-libvips-linuxmusl-x64@1.3.4` (**LGPL-3.0-or-later**) providing `libvips-cpp.so.*`
- `@img/sharp-wasm32@0.35.5` (Apache-2.0 AND LGPL-3.0-or-later AND MIT)
- `@img/colour@1.1.0` (MIT)

Apache-2.0 on **this project’s source** does not erase third-party terms for **binaries inside the image**.

## Checklist for anyone publishing the dashboard image

1. **Inventory the image** for each architecture you publish (`docker run` / `find` for `sharp`, `libvips`, `@img`).
2. **Retain license texts** for redistributed components (LGPL texts for libvips packages at minimum). If standalone tracing omits `LICENSE`/`COPYING` files, copy them into the image or ship an accompanying `THIRD_PARTY_NOTICES` artifact with the release.
3. **Provide source availability for LGPL binaries** as required by LGPL-3.0-or-later for the version you ship (typically: offer Corresponding Source for the LGPL library, or document how recipients obtain it from upstream npm/`libvips` sources matching the shipped `.so`).
4. **Do not strip** ability for a recipient to replace the LGPL library where LGPL requires it (dynamic `.so` in `@img/sharp-libvips-*` is the usual shape).
5. **Document base images** (`node:22-alpine`, and Compose `caddy:2`) separately — their licenses are not replaced by this project’s Apache-2.0.
6. **Re-run inventory** after Next/sharp upgrades or Dockerfile changes.
7. **Optional hardening (product decision):** if image optimization is unused, evaluate whether a future Next/config change can omit sharp from the standalone trace — only if functionally verified; do not remove libraries solely to hide license obligations without confirming runtime impact.

## Out of scope for this checklist

- Relicensing this repository’s original source as LGPL/GPL
- npm registry publication (`private: true`)
- Apify / Meta platform terms
