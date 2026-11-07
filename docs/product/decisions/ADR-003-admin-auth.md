# ADR-003: Admin authentication design

**Status:** Accepted (implemented in 7C.1; extended in 7C.1B)  
**Phase:** 7A design / 7C.1 / 7C.1B implementation

## Decision

- **Bootstrap:** Operator-supplied one-time `BOOTSTRAP_SETUP_TOKEN`; reject open registration and default passwords. Fail closed if token unset and no admin exists. Setup creates a single administrator with **email** (+ derived username).
- **Login:** Email or legacy username + **scrypt** password; **server-side sessions** (token hashed at rest) in httpOnly SameSite cookies; CSRF token + Origin allow-list; durable rate limits.
- **Email verification (optional):** When `SMTP_*` is configured, short-lived hashed OTPs verify email. Without SMTP, email may still be stored as identity but is **never** marked verified and no fake send success is returned.
- **MFA:** Optional RFC 6238 TOTP (authenticator apps). Secrets encrypted with `DATA_ENCRYPTION_KEY` (AES-256-GCM). Password-only sessions (`auth_level=password`) cannot access management APIs until MFA succeeds. Recovery codes stored as hashes; shown once.
- **Separation:** Admin sessions ≠ public API keys (`x-api-key`).
- **Recovery:** Host-only CLI (`scripts/admin-recover.js`) with interactive (non-echoed) password preferred; clears MFA and recovery codes on reset.

## Context

Public internet self-host requires setup-takeover resistance. Project already uses timing-safe API key compares and encrypted provider credentials (7C.2).

## Alternatives

| Option | Verdict |
| --- | --- |
| JWT in localStorage | Rejected (XSS theft) |
| First-visitor-wins admin | Rejected (takeover) |
| Argon2id npm package | Deferred — preserves zero-runtime-deps Docker image; scrypt params stored for later KDF migration |
| OAuth / social login | Out of scope |
| Mandatory SMTP | Rejected — self-host must work offline; TOTP MFA works without email |

## Tradeoffs

- Host-access recovery remains the account-reset path (no anonymous email reset).
- scrypt instead of Argon2id for dependency policy; still memory-hard with unique salts.
- Legacy username-only admins remain login-compatible until email enrollment completes (additive schema v3).

## Security implications

See SECURITY_ARCHITECTURE threat items 1–2, 5, 8–9, 13, 19. MFA enrollment / disable / email change / recovery regeneration require fresh password (and TOTP when enabled) plus CSRF.

## Migration path

Additive SQLite management schema **v3** (email / OTP / TOTP / recovery tables + session `auth_level`). Never wipe `MANAGEMENT_DIR`. Later: Argon2id via stored `password_algo`; multiple admins/RBAC without changing posts API key model.
