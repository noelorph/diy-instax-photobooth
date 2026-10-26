import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import * as S3 from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validateEventMedia } from '../../../src/lib/events/media-validation.ts';
import { assertClean } from './acceptance.mjs';
import { baseline, start, stop, files, existingStack, evidence, endpoint, docker, storage } from './runtime.mjs';

const mode = process.argv[2] || 'original';
assert.ok(['original','instrumented'].includes(mode));
const bucket = 'isolated-multipart-proof';
const before = existingStack();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(r=>setTimeout(r,ms));
const outcome = async work => { try { const r=await work; return { status:r.$metadata?.httpStatusCode ?? r.status }; } catch(e) {return {status:e.$metadata?.httpStatusCode,code:e.name,...(e.message==='QualificationInjectedPersistenceError'?{injectedError:e.message}:{})};} };
let client, proxy, openRequest, interruptDone, dropNext = false, dropped = 0, stage='startup', pending=0;
function pad(bytes, length, type) {
  const padding=Buffer.alloc(length-bytes.length);
  if(type==='mp4') {padding.writeUInt32BE(padding.length);padding.write('free',4);return Buffer.concat([bytes,padding]);}
  padding.writeUInt32BE(padding.length-12);padding.write('tEXt',4);padding.write('Padding\0',8);padding.writeUInt32BE(crc32(padding.subarray(4,-4)),padding.length-4);
  return Buffer.concat([bytes.subarray(0,-12),padding,bytes.subarray(-12)]);
}
let send;
async function sessions(prefix='') {
  const found=[];let markers={};
  for(let pages=0;pages<100;pages++) {
    const r=await send('ListMultipartUploads',{Prefix:prefix,MaxUploads:1,...markers});found.push(...(r.Uploads||[]));
    if(!r.IsTruncated)return found;
    assert.ok(r.NextKeyMarker&&r.NextUploadIdMarker,'pagination markers');markers={KeyMarker:r.NextKeyMarker,UploadIdMarker:r.NextUploadIdMarker};
  }
  assert.fail('pagination failed to terminate');
}
async function inventory() {return {objects:(await send('ListObjectsV2',{})).Contents||[],sessions:await sessions(),files:files(),pending};}
async function clean(label) {
  // Backend completion has a documented asynchronous directory removal; bounded observation is not a drain claim.
  let observed;
  for(let i=0;i<20;i++){observed=await inventory();if(!observed.files.length)break;await pause(100);}
  evidence(label,observed);assertClean(observed);
}
async function uploadPart(Key,UploadId,PartNumber,bytes,expiresIn=60) {
  const url=await getSignedUrl(client,new S3.UploadPartCommand({Bucket:bucket,Key,UploadId,PartNumber,ContentLength:bytes.length}),{expiresIn});
  const r=await fetch(url,{method:'PUT',body:bytes});assert.equal(r.status,200);return {PartNumber,ETag:r.headers.get('etag')};
}
async function ordinary(bytes,Key,kind,loseComplete=false) {
  const validated=await validateEventMedia(bytes,kind);const {UploadId}=await send('CreateMultipartUpload',{Key,ContentType:validated.contentType});
  const Parts=[];for(let o=0;o<bytes.length;o+=6_000_000)Parts.push(await uploadPart(Key,UploadId,Parts.length+1,bytes.subarray(o,o+6_000_000)));
  assert.equal((await send('ListParts',{Key,UploadId})).Parts.length,Parts.length);
  dropNext=loseComplete;const complete=await outcome(send('CompleteMultipartUpload',{Key,UploadId,MultipartUpload:{Parts}}));
  if(loseComplete){assert.equal(complete.status,undefined);assert.equal(dropped,2);}else assert.equal(complete.status,200);
  const received=Buffer.from(await (await send('GetObject',{Key})).Body.transformToByteArray());
  assert.equal(received.length,bytes.length);assert.equal(sha(received),sha(bytes));assert.deepEqual(await validateEventMedia(received,kind),validated);
  const retry=await outcome(send('CompleteMultipartUpload',{Key,UploadId,MultipartUpload:{Parts}}));assert.equal(retry.status,404);
  evidence('roundtrip',{Key,bytes:bytes.length,sha256:sha(bytes),parts:Parts.length,trustedValidation:validated,actualCompleteResponseDropped:loseComplete,complete,retry});
  await send('DeleteObject',{Key});await clean(`${Key}-cleanup`);
}
try {
  evidence('harness',{files:Object.fromEntries(['proof.mjs','runtime.mjs','acceptance.mjs','package-lock.json'].map(file=>[file,sha(readFileSync(new URL(file,import.meta.url)))])),validatorSha256:sha(readFileSync(new URL('../../../src/lib/events/media-validation.ts',import.meta.url)))});
  const comparison=JSON.parse(readFileSync(new URL('./evidence/image-filesystem-comparison.json',import.meta.url)));
  if(mode==='instrumented')assert.deepEqual(Object.keys(comparison.differences).sort(),['app/dist/storage/protocols/s3/s3-handler.js','app/qualification-hook.cjs']);
  const {credentials,service,anon}=await start(mode==='original'?baseline:comparison.images.instrumented.id);
  evidence('existing-stack-before',{containers:before});
  evidence('mode',{mode,hook:'disabled/unarmed'});
  proxy=createServer((incoming,outgoing)=>{
    const drop=dropNext;dropNext=false;
    const upstream=request(`${endpoint}${incoming.url}`,{method:incoming.method,headers:incoming.headers},response=>{
      if(drop){response.resume();response.on('end',()=>{dropped++;evidence('response-dropped',{upstreamStatus:response.statusCode,completedUpstreamResponses:dropped});outgoing.destroy();});}
      else {outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);}
    });
    upstream.on('error',()=>outgoing.destroy());incoming.on('aborted',()=>upstream.destroy());incoming.pipe(upstream);
  });
  await new Promise(r=>proxy.listen(57432,'127.0.0.1',r));
  client=new S3.S3Client({endpoint:'http://127.0.0.1:57432/s3',region:'local',forcePathStyle:true,maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED',credentials});
  send=async(name,data)=>{pending++;try{return await client.send(new S3[`${name}Command`]({Bucket:bucket,...data}));}finally{pending--;}};
  const created=await fetch(`${endpoint}/bucket`,{method:'POST',headers:{authorization:`Bearer ${service}`,'content-type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:52428800})});assert.equal(created.status,200);
  stage='lost-create-pagination';
  dropNext=true;const lost=await outcome(send('CreateMultipartUpload',{Key:'lost-create'}));assert.equal(lost.status,undefined);assert.equal(dropped,1);
  const recovered=await sessions('lost-create');assert.equal(recovered.length,1);
  await send('CreateMultipartUpload',{Key:'lost-create'});const duplicate=await sessions('lost-create');assert.equal(duplicate.length,2);assert.equal(new Set(duplicate.map(x=>x.UploadId)).size,2);
  for(const u of duplicate)await send('AbortMultipartUpload',{Key:u.Key,UploadId:u.UploadId});
  evidence(stage,{responseActuallyDropped:true,recoveredSessions:recovered.length,duplicateSessions:duplicate.length,maxUploads:1});await clean(`${stage}-cleanup`);
  stage='png-roundtrip';await ordinary(pad(await sharp({create:{width:2,height:2,channels:3,background:'#123456'}}).png().toBuffer(),10_000_000,'png'),'background.png','background');
  stage='mp4-roundtrip-lost-complete';await ordinary(pad(readFileSync(new URL('../../../tests/fixtures/event-media/avc-30s.mp4',import.meta.url)),50_000_000,'mp4'),'montage.mp4','montage',true);
  stage='interrupted-part-resume';
  const Key='interrupted', {UploadId}=await send('CreateMultipartUpload',{Key});
  const bytes=Buffer.alloc(6_000_000,37);
  const url=await getSignedUrl(client,new S3.UploadPartCommand({Bucket:bucket,Key,UploadId,PartNumber:1,ContentLength:bytes.length}),{expiresIn:60});
  let interruptedSettled;
  const interrupted=interruptDone=new Promise(resolve=>{interruptedSettled=resolve;});
  const req=openRequest=request(url,{method:'PUT',headers:{'content-length':bytes.length}},r=>{r.resume();r.on('end',()=>interruptedSettled());});req.on('error',()=>interruptedSettled());req.write(bytes.subarray(0,1_000_000));
  let partial;
  for(let i=0;i<100;i++){partial=files().filter(f=>f.path.endsWith('/part-1'));if(partial.some(f=>f.bytes>=1_000_000))break;await pause(50);}
  assert.ok(partial.some(f=>f.bytes>=1_000_000),'partial bytes observed before disconnect');req.destroy();await interrupted;
  // A later request observes progress after the failed request has finished its error handling.
  await pause(200);
  const part=await uploadPart(Key,UploadId,1,bytes);assert.equal((await send('ListParts',{Key,UploadId})).Parts.length,1);
  await send('CompleteMultipartUpload',{Key,UploadId,MultipartUpload:{Parts:[part]}});
  const resumed=Buffer.from(await(await send('GetObject',{Key})).Body.transformToByteArray());assert.equal(sha(resumed),sha(bytes));
  evidence(stage,{observedPartialBytes:partial[0].bytes,resumedBytes:resumed.length,sha256:sha(resumed)});await send('DeleteObject',{Key});await clean(`${stage}-cleanup`);
  stage='capability-scope-and-expiry';
  const capabilityKey='capability', capability=await send('CreateMultipartUpload',{Key:capabilityKey});
  const signed=await getSignedUrl(client,new S3.UploadPartCommand({Bucket:bucket,Key:capabilityKey,UploadId:capability.UploadId,PartNumber:1,ContentLength:4}),{expiresIn:2});
  const permitted=await fetch(signed,{method:'PUT',body:Buffer.from('part')});await permitted.arrayBuffer();assert.equal(permitted.status,200);
  const denied=[];
  for(const [label,mutate,method] of [
    ['different-bucket',u=>{u.pathname=u.pathname.replace(bucket,bucket+'-other');},'PUT'],
    ['different-key',u=>{u.pathname+='-other';},'PUT'],
    ['different-part',u=>u.searchParams.set('partNumber','2'),'PUT'],
    ['different-session',u=>u.searchParams.set('uploadId','unknown'),'PUT'],
    ['complete',u=>u.searchParams.delete('partNumber'),'POST'],
    ['abort',u=>u.searchParams.delete('partNumber'),'DELETE'],
    ['list-parts',()=>{},'GET'],
    ['create',u=>{u.searchParams.delete('partNumber');u.searchParams.delete('uploadId');u.searchParams.set('uploads','');},'POST'],
  ]) {const u=new URL(signed);mutate(u);const r=await fetch(u,{method,...(method==='PUT'||method==='POST'?{body:Buffer.from('late')}: {})});await r.arrayBuffer();assert.ok(r.status>=400,`${label} denied`);denied.push({operation:label,status:r.status});}
  for(const [label,path,headers,body]of [
    ['standard-upload',`/object/${bucket}/not-permitted`,{'content-type':'application/octet-stream'},'part'],
    ['signed-upload-mint',`/object/upload/sign/${bucket}/not-permitted`,{'content-type':'application/json'},'{}'],
    ['tus-create','/upload/resumable',{'tus-resumable':'1.0.0','upload-length':'4','upload-metadata':`bucketName ${Buffer.from(bucket).toString('base64')},objectName ${Buffer.from('not-permitted').toString('base64')},contentType ${Buffer.from('application/octet-stream').toString('base64')}`},undefined],
  ]){const r=await fetch(`${endpoint}${path}`,{method:'POST',headers:{authorization:`Bearer ${anon}`,...headers},body});const text=await r.text();let detail={};try{detail=JSON.parse(text);}catch{}const denial={operation:label,status:r.status,apiStatus:detail.statusCode,code:/^[A-Za-z]+$/.test(detail.error||'')?detail.error:undefined};evidence('alternate-api-response',denial);assert.ok([401,403].includes(r.status)||['401','403'].includes(String(detail.statusCode)),`${label} authorization denial`);denied.push(denial);}
  await pause(3100);const expired=await fetch(signed,{method:'PUT',body:Buffer.from('late')});await expired.arrayBuffer();assert.ok(expired.status>=400);denied.push({operation:'expired-part',status:expired.status});
  evidence(stage,{denied,permittedPartStatus:200,holder:'HTTP fetch with presigned part and public anon JWT only; no service credentials; no browser UI/CORS qualification'});
  const lateUrl=await getSignedUrl(client,new S3.UploadPartCommand({Bucket:bucket,Key:capabilityKey,UploadId:capability.UploadId,PartNumber:2,ContentLength:4}),{expiresIn:60});
  await send('AbortMultipartUpload',{Key:capabilityKey,UploadId:capability.UploadId});await clean(`${stage}-cleanup`);
  const latePart=await fetch(lateUrl,{method:'PUT',body:Buffer.from('late')});await latePart.arrayBuffer();assert.equal(latePart.status,404);
  const lateComplete=await outcome(send('CompleteMultipartUpload',{Key:capabilityKey,UploadId:capability.UploadId,MultipartUpload:{Parts:[]}}));assert.equal(lateComplete.status,404);
  evidence('late-retries-after-abort',{part:latePart.status,complete:lateComplete});await clean('late-retries-after-abort-cleanup');
  if(mode==='instrumented'){
    evidence('instrumented-disabled-control-result',{result:'PASS',matchingOriginalCases:true,hook:'unarmed'});
    stage='failed-session-persistence';
    assert.equal(docker(['exec',storage,'node','-e',"console.log(require('fs').readdirSync('/qualification-control').length)"]),'0');
    docker(['exec',storage,'node','-e',"require('fs').writeFileSync('/qualification-control/fail-next-create','armed')"]);
    const failed=await outcome(send('CreateMultipartUpload',{Key:'failed-persistence'}));assert.ok(failed.status>=400);assert.equal(failed.injectedError,'QualificationInjectedPersistenceError');
    assert.equal(docker(['exec',storage,'cat','/qualification-control/create-persistence-reached']),'after backend creation; before session persistence');
    assert.equal(docker(['exec',storage,'node','-e',"console.log(require('fs').existsSync('/qualification-control/fail-next-create'))"]),'false');
    const initial=await inventory();evidence('creation-error-observed',{failed,markerTransition:'absent to reached',armConsumed:true,initial});assert.equal(initial.sessions.length,0);
    const residual=initial.files.find(f=>f.path.endsWith('/metadata.json'));assert.ok(residual,'backend metadata exists after failed persistence');
    const orphan=residual.path.match(/multiparts\/([^/]+)\//)?.[1];assert.match(orphan,/^[a-f0-9-]{36}$/);
    const attempts=[];
    for(let i=0;i<2;i++)attempts.push({operation:'abort',...await outcome(send('AbortMultipartUpload',{Key:'failed-persistence',UploadId:orphan}))});
    attempts.push({operation:'late-part',...await outcome(send('UploadPart',{Key:'failed-persistence',UploadId:orphan,PartNumber:1,Body:Buffer.from('late'),ContentLength:4}))});
    attempts.push({operation:'late-complete',...await outcome(send('CompleteMultipartUpload',{Key:'failed-persistence',UploadId:orphan,MultipartUpload:{Parts:[]}}))});
    for(const a of attempts)assert.equal(a.status,404);
    await send('DeleteObject',{Key:'failed-persistence'});
    const subsequent=await send('CreateMultipartUpload',{Key:'after-one-shot'});await send('AbortMultipartUpload',{Key:'after-one-shot',UploadId:subsequent.UploadId});
    evidence('supported-cleanup-and-late-retries',{attempts,subsequentCreateStatus:subsequent.$metadata.httpStatusCode});
    await clean('failed-session-persistence-final-inventory');
  }
  evidence('proof-result',{mode,result:'PASS',stage:'implemented-cases',broaderRaceMatrix:'NOT RUN'});
}catch(error){if(openRequest){openRequest.destroy();await interruptDone;}if(send){try{const observed=await inventory();evidence('failure-inventory',observed);for(const u of observed.sessions)await outcome(send('AbortMultipartUpload',{Key:u.Key,UploadId:u.UploadId}));for(const o of observed.objects)await outcome(send('DeleteObject',{Key:o.Key}));evidence('failure-supported-cleanup-inventory',await inventory());}catch{evidence('failure-inventory',{unavailable:true});}}evidence('proof-result',{mode,result:'FAIL',stage,code:error.name,assertion:error instanceof assert.AssertionError?error.message.split('\n')[0]:error.message.startsWith('Docker command')?error.message:'runtime/API failure',status:error.$metadata?.httpStatusCode});process.exitCode=1;}
finally{
  client?.destroy();if(proxy)await new Promise(r=>proxy.close(r));stop();
  const after=existingStack();assert.deepEqual(after,before);evidence('existing-stack-after',{unchanged:true,containers:after});
}
