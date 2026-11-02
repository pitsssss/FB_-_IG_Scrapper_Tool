import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Two-level cache: in-memory Map + JSON files on disk (survives restarts). Entries never expire here. */
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
      if (value && Array.isArray(value.posts) && value.posts.length) {
        this.mem.set(key, value);
        return value;
      }
    } catch {
      /* missing or corrupt file => cache miss */
    }
    return null;
  }

  async set(key, value) {
    this.mem.set(key, value);
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const target = this.file(key);
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value));
      await fs.rename(tmp, target); // atomic: a crash never leaves a half-written cache file
    } catch (err) {
      console.error('[cache] disk write failed (memory cache still active):', err.message);
    }
  }
}
