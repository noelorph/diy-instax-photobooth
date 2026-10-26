"""Read-only root filesystem comparison; created containers are never started."""
import hashlib, json, subprocess, tarfile

images = {
    'original': 'public.ecr.aws/supabase/storage-api@sha256:6a32896ae2d1ae2ea2d05ecaf6ed6c8a6b091739b469a8cf860ee89b2604d28f',
    'instrumented': 'instax-multipart-isolated:reviewed',
}
manifests, identities = {}, {}
for label, image in images.items():
    identity = json.loads(subprocess.check_output(['docker','image','inspect',image,'--format','{"id":{{json .Id}},"repoDigests":{{json .RepoDigests}}}']))
    identities[label] = identity
    name = 'instax-multipart-isolated-20261026-export-' + label
    container = subprocess.check_output(['docker','create','--name',name,'--hostname','proof-image','--network','none','--label','qualification-image=instax-multipart-isolated-20261026',image], text=True).strip()
    try:
        export = subprocess.Popen(['docker','export',container], stdout=subprocess.PIPE)
        manifest = {}
        with tarfile.open(fileobj=export.stdout, mode='r|') as archive:
            for entry in archive:
                if entry.isdir():
                    continue
                item = {'mode':entry.mode,'uid':entry.uid,'gid':entry.gid,'type':entry.type.decode(),'link':entry.linkname,'size':entry.size}
                if entry.isfile():
                    digest = hashlib.sha256()
                    source = archive.extractfile(entry)
                    for chunk in iter(lambda:source.read(1024*1024), b''):
                        digest.update(chunk)
                    item['sha256'] = digest.hexdigest()
                manifest[entry.name] = item
        assert export.wait() == 0
        manifests[label] = manifest
    finally:
        subprocess.run(['docker','rm',container],check=True,stdout=subprocess.DEVNULL)

before, after = manifests['original'], manifests['instrumented']
differences = {path:{'original':before.get(path),'instrumented':after.get(path)} for path in sorted(before.keys() | after.keys()) if before.get(path) != after.get(path)}
print(json.dumps({'images':identities,'manifestCounts':{k:len(v) for k,v in manifests.items()},'manifestSha256':{k:hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest() for k,v in manifests.items()},'differences':differences,'comparison':'All non-directory entries, content, type, mode, uid, gid, link, size. Container-generated hosts/resolv/hostname identical. Timestamps excluded.'},indent=2))
assert set(differences) == {'app/dist/storage/protocols/s3/s3-handler.js','app/qualification-hook.cjs'}, 'unexpected root filesystem differences'
hashes=json.load(open('docs/qualification/multipart-isolated/instrumentation/source-hashes.json'))
assert before['app/'+hashes['path']]['sha256']==hashes['originalSha256']
assert after['app/'+hashes['path']]['sha256']==hashes['instrumentedSha256']
