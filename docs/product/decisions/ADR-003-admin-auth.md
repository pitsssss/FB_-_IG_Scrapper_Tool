# ADR-003: Admin authentication design

**Status:** Accepted (design); KDF library **OPEN**  
**Phase:** 7A

## Decision

- **Bootstrap:** Operator-supplied one-time `BOOTSTRAP_SETUP_TOKEN` (primary); optional volume file delivery; reject open registration and default passwords.
- **Login:** Single admin (MVP) with password hashed via modern KDF; **server-side sessions** in httpOnly Secure cookies; CSRF on state-changing requests; login rate limits.
- **Separation:** Admin sessions ≠ public API keys.

## Context

No admin auth exists today. Public internet self-host requires setup-takeover resistance. Project already uses timing-safe API key compares.

## Alternatives

| Option | Verdict |
| --- | --- |
| JWT in localStorage | Rejected (XSS theft) |
| First-visitor-wins admin | Rejected (takeover) |
| OAuth / social login | Out of scope |
| Localhost-only setup alone | Insufficient for VPS |

## Tradeoffs

- No email reset in MVP → host-access recovery only.
- Session store adds persistence requirement.

## Security implications

See SECURITY_ARCHITECTURE threat items 1–2, 5, 8–9, 13, 19.

## Open

Exact KDF: prefer **Argon2id** (may add dependency) vs **scrypt** via `node:crypto`. Decide in 7C with engines/deps policy.

## Migration path

Later: multiple admins/RBAC without changing posts API key model.
