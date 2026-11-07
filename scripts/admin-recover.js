#!/usr/bin/env node
/**
 * Host-level administrator password recovery.
 *
 * Usage:
 *   node scripts/admin-recover.js
 *   node --env-file=.env scripts/admin-recover.js
 *   node scripts/admin-recover.js --password '...'   (discouraged; visible in shell history)
 *
 * Requires local filesystem access to MANAGEMENT_DIR.
 * Cannot be invoked over HTTP. Does not touch post caches or Apify quota.
 * Resets password, disables TOTP MFA, clears recovery codes, and revokes sessions.
 */
import readline from 'node:readline';
import { stdin as input, stdout as output, stderr } from 'node:process';
import { loadConfig } from '../src/config.js';
import { createAuthService } from '../src/management/authService.js';

function usage() {
  console.log(`Usage: node scripts/admin-recover.js [--password <new-password>]

Resets the sole administrator password, disables MFA, and revokes all sessions.
Prefer interactive mode (no --password) so the password is not echoed or stored in shell history.
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

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY || !output.isTTY) {
      // Non-interactive (CI/pipes): read a single line from stdin without echo control.
      const rl = readline.createInterface({ input, output: stderr, terminal: false });
      stderr.write(prompt);
      rl.once('line', (line) => {
        rl.close();
        resolve(line);
      });
      rl.once('close', () => resolve(''));
      rl.once('error', reject);
      return;
    }

    const rl = readline.createInterface({ input, output: stderr, terminal: true });
    stderr.write(prompt);
    const onData = (char) => {
      const c = char.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        input.removeListener('data', onData);
        stderr.write('\n');
        rl.close();
        resolve(rl.line || '');
      } else if (c === '\u0003') {
        input.removeListener('data', onData);
        rl.close();
        reject(new Error('Cancelled'));
      } else {
        // Suppress echo by rewriting nothing; readline still buffers into rl.line when terminal:true
        // Fall back: mute by clearing and not printing.
      }
    };

    // Prefer readline.question with muted stdout when available via stdin setRawMode
    try {
      input.setRawMode(true);
    } catch {
      /* ignore */
    }
    let buf = '';
    const rawHandler = (chunk) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          input.removeListener('data', rawHandler);
          try { input.setRawMode(false); } catch { /* ignore */ }
          stderr.write('\n');
          rl.close();
          resolve(buf);
          return;
        }
        if (ch === '\u0003') {
          input.removeListener('data', rawHandler);
          try { input.setRawMode(false); } catch { /* ignore */ }
          rl.close();
          reject(new Error('Cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          buf = buf.slice(0, -1);
          continue;
        }
        if (ch >= ' ' || ch === '\t') buf += ch;
      }
    };
    input.on('data', rawHandler);
    // Keep rl open so process stays alive; unused beyond that.
    void onData;
  });
}

async function promptPassword() {
  const first = await readHidden('New administrator password: ');
  const second = await readHidden('Confirm password: ');
  if (first !== second) {
    throw new Error('Passwords do not match');
  }
  return first;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  let password = args.password;
  if (!password) {
    try {
      password = await promptPassword();
    } catch (err) {
      console.error(err?.message || err);
      process.exit(1);
    }
  } else {
    console.warn('Warning: --password exposes the secret in shell history and process lists. Prefer interactive mode.');
  }

  if (!password) {
    usage();
    process.exit(1);
  }

  const config = loadConfig(process.env);
  const auth = createAuthService({
    managementDir: config.managementDir,
    getSetupToken: () => config.bootstrapSetupToken,
  });
  try {
    const result = await auth.recoverPassword(password);
    if (!result.ok) {
      console.error('Recovery failed:', result.message);
      process.exit(1);
    }
    console.log(`Password reset for administrator "${result.username}"${result.email ? ` <${result.email}>` : ''}.`);
    console.log('MFA (TOTP) and recovery codes were cleared.');
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
