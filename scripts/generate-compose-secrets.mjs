#!/usr/bin/env node
/**
 * Generate one-time Compose secrets into .env without overwriting existing values.
 * Usage: node scripts/generate-compose-secrets.mjs
 *        node scripts/generate-compose-secrets.mjs --force-missing
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

function randB64Url(n = 32) {
  return crypto.randomBytes(n).toString('base64url');
}
function randB64(n = 32) {
  return crypto.randomBytes(n).toString('base64');
}

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    map.set(line.slice(0, i).trim(), line.slice(i + 1));
  }
  return map;
}

function upsert(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) {
    return text.replace(re, `${key}=${value}`);
  }
  return `${text.replace(/\s*$/, '')}\n\n# Generated ${new Date().toISOString()}\n${key}=${value}\n`;
}

if (!fs.existsSync(examplePath)) {
  console.error('Missing .env.example');
  process.exit(1);
}

let text = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, 'utf8')
  : fs.readFileSync(examplePath, 'utf8');

const existing = parseEnv(text);
const generated = [];

function ensure(key, factory, { allowEmpty = false } = {}) {
  const cur = existing.get(key);
  if (cur !== undefined && String(cur).trim() !== '') {
    console.log(`keep ${key}=(already set)`);
    return;
  }
  if (cur !== undefined && !allowEmpty && String(cur).trim() === '') {
    const value = factory();
    text = upsert(text, key, value);
    existing.set(key, value);
    generated.push(key);
    console.log(`set  ${key}=(generated)`);
    return;
  }
  if (cur === undefined) {
    const value = factory();
    text = upsert(text, key, value);
    existing.set(key, value);
    generated.push(key);
    console.log(`set  ${key}=(generated)`);
  }
}

ensure('BOOTSTRAP_SETUP_TOKEN', () => randB64Url(32));
ensure('ADMIN_INTERNAL_SECRET', () => randB64Url(32));
ensure('DATA_ENCRYPTION_KEY', () => randB64(32));

// Safe local defaults when missing — never overwrite a configured domain/origin.
if (!existing.get('ADMIN_ALLOWED_ORIGINS') || !String(existing.get('ADMIN_ALLOWED_ORIGINS')).trim()) {
  text = upsert(text, 'ADMIN_ALLOWED_ORIGINS', 'http://127.0.0.1:8080');
  generated.push('ADMIN_ALLOWED_ORIGINS');
  console.log('set  ADMIN_ALLOWED_ORIGINS=http://127.0.0.1:8080');
}
if (!existing.get('ADMIN_COOKIE_SECURE') || String(existing.get('ADMIN_COOKIE_SECURE')).trim() === '') {
  text = upsert(text, 'ADMIN_COOKIE_SECURE', '0');
  generated.push('ADMIN_COOKIE_SECURE');
  console.log('set  ADMIN_COOKIE_SECURE=0');
}
if (!existing.get('TRUST_PROXY') || String(existing.get('TRUST_PROXY')).trim() === '') {
  text = upsert(text, 'TRUST_PROXY', '1');
  generated.push('TRUST_PROXY');
  console.log('set  TRUST_PROXY=1');
}
if (!existing.get('API_DOMAIN') || !String(existing.get('API_DOMAIN')).trim()) {
  text = upsert(text, 'API_DOMAIN', 'localhost');
  generated.push('API_DOMAIN');
  console.log('set  API_DOMAIN=localhost');
}

fs.writeFileSync(envPath, text, { encoding: 'utf8', mode: 0o600 });
console.log(`\nWrote ${envPath}`);
console.log(`Updated keys: ${generated.length ? generated.join(', ') : '(none)'}`);
console.log('Existing secrets were NOT overwritten.');
console.log('Back up DATA_ENCRYPTION_KEY separately from volume backups.');
