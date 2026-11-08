/**
 * Privacy finding classification helpers.
 *
 * Classifies pickaxe / needle matches without logging secret bodies.
 * Safe classes are narrow and context-aware. Unknown or realistic values
 * remain NEEDS_REVIEW even inside tests or docs.
 */

export const PATTERNS = [
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

/** Classes that do not block HISTORICAL_PRIVACY: PASS */
export const SAFE_CLASSES = new Set([
  'SAFE_DETECTOR_NEEDLE',
  'SAFE_NEGATIVE_ASSERTION',
  'SAFE_PREFIX_ONLY',
  'SAFE_EMPTY_ASSIGNMENT',
  'SAFE_PLACEHOLDER_ASSIGNMENT',
  'SAFE_TEMPLATE_ASSIGNMENT',
  'SAFE_DOCS_PROSE',
  'SAFE_REGEX_PATTERN',
]);

const PLACEHOLDER_VALUE =
  /^(change_?me|changeme|your[_-].*|example.*|todo|replace.*|xxx+|null|none|dummy|test|sample|placeholder|smoke|rc)([:_-].*)?$/i;

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isDetectorSourcePath(filePath) {
  const n = filePath.replace(/\\/g, '/');
  return (
    n.endsWith('scripts/privacy-history-audit.mjs') ||
    n.endsWith('scripts/privacy-finding-classify.mjs') ||
    n.endsWith('test/privacy-history-audit.test.js')
  );
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isNegativeAssertionPath(filePath) {
  const n = filePath.replace(/\\/g, '/');
  return (
    n.endsWith('test/public-privacy.test.js') ||
    n.endsWith('test/postman-collection.test.js') ||
    n.endsWith('scripts/generate-postman-collection.mjs') ||
    /postman\/.*\.postman_collection\.json$/i.test(n) ||
    n.includes('docs/release/FINAL_ACCEPTANCE_REPORT.md') ||
    n.includes('docs/release/OWNER_DECISIONS.md') ||
    n.includes('docs/release/RELEASE_') ||
    n.includes('docs/release/GITHUB_SUPPORT_')
  );
}

/**
 * Strip quotes / shell continuations from an env assignment value.
 * Does not return the value to callers of the audit CLI — tests may use it.
 * @param {string} raw
 */
export function unwrapEnvValue(raw) {
  let v = String(raw ?? '').trim();
  // Bash line continuations: KEY=value \
  v = v.replace(/\\\s*$/, '').trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  // Trailing code/prose delimiters from error strings or markdown.
  v = v.replace(/[`'")\];]+$/g, '').trim();
  // If markdown captured past the closing backtick, keep only the first token.
  if (v.includes('`')) v = v.slice(0, v.indexOf('`')).trim();
  return v.trim();
}

/**
 * Classify a single needle occurrence.
 * Never returns the secret body — only a class id.
 *
 * @param {{ patternId: string, filePath: string, line: string, afterNeedle: string, needle: string }} args
 * @returns {{ class: string, safe: boolean }}
 */
export function classifyMatch({ patternId, filePath, line, afterNeedle, needle }) {
  const path = String(filePath || '').replace(/\\/g, '/');
  const ln = String(line || '');
  const after = String(afterNeedle || '');

  if (patternId === 'apify_token_prefix' || patternId === 'meta_page_token_prefix') {
    const body = (after.match(/^[A-Za-z0-9]+/) || [''])[0];
    if (body.length === 0) {
      if (isDetectorSourcePath(path)) return { class: 'SAFE_DETECTOR_NEEDLE', safe: true };
      if (/\[A-Za-z0-9\]/.test(ln) || /\{20,\}/.test(ln) || /RegExp|assert\.|must not|should not|forbidden/i.test(ln)) {
        return { class: 'SAFE_REGEX_PATTERN', safe: true };
      }
      if (isNegativeAssertionPath(path)) return { class: 'SAFE_NEGATIVE_ASSERTION', safe: true };
      return { class: 'SAFE_PREFIX_ONLY', safe: true };
    }
    // Realistic token-shaped bodies are always review — even in tests/docs.
    if (patternId === 'apify_token_prefix' && body.length >= 20) {
      return { class: 'NEEDS_REVIEW_TOKEN_BODY', safe: false };
    }
    if (patternId === 'meta_page_token_prefix' && body.length >= 8) {
      return { class: 'NEEDS_REVIEW_TOKEN_BODY', safe: false };
    }
    if (body.length >= 8) return { class: 'NEEDS_REVIEW_TOKEN_BODY', safe: false };
    if (isDetectorSourcePath(path) || isNegativeAssertionPath(path)) {
      return { class: 'SAFE_NEGATIVE_ASSERTION', safe: true };
    }
    return { class: 'NEEDS_REVIEW_UNEXPECTED_PREFIX', safe: false };
  }

  if (patternId === 'pem_private_key' || patternId === 'pem_rsa_private_key') {
    const looksLikePemBlock =
      /-----BEGIN/.test(ln) && /-----/.test(ln) && !/needle\s*:/.test(ln);
    const hasPemPayload = /BEGIN [A-Z0-9 ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]/.test(
      ln + after.slice(0, 80),
    );
    if (isDetectorSourcePath(path) && (/needle\s*:/.test(ln) || /'BEGIN |\"BEGIN /.test(ln))) {
      return { class: 'SAFE_DETECTOR_NEEDLE', safe: true };
    }
    if (looksLikePemBlock || hasPemPayload) {
      return { class: 'NEEDS_REVIEW_PEM_MATERIAL', safe: false };
    }
    if (isDetectorSourcePath(path) || isNegativeAssertionPath(path)) {
      return { class: 'SAFE_DETECTOR_NEEDLE', safe: true };
    }
    return { class: 'NEEDS_REVIEW_PEM_CONTEXT', safe: false };
  }

  if (patternId === 'aws_access_key_id') {
    const m = (ln + after).match(/AKIA[0-9A-Z]{16}/);
    if (!m) return { class: 'SAFE_PREFIX_ONLY', safe: true };
    if (isDetectorSourcePath(path) && /regex|needle|pattern/i.test(ln)) {
      return { class: 'SAFE_DETECTOR_NEEDLE', safe: true };
    }
    return { class: 'NEEDS_REVIEW_AWS_KEY', safe: false };
  }

  if (patternId.startsWith('env_')) {
    const key = needle.replace(/=$/, '');
    // Markdown / release-doc mentions of the key name (not assignments of secrets)
    if (
      ln.includes('`') &&
      (new RegExp('`' + key + '=`').test(ln) ||
        /pickaxe|pattern hits|values omitted|commitHits|REVIEW_REQUIRED/i.test(ln))
    ) {
      return { class: 'SAFE_DOCS_PROSE', safe: true };
    }

    const assign = ln.match(new RegExp(`${key}=(.*)$`));
    const value = unwrapEnvValue(assign ? assign[1] : after.split(/\s/)[0] || '');

    if (value === '') return { class: 'SAFE_EMPTY_ASSIGNMENT', safe: true };
    if (/^\$\{[A-Za-z0-9_.]+\}$/.test(value) || /\$\{/.test(value) || /^\$[A-Za-z_]/.test(value)) {
      return { class: 'SAFE_TEMPLATE_ASSIGNMENT', safe: true };
    }
    if (/^<.*>$/.test(value) || PLACEHOLDER_VALUE.test(value)) {
      return { class: 'SAFE_PLACEHOLDER_ASSIGNMENT', safe: true };
    }
    // Documented shape examples (not literal secrets)
    if (
      /name:secret/i.test(value) ||
      /\.\.\./.test(value) ||
      /,\s*\.\.\./.test(value) ||
      /^[a-z0-9_]+:CHANGE_ME/i.test(value) ||
      /CHANGE_ME/i.test(value) ||
      /^site\d+:[A-Za-z][A-Za-z0-9_]*(?:,site\d+:[A-Za-z][A-Za-z0-9_]*)*$/i.test(value)
    ) {
      return { class: 'SAFE_DOCS_PROSE', safe: true };
    }
    // Inline code/error examples: e.g. API_KEYS=site1:KEY1,site2:KEY2
    if (/\be\.g\./i.test(ln) && /^[a-z0-9_]+:[a-z0-9_]+(?:,[a-z0-9_]+:[a-z0-9_]+)*$/i.test(value)) {
      return { class: 'SAFE_DOCS_PROSE', safe: true };
    }
    // Smoke / RC writers: name: + template or explicit dummy
    if (/^(smoke|rc):/i.test(value) && (/\$\{/.test(value) || /SMOKE_KEY|apiKey|bootstrap|encKey/.test(ln))) {
      return { class: 'SAFE_TEMPLATE_ASSIGNMENT', safe: true };
    }
    if (isDetectorSourcePath(path) && /needle\s*:/.test(ln)) {
      return { class: 'SAFE_DETECTOR_NEEDLE', safe: true };
    }
    // Non-empty assignment that does not match known synthetic forms
    return { class: 'NEEDS_REVIEW_ENV_VALUE', safe: false };
  }

  return { class: 'NEEDS_REVIEW_UNKNOWN_PATTERN', safe: false };
}

/**
 * Find and classify every needle occurrence in text.
 * @param {{ id: string, needle: string, regex?: string }} pattern
 * @param {string} filePath
 * @param {string} text
 */
export function classifyTextOccurrences(pattern, filePath, text) {
  const out = [];
  if (!text) return out;

  if (pattern.regex) {
    const re = new RegExp(pattern.regex, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const idx = m.index;
      const lineStart = text.lastIndexOf('\n', idx) + 1;
      const lineEnd = text.indexOf('\n', idx);
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const afterNeedle = text.slice(idx + m[0].length, idx + m[0].length + 120);
      const result = classifyMatch({
        patternId: pattern.id,
        filePath,
        line,
        afterNeedle,
        needle: pattern.needle,
      });
      out.push({ path: filePath, ...result });
    }
    return out;
  }

  const needle = pattern.needle;
  let idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1) {
    const lineStart = text.lastIndexOf('\n', idx) + 1;
    const lineEnd = text.indexOf('\n', idx);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const afterNeedle = text.slice(idx + needle.length, idx + needle.length + 120);
    const result = classifyMatch({
      patternId: pattern.id,
      filePath,
      line,
      afterNeedle,
      needle,
    });
    out.push({ path: filePath, ...result });
    idx += needle.length;
  }
  return out;
}

/**
 * Aggregate occurrence classes into a pattern-level verdict.
 * @param {Array<{ class: string, safe: boolean, path?: string }>} occurrences
 */
export function summarizeOccurrences(occurrences) {
  const byClass = {};
  let unresolved = 0;
  const sampleUnresolvedPaths = [];
  for (const o of occurrences) {
    byClass[o.class] = (byClass[o.class] || 0) + 1;
    if (!o.safe) {
      unresolved += 1;
      if (o.path && sampleUnresolvedPaths.length < 8 && !sampleUnresolvedPaths.includes(o.path)) {
        sampleUnresolvedPaths.push(o.path);
      }
    }
  }
  return {
    occurrenceCount: occurrences.length,
    byClass,
    unresolvedCount: unresolved,
    sampleUnresolvedPaths,
    allSafe: occurrences.length > 0 ? unresolved === 0 : true,
  };
}
