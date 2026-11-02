import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createApifyQuota } from '../src/apifyQuota.js';

async function main() {
  const config = loadConfig();
  const quota = createApifyQuota({
    stateDir: config.cacheDir,
    dailyLimit: config.apify.dailyRunLimit,
  });
  const s = await quota.getStatus();

  console.log('Apify daily invocation budget (this process only)');
  console.log(`  Today (UTC):              ${s.todayUtc}`);
  console.log(`  State UTC date:           ${s.stateUtcDate ?? '(none yet)'}`);
  console.log(`  Configured daily limit:   ${s.dailyLimit}`);
  console.log(`  Consumed attempts today:  ${s.consumed}`);
  console.log(`  Remaining attempts:       ${s.remaining}`);
  console.log(`  Apify invocation allowed: ${s.allowed ? 'yes' : 'no'}`);
  console.log(`  Quota state readable:     ${s.readable ? 'yes' : 'no'}`);
  if (s.untrusted) console.log('  WARNING: quota state is untrusted — Apify calls are blocked');
  console.log('  Note: limit changes do not reset consumption; UTC midnight resets on next reserve.');
  console.log('  Note: this is NOT a measured USD spend cap for the whole Apify account.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
