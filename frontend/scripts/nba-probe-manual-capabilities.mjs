// Capability inventory only: no provider/preview requests, credential reads,
// builds, deployments, bindings or production data access.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packages = {};
for (const name of ['cf', '@cloudflare/vite-plugin', 'wrangler', '@cloudflare/dev']) {
  try {
    packages[name] = { installed: true, version: require(`${name}/package.json`).version };
  } catch {
    packages[name] = { installed: false };
  }
}
const globalWrangler = spawnSync('/bin/sh', ['-c', 'command -v wrangler'], { encoding: 'utf8' });
const globalVersion = globalWrangler.status === 0
  ? spawnSync(globalWrangler.stdout.trim(), ['--version'], { encoding: 'utf8', timeout: 15000 })
  : null;
const probe = readFileSync(fileURLToPath(new URL('./nba-readonly-connection-probe.mjs', import.meta.url)));
console.log('R1_MANUAL_CAPABILITIES ' + JSON.stringify({
  at: new Date().toISOString(), node: process.version, packages,
  wranglerOnPath: globalWrangler.status === 0,
  wranglerVersion: globalVersion?.status === 0 ? globalVersion.stdout.trim() : null,
  probeSha256: createHash('sha256').update(probe).digest('hex'),
  diagnosticExecuted: false, providerRequests: 0, productionWrites: 0,
}));
