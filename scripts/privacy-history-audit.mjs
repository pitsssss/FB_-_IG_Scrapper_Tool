#!/usr/bin/env node
/**
 * Sanitized historical Git privacy audit (pickaxe / -G).
 * Prints counts and classifications only — never prints matched secret values.
 *
 * Usage: node scripts/privacy-history-audit.mjs
 *
 * Exit semantics (stdout marker):
 *   HISTORICAL_PRIVACY: PASS              — hits only classified as synthetic/safe
 *   HISTORICAL_PRIVACY: REVIEW_REQUIRED   — unresolved / realistic credential-shaped hits
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PATTERNS,
  classifyTextOccurrences,
  summarizeOccurrences,
} from './privacy-finding-classify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function commitsForPattern(p) {
  const args = p.regex
    ? ['log', '--all', '-G', p.regex, '--pretty=format:%H']
    : ['log', '--all', '-S', p.needle, '--pretty=format:%H'];
  const out = git(args).trim();
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

function filesWithNeedleAtCommit(commit, p) {
  const args = p.regex
    ? ['grep', '-l', '-E', p.regex, commit]
    : ['grep', '-l', '-F', p.needle, commit];
  const out = git(args).trim();
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      // git grep with commit: "commit:path" or just path depending on version
      const idx = line.indexOf(':');
      if (idx > 0 && /^[0-9a-f]{7,40}$/i.test(line.slice(0, idx))) {
        return line.slice(idx + 1);
      }
      return line.replace(new RegExp(`^${commit}:`), '');
    });
}

function blobAt(commit, filePath) {
  const r = spawnSync('git', ['show', `${commit}:${filePath}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout || '';
}

const commitCount = git(['rev-list', '--all', '--count']).trim();
const findings = [];
let unresolvedPatterns = 0;

for (const p of PATTERNS) {
  const shas = commitsForPattern(p);
  const occurrences = [];
  const pathsSeen = new Set();

  for (const sha of shas) {
    const files = filesWithNeedleAtCommit(sha, p);
    for (const filePath of files) {
      pathsSeen.add(filePath);
      const text = blobAt(sha, filePath);
      if (text == null) {
        occurrences.push({
          path: filePath,
          class: 'NEEDS_REVIEW_UNREADABLE_BLOB',
          safe: false,
        });
        continue;
      }
      occurrences.push(...classifyTextOccurrences(p, filePath, text));
    }
  }

  // Also classify HEAD explicitly (covers uncommitted? no — HEAD only) for reporting
  const headFiles = filesWithNeedleAtCommit('HEAD', p);
  for (const filePath of headFiles) {
    if (pathsSeen.has(filePath) && shas.length > 0) {
      // already covered via some historical commit; still ensure HEAD content classified
    }
    const text = blobAt('HEAD', filePath);
    if (text == null) continue;
    // Deduplicate by re-summarizing all; appending HEAD ensures current tree is covered
    // even when pickaxe commit list is empty but working tree somehow differs (shouldn't).
    if (shas.length === 0) {
      occurrences.push(...classifyTextOccurrences(p, filePath, text));
    }
  }

  // When pickaxe found commits, classify every blob already done.
  // Re-scan HEAD paths once more only if not already in occurrences for that path at HEAD —
  // simplest: if shas non-empty, also merge HEAD classifications for reporting accuracy.
  if (shas.length > 0) {
    for (const filePath of headFiles) {
      const text = blobAt('HEAD', filePath);
      if (text == null) continue;
      occurrences.push(...classifyTextOccurrences(p, filePath, text));
    }
  }

  const summary = summarizeOccurrences(occurrences);
  if (shas.length > 0 && summary.occurrenceCount === 0) {
    // Pickaxe hit but no readable occurrences — force review
    summary.unresolvedCount = 1;
    summary.allSafe = false;
    summary.byClass.NEEDS_REVIEW_EMPTY_OCCURRENCE_SET = 1;
  }

  if (summary.unresolvedCount > 0) unresolvedPatterns += 1;

  findings.push({
    pattern: p.id,
    severity: p.severity,
    commitHits: shas.length,
    sampleCommits: shas.slice(0, 5).map((s) => s.slice(0, 12)),
    pathsSample: [...pathsSeen].slice(0, 12),
    classification: {
      occurrenceCount: summary.occurrenceCount,
      unresolvedCount: summary.unresolvedCount,
      allSafe: summary.allSafe,
      byClass: summary.byClass,
      sampleUnresolvedPaths: summary.sampleUnresolvedPaths,
    },
  });
}

const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
const unresolvedBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
for (const f of findings) {
  if (f.commitHits > 0) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + f.commitHits;
  if (f.classification.unresolvedCount > 0) {
    unresolvedBySeverity[f.severity] =
      (unresolvedBySeverity[f.severity] || 0) + f.classification.unresolvedCount;
  }
}

const needsReview = findings.some((f) => f.classification.unresolvedCount > 0);
const status = needsReview ? 'HISTORICAL_PRIVACY: REVIEW_REQUIRED' : 'HISTORICAL_PRIVACY: PASS';

const report = {
  scannedCommitCount: Number(commitCount) || null,
  findings,
  bySeverity,
  unresolvedBySeverity,
  unresolvedPatternCount: unresolvedPatterns,
  note:
    'Match values intentionally omitted. Synthetic detector needles, empty/CHANGE_ME env assignments, and negative-test prefixes may appear as commitHits but classify as safe. Realistic token bodies remain REVIEW_REQUIRED even in tests/docs.',
  remediation:
    'Rotate any real credentials that appeared historically. Residual GitHub PR refs/caches are a separate owner decision (see docs/release/OWNER_DECISIONS.md).',
  status,
};

console.log(JSON.stringify(report, null, 2));
console.log(status);
process.exitCode = needsReview ? 0 : 0; // informational; CI may parse stdout
