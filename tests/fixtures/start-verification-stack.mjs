import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { selectTestStack } from './test-stack.mjs';

const { workdir, projectId, portBase } = selectTestStack(true);
const config = readFileSync('supabase/config.toml', 'utf8');
assert.match(config, /^project_id = "diy-instax-package-contracts"$/m);
assert.match(config, /^port = 56321$/m);
const generatedConfig = config
  .replace('"diy-instax-package-contracts"', `"${projectId}"`)
  .replace(/\b5632(\d)\b/g, (_, digit) => String(portBase + Number(digit)));
const configPath = resolve(workdir, 'supabase/config.toml');
if (existsSync(configPath) && readFileSync(configPath, 'utf8') !== generatedConfig)
  throw new Error(
    'Verification stack has conflicting generated config; existing files were not changed.'
  );
mkdirSync(resolve(workdir, 'supabase'), { recursive: true });
writeFileSync(configPath, generatedConfig);
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
    `Verification stack startup failed. Inspect the ${projectId} containers; the ordinary stack was not reset.`
  );
}
console.log(
  `Verification stack: 127.0.0.1:${portBase + 1}. Run checks with ${process.env.INSTAX_TEST_PROFILE ? 'INSTAX_TEST_PROFILE=integration' : `INSTAX_TEST_WORKDIR=${workdir}`}`
);
