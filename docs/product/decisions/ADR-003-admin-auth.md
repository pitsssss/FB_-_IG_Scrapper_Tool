# ADR-003: Admin authentication design

**Status:** Accepted (implemented in 7C.1)  
**Phase:** 7A design / 7C.1 implementation

## Decision

- **Bootstrap:** Operator-supplied one-time `BOOTSTRAP_SETUP_TOKEN`; reject open registration and default passwords. Fail closed if token unset and no admin exists.
- **Login:** Single admin (MVP) with **scrypt** password hashing (`node:crypto`); **server-side sessions** (token hashed at rest) in httpOnly SameSite cookies; CSRF token + Origin allow-list; durable rate limits.
- **Separation:** Admin sessions ≠ public API keys.
- **Recovery:** Host-only CLI (`scripts/admin-recover.js`).

## Context

Public internet self-host requires setup-takeover resistance. Project already uses timing-safe API key compares.

## Alternatives

| Option | Verdict |
| --- | --- |
| JWT in localStorage | Rejected (XSS theft) |
| First-visitor-wins admin | Rejected (takeover) |
| Argon2id npm package | Deferred — preserves zero-runtime-deps Docker image; scrypt params stored for later KDF migration |
| OAuth / social login | Out of scope |

## Tradeoffs

- No email reset in MVP → host-access recovery only.
- scrypt instead of Argon2id for dependency policy; still memory-hard with unique salts.

## Security implications

See SECURITY_ARCHITECTURE threat items 1–2, 5, 8–9, 13, 19.

## Migration path

Later: Argon2id via stored `password_algo` / `password_params`; multiple admins/RBAC without changing posts API key model.
