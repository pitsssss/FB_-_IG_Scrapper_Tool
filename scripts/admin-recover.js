#!/usr/bin/env node
/**
 * Host-level administrator password recovery.
 *
 * Usage:
 *   node scripts/admin-recover.js --password 'new-strong-password'
 *   node --env-file=.env scripts/admin-recover.js --password '...'
 *
 * Requires local filesystem access to MANAGEMENT_DIR.
 * Cannot be invoked over HTTP. Does not touch post caches or Apify quota.
 */
import { loadConfig } from '../src/config.js';
import { createAuthService } from '../src/management/authService.js';

function usage() {
  console.log(`Usage: node scripts/admin-recover.js --password <new-password>

Resets the sole administrator password and revokes all sessions.
Requires host access to MANAGEMENT_DIR (default ./data/management).
Does not delete the management database, post caches, or Apify quota.`);
}

function parseArgs(argv) {
  const out = { password: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--password' || a === '-p') {
      out.password = argv[++i];
    } else if (a.startsWith('--password=')) {
      out.password = a.slice('--password='.length);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.password) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const config = loadConfig(process.env);
  const auth = createAuthService({
    managementDir: config.managementDir,
    getSetupToken: () => config.bootstrapSetupToken,
  });
  try {
    const result = await auth.recoverPassword(args.password);
    if (!result.ok) {
      console.error('Recovery failed:', result.message);
      process.exit(1);
    }
    console.log(`Password reset for administrator "${result.username}".`);
    console.log(`Revoked sessions: ${result.revokedSessions}`);
    console.log('Log in again via the dashboard /login page.');
  } finally {
    auth.close();
  }
}

main().catch((err) => {
  console.error('Recovery error:', err?.message || err);
  process.exit(1);
});
