#!/usr/bin/env node
/**
 * Sanitized historical Git privacy audit (pickaxe / -G).
 * Prints counts and categories only — never prints matched secret values.
 *
 * Usage: node scripts/privacy-history-audit.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PATTERNS = [
  { id: 'apify_token_prefix', needle: 'apify_api_', severity: 'critical' },
  { id: 'meta_page_token_prefix', needle: 'EAACEdEose0cBA', severity: 'critical' },
  { id: 'pem_private_key', needle: 'BEGIN PRIVATE KEY', severity: 'critical' },
  { id: 'pem_rsa_private_key', needle: 'BEGIN RSA PRIVATE KEY', severity: 'critical' },
  { id: 'aws_access_key_id', needle: 'AKIA', severity: 'high', regex: 'AKIA[0-9A-Z]{16}' },
  { id: 'env_apify_assignment', needle: 'APIFY_TOKEN=', severity: 'high' },
  { id: 'env_api_keys_assignment', needle: 'API_KEYS=', severity: 'high' },
  { id: 'env_bootstrap_assignment', needle: 'BOOTSTRAP_SETUP_TOKEN=', severity: 'high' },
  { id: 'env_encryption_assignment', needle: 'DATA_ENCRYPTION_KEY=', severity: 'high' },
];

function git(args) {
  const r = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // status 1 = no matches for log -S/-G in some git versions; treat as empty
  if (r.status !== 0 && r.status !== 1) {
    throw new Error(r.stderr || `git ${args[0]} failed (${r.status})`);
  }
  return r.stdout || '';
}

const commitCount = git(['rev-list', '--all', '--count']).trim();
const findings = [];

for (const p of PATTERNS) {
  const args = p.regex
    ? ['log', '--all', '-G', p.regex, '--pretty=format:%H']
    : ['log', '--all', '-S', p.needle, '--pretty=format:%H'];
  const out = git(args).trim();
  const shas = out ? out.split(/\r?\n/).filter(Boolean) : [];
  // Filter false positives for placeholders where possible by checking HEAD only for example files
  findings.push({
    pattern: p.id,
    severity: p.severity,
    commitHits: shas.length,
    sampleCommits: shas.slice(0, 5).map((s) => s.slice(0, 12)),
  });
}

const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
for (const f of findings) {
  if (f.commitHits > 0) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + f.commitHits;
}

const summary = {
  scannedCommitCount: Number(commitCount) || null,
  findings,
  bySeverity,
  note: 'Match values intentionally omitted. Placeholder assignments in .env.example may cause env_* hits — review sample commits privately.',
  remediation: 'Rotate any real credentials that appeared historically. History rewrite requires owner approval (see docs/release/OWNER_DECISIONS.md).',
};

console.log(JSON.stringify(summary, null, 2));

const needsReview = findings.some((f) => f.commitHits > 0 && (f.severity === 'critical' || f.severity === 'high'));
console.log(needsReview ? 'HISTORICAL_PRIVACY: REVIEW_REQUIRED' : 'HISTORICAL_PRIVACY: CLEAN_OR_LOW');
