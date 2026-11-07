const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validateEmail(email) {
  if (typeof email !== 'string') return { ok: false, message: 'Email is required' };
  const e = email.trim().toLowerCase();
  if (e.length < 5 || e.length > 254) return { ok: false, message: 'Email is invalid' };
  if (!EMAIL_RE.test(e)) return { ok: false, message: 'Email is invalid' };
  return { ok: true, email: e };
}

/** Derive a username from email local-part for bootstrap (single-admin UX). */
export function usernameFromEmail(email) {
  const local = String(email).split('@')[0] || '';
  let cleaned = local.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (cleaned.length < 3) cleaned = `admin${cleaned}`;
  if (cleaned.length < 3) cleaned = 'administrator';
  return cleaned.slice(0, 64);
}

/**
 * SMTP configuration from env. Absent/incomplete → mail disabled (fail closed for send).
 */
export function loadSmtpConfig(env = process.env) {
  const host = (env.SMTP_HOST || '').trim();
  const port = Number.parseInt(env.SMTP_PORT || '587', 10);
  const user = (env.SMTP_USER || '').trim();
  const pass = env.SMTP_PASS || '';
  const from = (env.SMTP_FROM || '').trim();
  const secure = String(env.SMTP_SECURE || '').trim() === '1' || port === 465;
  if (!host || !from) {
    return { enabled: false, reason: 'SMTP_HOST and SMTP_FROM are required to send email' };
  }
  if (!Number.isFinite(port) || port < 1) {
    return { enabled: false, reason: 'SMTP_PORT is invalid' };
  }
  return {
    enabled: true,
    host,
    port,
    user: user || null,
    pass: pass || null,
    from,
    secure,
  };
}
