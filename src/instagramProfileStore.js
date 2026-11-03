import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isVerifiedHttpsLogoUrl } from './instagramLogo.js';

/**
 * Durable Instagram profile metadata store (separate from post cache files).
 * Files live under CACHE_DIR/instagram-profiles/<sha1>.json
 * Never writes into Facebook/Instagram post cache keys.
 */
export function createInstagramProfileStore(cacheDir) {
  const dir = join(cacheDir, 'instagram-profiles');

  function fileFor(username) {
    const key = String(username || '').toLowerCase();
    return join(dir, `${createHash('sha1').update(`ig-profile:${key}`).digest('hex')}.json`);
  }

  async function get(username) {
    try {
      const raw = JSON.parse(await readFile(fileFor(username), 'utf8'));
      if (!raw || typeof raw !== 'object') return null;
      if (String(raw.username || '').toLowerCase() !== String(username || '').toLowerCase()) return null;
      if (!raw.fetchedAt || !Number.isFinite(Number(raw.fetchedAt))) return null;
      return raw;
    } catch {
      return null;
    }
  }

  /**
   * Persist only when we have a verified username match and at least one HTTPS logo URL.
   * Empty / failed enrichment must not overwrite a good entry.
   */
  async function set(username, value) {
    const u = String(username || '').toLowerCase();
    if (!u || !value || typeof value !== 'object') return { persisted: false };
    if (String(value.username || '').toLowerCase() !== u) return { persisted: false };
    const pic = value.profilePicUrlHD || value.profilePicUrl;
    if (!isVerifiedHttpsLogoUrl(pic)) return { persisted: false };

    const entry = {
      username: u,
      id: value.id != null ? String(value.id) : null,
      fullName: typeof value.fullName === 'string' ? value.fullName : (value.full_name || null),
      profilePicUrl: value.profilePicUrl || null,
      profilePicUrlHD: value.profilePicUrlHD || null,
      fetchedAt: Number(value.fetchedAt) || Date.now(),
      provider: value.provider || 'instagram-profile-apify',
    };

    const target = fileFor(u);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await mkdir(dir, { recursive: true });
        const tmp = `${target}.${process.pid}.${Date.now()}.${attempt}.tmp`;
        await writeFile(tmp, JSON.stringify(entry));
        await rename(tmp, target);
        return { persisted: true, entry };
      } catch (err) {
        if (attempt === 2) {
          console.error('[instagram-profile-store] disk write failed:', err.message);
          return { persisted: false };
        }
        await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
      }
    }
    return { persisted: false };
  }

  function isFresh(entry, ttlMs) {
    if (!entry?.fetchedAt) return false;
    return Date.now() - Number(entry.fetchedAt) < ttlMs;
  }

  return { dir, get, set, isFresh, fileFor };
}
