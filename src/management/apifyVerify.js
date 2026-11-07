/**
 * Server-side Apify token validation via GET /v2/users/me.
 * Does not run Actors or consume scrape credit.
 */

const DEFAULT_BASE = 'https://api.apify.com';
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * @param {string} token
 * @param {{ baseUrl?: string, timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<
 *   | { ok: true, usernameHint: string }
 *   | { ok: false, code: string, message: string }
 * >}
 */
export async function verifyApifyToken(token, opts = {}) {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, code: 'TOKEN_REQUIRED', message: 'Apify token is required' };
  }
  const trimmed = token.trim();
  if (trimmed.length < 10 || trimmed.length > 512) {
    return { ok: false, code: 'TOKEN_INVALID', message: 'Apify token format is invalid' };
  }

  const baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  // Production path must stay on Apify. Tests may pass allowCustomBase + mock base.
  if (!opts.allowCustomBase && !/^https:\/\/api\.apify\.com$/i.test(baseUrl)) {
    return { ok: false, code: 'CONFIG_ERROR', message: 'Invalid Apify API base URL' };
  }

  const url = `${baseUrl}/v2/users/me`;
  const fetchImpl = opts.fetchImpl || fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${trimmed}`,
        accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err?.name || 'Error';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, code: 'NETWORK_TIMEOUT', message: 'Apify verification timed out' };
    }
    return { ok: false, code: 'NETWORK_ERROR', message: 'Could not reach Apify to verify the token' };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, code: 'TOKEN_INVALID', message: 'Apify rejected this token' };
  }
  if (!res.ok) {
    return { ok: false, code: 'UPSTREAM_ERROR', message: 'Apify verification failed' };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: 'UPSTREAM_ERROR', message: 'Apify returned an invalid response' };
  }

  const data = body?.data || body;
  const username = typeof data?.username === 'string' ? data.username.trim() : '';
  // Persist only a safe display hint — never email, plan, or ids in API responses beyond hint.
  const usernameHint = username ? username.slice(0, 64) : 'connected';

  return { ok: true, usernameHint };
}
