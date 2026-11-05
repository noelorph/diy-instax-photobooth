import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workdir = resolve('.worktrees/verification-stack');
const config = readFileSync('supabase/config.toml', 'utf8');
assert.match(config, /^project_id = "diy-instax-package-contracts"$/m);
assert.match(config, /^port = 56321$/m);
mkdirSync(resolve(workdir, 'supabase'), { recursive: true });
writeFileSync(
  resolve(workdir, 'supabase/config.toml'),
  config
    .replace('"diy-instax-package-contracts"', '"diy-instax-retirement-verification"')
    .replace(/\b5632(\d)\b/g, '5832$1')
);
// shortcut: additive migration chain only; replace this fixture when F8 installs its baseline.
cpSync('supabase/migrations', resolve(workdir, 'supabase/migrations'), { recursive: true });
try {
  execFileSync(
    resolve('node_modules/.bin/supabase'),
    ['start', '--workdir', workdir, '-x', 'studio,postgres-meta,edge-runtime,imgproxy'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch {
  throw new Error(
    'Verification stack startup failed. Inspect the diy-instax-retirement-verification containers; the ordinary stack was not reset.'
  );
}
console.log(`Verification stack: 127.0.0.1:58321. Run checks with INSTAX_TEST_WORKDIR=${workdir}`);
