import fs from 'node:fs/promises';
import path from 'node:path';

export const QUOTA_SCHEMA_VERSION = 1;
export const QUOTA_FILENAME = 'apify-quota.json';

const utcDateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Persistent daily Apify invocation budget for a SINGLE process.
 * Production must run one API replica/worker until a shared transactional
 * quota backend is introduced — this file-based lock is not multi-replica safe.
 */
export function createApifyQuota({
  stateDir,
  dailyLimit,
  now = () => Date.now(),
  filename = QUOTA_FILENAME,
} = {}) {
  if (!stateDir || typeof stateDir !== 'string') {
    throw new Error('apifyQuota: stateDir is required');
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0) {
    throw new Error('apifyQuota: dailyLimit must be a non-negative integer');
  }

  const filePath = path.join(stateDir, filename);
  let queue = Promise.resolve();
  let untrusted = false;
  let memory = null; // { schemaVersion, utcDate, consumed } | null after load
  /** Effective daily limit — may be lowered at runtime without resetting consumed. */
  let effectiveDailyLimit = dailyLimit;

  const enqueue = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  async function ensureDir() {
    await fs.mkdir(stateDir, { recursive: true });
  }

  async function atomicWrite(state) {
    await ensureDir();
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify(state)}\n`;
    await fs.writeFile(tmp, payload, 'utf8');
    await fs.rename(tmp, filePath);
  }

  function parseState(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.schemaVersion !== QUOTA_SCHEMA_VERSION) return null;
    if (typeof data.utcDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.utcDate)) return null;
    if (!Number.isInteger(data.consumed) || data.consumed < 0) return null;
    // Reject unexpected sensitive-looking fields by only keeping known keys.
    return {
      schemaVersion: QUOTA_SCHEMA_VERSION,
      utcDate: data.utcDate,
      consumed: data.consumed,
    };
  }

  async function loadState() {
    if (untrusted) return null;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = parseState(raw);
      if (!parsed) {
        untrusted = true;
        memory = null;
        return null;
      }
      memory = parsed;
      return parsed;
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        memory = {
          schemaVersion: QUOTA_SCHEMA_VERSION,
          utcDate: utcDateOf(now()),
          consumed: 0,
        };
        return memory;
      }
      untrusted = true;
      memory = null;
      return null;
    }
  }

  /**
   * Reserve one invocation attempt. Persists BEFORE the caller may contact Apify.
   * @returns {{ ok: true, consumed: number, remaining: number, utcDate: string }
   *         | { ok: false, reason: string, consumed: number, remaining: number, utcDate: string }}
   */
  async function reserve() {
    return enqueue(async () => {
      const today = utcDateOf(now());

      const limit = effectiveDailyLimit;
      if (untrusted) {
        return {
          ok: false,
          reason: 'quota_untrusted',
          consumed: limit,
          remaining: 0,
          utcDate: today,
        };
      }

      const state = await loadState();
      if (!state) {
        return {
          ok: false,
          reason: 'quota_untrusted',
          consumed: limit,
          remaining: 0,
          utcDate: today,
        };
      }

      if (state.utcDate !== today) {
        state.utcDate = today;
        state.consumed = 0;
      }

      if (limit === 0 || state.consumed >= limit) {
        return {
          ok: false,
          reason: limit === 0 ? 'quota_disabled' : 'quota_exhausted',
          consumed: state.consumed,
          remaining: Math.max(0, limit - state.consumed),
          utcDate: today,
        };
      }

      const next = {
        schemaVersion: QUOTA_SCHEMA_VERSION,
        utcDate: today,
        consumed: state.consumed + 1,
      };

      try {
        await atomicWrite(next);
        memory = next;
      } catch {
        untrusted = true;
        memory = null;
        return {
          ok: false,
          reason: 'quota_persist_failed',
          consumed: state.consumed,
          remaining: Math.max(0, limit - state.consumed),
          utcDate: today,
        };
      }

      return {
        ok: true,
        consumed: next.consumed,
        remaining: Math.max(0, limit - next.consumed),
        utcDate: today,
      };
    });
  }

  /** Read-only status; never mutates quota state. */
  async function getStatus() {
    const today = utcDateOf(now());
    let readable = true;
    let stateDate = null;
    let rawConsumed = null;
    let effectiveConsumed = 0;

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = parseState(raw);
      if (!parsed) {
        readable = false;
      } else {
        stateDate = parsed.utcDate;
        rawConsumed = parsed.consumed;
        effectiveConsumed = parsed.utcDate === today ? parsed.consumed : 0;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        readable = true;
        stateDate = null;
        rawConsumed = 0;
        effectiveConsumed = 0;
      } else {
        readable = false;
      }
    }

    if (untrusted) readable = false;

    const limit = effectiveDailyLimit;
    const remaining = readable ? Math.max(0, limit - effectiveConsumed) : 0;
    const allowed = readable && limit > 0 && effectiveConsumed < limit;

    return {
      todayUtc: today,
      stateUtcDate: stateDate,
      dailyLimit: limit,
      consumed: effectiveConsumed,
      rawConsumed,
      remaining,
      allowed,
      readable,
      untrusted,
      statePath: filePath,
    };
  }

  /**
   * Lower or raise the effective daily limit without resetting consumed counters.
   * Callers must enforce any hard ceiling before invoking.
   */
  function setDailyLimit(next) {
    if (!Number.isInteger(next) || next < 0) {
      throw new Error('apifyQuota: dailyLimit must be a non-negative integer');
    }
    effectiveDailyLimit = next;
    return effectiveDailyLimit;
  }

  return {
    reserve,
    getStatus,
    setDailyLimit,
    getDailyLimit: () => effectiveDailyLimit,
    filePath,
    /** Test helper: mark store untrusted without writing. */
    _markUntrusted() { untrusted = true; },
  };
}
