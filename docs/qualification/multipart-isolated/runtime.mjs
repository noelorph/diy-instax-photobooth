// Disposable qualification only; never import into the application.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';

export const baseline = 'public.ecr.aws/supabase/storage-api@sha256:6a32896ae2d1ae2ea2d05ecaf6ed6c8a6b091739b469a8cf860ee89b2604d28f';
export const database = 'sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108';
export const project = 'instax-multipart-isolated-20261026';
export const db = `${project}-db`, storage = `${project}-storage`;
export const endpoint = 'http://127.0.0.1:57431';
export const evidence = (name, details = {}) => console.log(JSON.stringify({ timestamp:new Date().toISOString(), name, ...details }));
export function docker(args, options = {}) {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim(); }
  catch (error) { throw Object.assign(new Error(`Docker command failed: ${args[0]}`), { exitStatus: error.status }); }
}
export function existingStack() {
  const ids = docker(['ps', '-aq', '--filter', 'name=diy-instax-package-contracts']).split('\n').filter(Boolean);
  return ids.map(id => JSON.parse(docker(['inspect', id, '--format', '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"started":{{json .State.StartedAt}},"mounts":{{json .Mounts}}}']))).sort((a,b) => a.name.localeCompare(b.name));
}
export function files() {
  return JSON.parse(docker(['exec', storage, 'node', '-e', `const fs=require('fs'),path=require('path'),crypto=require('crypto'),out=[];function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else{const b=fs.readFileSync(p);out.push({path:path.relative('/mnt',p),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}}}walk('/mnt');console.log(JSON.stringify(out.sort((a,b)=>a.path.localeCompare(b.path))));` ]));
}
export async function start(image = baseline, diagnoseStartup = false) {
  assert.equal(docker(['ps', '-aq', '--filter', `label=qualification=${project}`]), '', 'owned resources already exist');
  assert.equal(docker(['volume', 'ls', '-q', '--filter', `label=qualification=${project}`]), '', 'owned volumes already exist');
  const secret = () => randomBytes(32).toString('hex');
  const password = secret(), jwtSecret = secret();
  const credentials = { accessKeyId: secret(), secretAccessKey: secret() };
  const jwt = role => {
    const encoded = [ {alg:'HS256',typ:'JWT'}, {role,iss:'isolated-proof',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200} ].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
    return `${encoded}.${createHmac('sha256', jwtSecret).update(encoded).digest('base64url')}`;
  };
  const service = jwt('service_role'), anon = jwt('anon');
  docker(['network','create','--label',`qualification=${project}`,project]);
  for (const name of ['db','bytes','control']) docker(['volume','create','--label',`qualification=${project}`,`${project}-${name}`]);
  docker(['run','-d','--name',db,'--label',`qualification=${project}`,'--network',project,'--network-alias','db','--env','POSTGRES_PASSWORD','--env','PGDATA=/var/lib/postgresql/data','--mount',`type=volume,src=${project}-db,dst=/var/lib/postgresql/data`,database,'postgres','-D','/var/lib/postgresql/data','-c','listen_addresses=*'], { env: {...process.env, POSTGRES_PASSWORD:password} });
  for (let i=0;;i++) {
    try { docker(['exec', db, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; }
    catch { assert.ok(i<120,'database readiness timeout'); await new Promise(r=>setTimeout(r,500)); }
  }
  docker(['exec','-i',db,'psql','-U','supabase_admin','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'], {input:`ALTER ROLE supabase_storage_admin PASSWORD '${password}';\n`});
  const env = { ...process.env, DATABASE_URL:`postgresql://supabase_storage_admin:${password}@db:5432/postgres`, AUTH_JWT_SECRET:jwtSecret, ANON_KEY:anon, SERVICE_KEY:service, S3_PROTOCOL_ACCESS_KEY_ID:credentials.accessKeyId, S3_PROTOCOL_ACCESS_KEY_SECRET:credentials.secretAccessKey };
  const settings = { STORAGE_BACKEND:'file', FILE_STORAGE_BACKEND_PATH:'/mnt', TENANT_ID:'stub', GLOBAL_S3_BUCKET:'stub', REGION:'local', S3_PROTOCOL_PREFIX:'', S3_PROTOCOL_ENABLED:'true', DB_INSTALL_ROLES:'false', FILE_SIZE_LIMIT:'52428800', ENABLE_IMAGE_TRANSFORMATION:'false', LOG_LEVEL:diagnoseStartup?'error':'silent', PG_QUEUE_ENABLE:'false' };
  docker(['run','-d','--name',storage,'--label',`qualification=${project}`,'--network',project,'--publish','127.0.0.1:57431:5000','--mount',`type=volume,src=${project}-bytes,dst=/mnt`,'--mount',`type=volume,src=${project}-control,dst=/qualification-control`,...Object.keys(env).filter(k => ['DATABASE_URL','AUTH_JWT_SECRET','ANON_KEY','SERVICE_KEY','S3_PROTOCOL_ACCESS_KEY_ID','S3_PROTOCOL_ACCESS_KEY_SECRET'].includes(k)).flatMap(k=>['--env',k]),...Object.entries(settings).flatMap(([k,v])=>['--env',`${k}=${v}`]),image], {env});
  for(let i=0;;i++) {
    try { const r=await fetch(`${endpoint}/status`,{signal:AbortSignal.timeout(2000)}); if(r.ok)break; } catch {}
    if(i>=120 || docker(['inspect',storage,'--format','{{.State.Status}}'])==='exited') { const log=spawnSync('docker',['logs','--tail','30',storage],{encoding:'utf8'}); const raw=log.stdout+log.stderr; let safe=raw; for(const value of [password,jwtSecret,credentials.accessKeyId,credentials.secretAccessKey,service,anon]) safe=safe.replaceAll(value,'[redacted]'); evidence('startup-diagnostic',{state:docker(['inspect',storage,'--format','{{.State.Status}} {{.State.ExitCode}}']),log:safe}); throw new Error('storage readiness timeout'); } await new Promise(r=>setTimeout(r,500));
  }
  evidence('runtime', { project, images:{storage:image,database}, containers:[db,storage].map(name=>({name,id:docker(['inspect',name,'--format','{{.Id}}']),image:docker(['inspect',name,'--format','{{.Image}}'])})), volumes:['db','bytes','control'].map(x=>`${project}-${x}`), network:docker(['network','inspect',project,'--format','{{.Id}}']), endpoint, settings, node:process.version });
  return { credentials, service, anon };
}
export function stop() {
  // Only exact owned resources; this is housekeeping, never cleanup evidence.
  for(const name of [storage,db]) {
    if (docker(['ps','-aq','--filter',`name=^/${name}$`])) {
      assert.equal(docker(['inspect',name,'--format','{{index .Config.Labels "qualification"}}']),project);
      docker(['rm','-f',name]);
    }
  }
  for(const name of ['db','bytes','control']) if(docker(['volume','ls','-q','--filter',`name=^${project}-${name}$`])) docker(['volume','rm',`${project}-${name}`]);
  if(docker(['network','ls','-q','--filter',`name=^${project}$`]))docker(['network','rm',project]);
  evidence('owned-teardown', {project, note:'forced owned-resource teardown; not protocol proof'});
}
