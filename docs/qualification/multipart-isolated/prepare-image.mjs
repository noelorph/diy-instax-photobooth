import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseline, docker, project, evidence } from './runtime.mjs';
const dir=mkdtempSync(join(tmpdir(),'instax-multipart-image-'));
const name=`${project}-source`;
const hashes=JSON.parse(readFileSync(new URL('./instrumentation/source-hashes.json',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
try {
  docker(['create','--name',name,'--label',`qualification=${project}`,baseline]);
  docker(['cp',`${name}:/app/${hashes.path}`,join(dir,'handler.js')]);
  const original=readFileSync(join(dir,'handler.js'),'utf8');assert.equal(sha(original),hashes.originalSha256);
  const needle='    await this.storage.db.asSuperUser().createMultipartUpload(\n';assert.equal(original.split(needle).length,2);
  const patched=original.replace(needle,'    await require("/app/qualification-hook.cjs").creationPersistence();\n'+needle);assert.equal(sha(patched),hashes.instrumentedSha256);
  writeFileSync(new URL('./instrumentation/patched-handler.js',import.meta.url),patched);
  evidence('prepared-handler',hashes);
}finally{docker(['rm',name]);rmSync(dir,{recursive:true,force:true});}
