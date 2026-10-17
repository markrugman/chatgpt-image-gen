"""Private LAN retention. Default is a plan; --apply archives and verifies before deletion.

Run from the Windows workstation with its existing SSH identity and off-server storage.
Never removes live data, containers or volumes. See docs/SERVER-RETENTION.md.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time

SSH = ['ssh', '-i', str(Path.home()/'.ssh/tpm_debian'), '-o', 'BatchMode=yes', 'debian@192.168.178.96']


def remote(code):
    return subprocess.check_output(SSH+['python3 -'], input=code.encode())


def root_code(code, writable=False):
    return f'''import subprocess
image=subprocess.check_output(['docker','inspect','--format','{{{{.Image}}}}','imagegen-imagegen-1'],text=True).strip()
args=['docker','run','--rm','-i','--log-driver','none','--network','none','--read-only','--user','0:0','--entrypoint','chroot','--mount','type=bind,src=/,dst=/host{'' if writable else ',readonly'}',image,'/host','/usr/bin/python3','-']
subprocess.run(args,input={code.encode()!r},check=True)
'''


PLAN = r'''
from pathlib import Path
import json,re
apps=[];remove=[];keep=[]
pinfile=Path('/home/debian/imagegen-server/retention-pins.json')
pins={a['base']:a for a in json.loads(pinfile.read_text())} if pinfile.exists() else {}
for base,container,kind in [('/home/debian/imagegen-server','imagegen-imagegen-1','imagegen'),('/opt/novel-studio','novel-studio','novel'),('/opt/tales-past-midnight','tales-past-midnight','tpm')]:
 b=Path(base);current=(b/'current').resolve();releases=b/'releases'
 assert current.parent==releases and current.is_dir()
 older=sorted((p for p in releases.iterdir() if p.is_dir() and not p.is_symlink() and p!=current),key=lambda p:p.stat().st_mtime,reverse=True)
 assert older,'No rollback release for '+base
 if base in pins:
  assert str(current)==pins[base]['current'],'Register the qualified deployment before retention: '+base
  rollback=Path(pins[base]['rollback']);assert rollback.is_dir() and rollback.parent==releases
  image=pins[base]['rollbackImage']
 else:rollback=older[0]
 keep.extend([str(current),str(rollback)])
 if base in pins:pass
 elif kind=='imagegen':
  image=re.search(r'^\s+image:\s+(\S+)',(rollback/'server/compose.yaml').read_text(),re.M).group(1)
 elif kind=='novel':image='novel-studio-pro:'+rollback.name.removesuffix('-pro')
 else:image='imagegen-retained/tpm-rollback:'+rollback.name
 apps.append({'base':base,'container':container,'current':str(current),'rollback':str(rollback),'rollbackImage':image})
 remove.extend(str(p) for p in older if p!=rollback)
 backups=b/'backups' if kind=='imagegen' else b/'shared/backups'
 entries=sorted((p for p in backups.iterdir() if not p.is_symlink()),key=lambda p:p.stat().st_mtime,reverse=True)
 keep.extend(str(p) for p in entries[:2]);remove.extend(str(p) for p in entries[2:])
 # Staged archives/binaries have their complete copies in retained releases or off-host archives.
 incoming=b/'incoming'
 if incoming.exists():remove.extend(str(p) for p in incoming.iterdir() if p.is_file() and not p.is_symlink() and p.suffix!='.sh')
recovery=Path('/var/lib/docker/volumes/imagegen_imagegen-data/_data')
zips=sorted(recovery.glob('before-v*.zip'),key=lambda p:p.stat().st_mtime,reverse=True)
keep.extend(str(p) for p in zips[:2]);remove.extend(str(p) for p in zips[2:])
print(json.dumps({'apps':apps,'keep':keep,'remove':remove}))
'''


def fingerprint_code(paths):
    return '''from pathlib import Path
import hashlib,json,os
result={}
for name in NAMES:
 p=Path(name)
 entries=[p]+sorted(p.rglob('*')) if p.is_dir() else [p]
 for f in entries:
  if f.is_symlink():result[str(f)]={'link':os.readlink(f)}
  elif f.is_file():
   with f.open('rb') as stream:result[str(f)]={'sha256':hashlib.file_digest(stream,'sha256').hexdigest(),'size':f.stat().st_size}
  elif f.is_dir():result[str(f)]={'directory':True}
  else:raise RuntimeError('Unsupported artifact: '+str(f))
print(json.dumps(result))
'''.replace('NAMES', repr(paths))


def validate_archive(archive, manifest):
    seen=set()
    with tarfile.open(archive) as source:
        for item in source:
            name='/'+item.name.rstrip('/')
            assert name in manifest, 'Unexpected archive entry: '+name
            expected=manifest[name]
            if item.isfile() or item.islnk():
                with source.extractfile(item) as stream:
                    assert hashlib.file_digest(stream,'sha256').hexdigest()==expected['sha256'], name
            elif item.issym():assert item.linkname==expected['link'], name
            else:assert item.isdir() and expected.get('directory'), name
            seen.add(name)
    assert seen==set(manifest), 'Incomplete off-server archive'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--preflight', action='store_true', help='Require backup/build headroom before a deployment')
    parser.add_argument('--register', action='store_true', help='Record a qualified deployment; previous current becomes rollback')
    args=parser.parse_args()
    # A server-side lock spans the entire workstation transaction, including archiving.
    # The SSH process keeps this descriptor alive until this process exits.
    lock=subprocess.Popen(SSH+['flock -n /home/debian/imagegen-server/.retention.lock sh -c "echo LOCKED; cat >/dev/null"'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    assert lock.stdout.readline().strip()==b'LOCKED', 'Retention is already running'
    try:
        if args.register:
            register="""from pathlib import Path
import json,subprocess,os
p=Path('/home/debian/imagegen-server/retention-pins.json')
assert p.is_file(),'Initial cleanup must finish before registration'
pins=json.loads(p.read_text())
for app in pins:
 current=str((Path(app['base'])/'current').resolve())
 c=json.loads(subprocess.check_output(['docker','inspect',app['container']],text=True))[0]
 working=c['Config']['Labels']['com.docker.compose.project.working_dir']
 assert c['State']['Running'] and working in [current,current+'/server']
 if current!=app['current']:
  assert Path(app['current']).is_dir()
  subprocess.run(['docker','image','inspect',app['currentImage']],check=True,stdout=subprocess.DEVNULL)
  app['rollback']=app['current'];app['rollbackImage']=app['currentImage'];app['current']=current
 app['currentImage']=c['Image']
q=p.with_suffix('.next');q.write_text(json.dumps(pins));q.chmod(0o600);q.replace(p)
print('PASS qualified deployment registered; previous current is pinned as rollback')
"""
            print(remote(register).decode())
        plan=json.loads(remote(root_code(PLAN)))
        state=json.loads(remote("import json,subprocess\nprint(json.dumps(json.loads(subprocess.check_output(['docker','inspect']+"+repr([a['container'] for a in plan['apps']])+",text=True))))"))
        for app,container in zip(plan['apps'],state):
            working=container['Config']['Labels']['com.docker.compose.project.working_dir']
            assert working==app['current'] or working==app['current']+'/server', 'Deployment is in progress; retry after it finishes'
            assert container['State']['Running'], 'A managed application is stopped'
        if args.preflight:
            capacity=json.loads(remote(root_code("from pathlib import Path\nimport json,shutil\nroots=[Path('/var/lib/docker/volumes')/name/'_data' for name in ['imagegen_imagegen-data','imagegen-worker-private']]\nassert all(p.is_dir() for p in roots)\nsize=sum(p.lstat().st_blocks*512 for root in roots for p in root.rglob('*'))\nprint(json.dumps({'free':shutil.disk_usage('/').free,'required':max(5*1024**3,2*size+2*1024**3)}))")))
            assert capacity['free']>=capacity['required'], 'Insufficient disk headroom for a safe backup and build: '+json.dumps(capacity)
            print('PASS deployment disk preflight: '+json.dumps(capacity),flush=True)
        protected={c['Image'] for c in state}
        for app in plan['apps']:
            image=remote('import subprocess\nprint(subprocess.check_output('+repr(['docker','image','inspect','--format','{{.Id}}',app['rollbackImage']])+',text=True).strip())').decode().strip()
            protected.add(image)
        print(json.dumps({'retained':plan['apps'],'archiveCandidates':len(plan['remove']),'apply':args.apply},indent=2),flush=True)
        if not args.apply:return
        root=Path(os.environ['LOCALAPPDATA'])/'ImageGenBuild/server-retention'/time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())
        root.mkdir(parents=True,exist_ok=False)
        (root/'plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
        manifest=json.loads(remote(root_code(fingerprint_code(plan['remove']))))
        (root/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
        if plan['remove']:
            archive=root/'retired-artifacts.tar.gz.partial'
            pack='import sys,tarfile\nwith tarfile.open(fileobj=sys.stdout.buffer,mode="w|gz",compresslevel=1) as tar:\n for name in '+repr(plan['remove'])+':tar.add(name,arcname=name.lstrip("/"))\n'
            with archive.open('wb') as stream:
                subprocess.run(SSH+['python3 -'],input=root_code(pack).encode(),stdout=stream,check=True)
            validate_archive(archive,manifest)
            archive.replace(root/'retired-artifacts.tar.gz')
            assert json.loads(remote(root_code(fingerprint_code(plan['remove']))))==manifest,'Artifacts changed while archiving'
            # Recheck all current pointers immediately before deletion.
            assert json.loads(remote(root_code(PLAN)))==plan,'Deployment changed during retention'
            remove='''from pathlib import Path
import shutil
for name in NAMES:
 p=Path(name)
 assert not p.is_symlink()
 allowed=[Path(a) for a in ROOTS]
 assert any(p.parent==r for r in allowed),name
 assert str(p) not in KEEP
 if p.is_dir():shutil.rmtree(p)
 else:p.unlink()
'''.replace('NAMES',repr(plan['remove'])).replace('ROOTS',repr([
                '/home/debian/imagegen-server/releases', '/home/debian/imagegen-server/backups',
                '/opt/novel-studio/releases', '/opt/novel-studio/shared/backups', '/opt/novel-studio/incoming',
                '/opt/tales-past-midnight/releases', '/opt/tales-past-midnight/shared/backups',
                '/var/lib/docker/volumes/imagegen_imagegen-data/_data',
            ])).replace('KEEP',repr(plan['keep']))
            remote(root_code(remove,True))
        # Preserve every container, including unrelated services and their images.
        all_containers=json.loads(remote("import json,subprocess\nids=subprocess.check_output(['docker','ps','-aq'],text=True).split()\nprint(subprocess.check_output(['docker','inspect']+ids,text=True))"))
        protected.update(c['Image'] for c in all_containers)
        images=json.loads(remote("import json,subprocess\nids=subprocess.check_output(['docker','image','ls','-aq','--no-trunc'],text=True).split()\nprint(subprocess.check_output(['docker','image','inspect']+list(dict.fromkeys(ids)),text=True))"))
        refs=[]
        for image in images:
            if image['Id'] in protected:continue
            refs.extend(image.get('RepoTags') or [image['Id']])
        cleanup='import subprocess,json\nresults=[]\nfor ref in '+repr(refs)+':\n p=subprocess.run(["docker","image","rm",ref],capture_output=True,text=True)\n results.append({"image":ref,"removed":p.returncode==0})\nsubprocess.run(["docker","builder","prune","--all","--force"],check=True)\nprint(json.dumps(results))\n'
        image_results=remote(cleanup).decode()
        after=json.loads(remote("import json,subprocess\nprint(subprocess.check_output(['docker','inspect']+"+repr([a['container'] for a in plan['apps']])+",text=True))"))
        assert [(c['Id'],c['Image'],c['State']['StartedAt'],c['Mounts']) for c in after]==[(c['Id'],c['Image'],c['State']['StartedAt'],c['Mounts']) for c in state]
        (root/'result.json').write_text(json.dumps({'passed':True,'containersUnchanged':True,'imageCleanup':image_results,'retained':plan['apps']}),encoding='utf-8')
        pins=[{**app,'currentImage':container['Image']} for app,container in zip(plan['apps'],state)]
        remote("from pathlib import Path\nimport json\np=Path('/home/debian/imagegen-server/retention-pins.json')\nq=p.with_suffix('.next');q.write_text("+repr(json.dumps(pins))+");q.chmod(0o600);q.replace(p)\n")
        print('PASS archived and verified retired artifacts; current/rollback builds and all live containers/volumes preserved. Evidence: '+str(root),flush=True)
        print(remote("import subprocess\nprint(subprocess.check_output(['df','-h','/'],text=True))").decode())
    finally:
        lock.stdin.close();lock.wait(timeout=15)


if __name__=='__main__':main()
