import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Two-level cache: in-memory Map + JSON files on disk (survives restarts).
 * Entries never expire here.
 *
 * Durability note: `set()` always updates memory so the current process can keep
 * serving. Disk persistence uses atomic tmp+rename. If the disk write fails,
 * memory remains available until process exit/restart, but the entry may be lost
 * after restart. Persistent volume health is an operational requirement.
 */
export class Cache {
  constructor(dir) {
    this.dir = dir;
    this.mem = new Map();
  }

  file(key) {
    return path.join(this.dir, `${createHash('sha1').update(key).digest('hex')}.json`);
  }

  async get(key) {
    if (this.mem.has(key)) return this.mem.get(key);
    try {
      const value = JSON.parse(await fs.readFile(this.file(key), 'utf8'));
      if (!value || !Array.isArray(value.posts) || !value.posts.length) return null;
      // Refuse cross-key contamination if a file somehow contains another page key.
      if (value.key && value.key !== key) return null;
      this.mem.set(key, value);
      return value;
    } catch {
      /* missing or corrupt file => cache miss */
    }
    return null;
  }

  /**
   * @returns {{ persisted: boolean }}
   */
  async set(key, value) {
    let persisted = false;
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const target = this.file(key);
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value));
      await fs.rename(tmp, target);
      persisted = true;
    } catch (err) {
      console.error('[cache] disk write failed (memory cache still active until restart):', err.message);
    }
    this.mem.set(key, value);
    return { persisted };
  }
}
