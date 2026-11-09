from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();out=root/'output/parallel/generic-space-paper-root-delivery-1012';assert not out.exists();out.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files=[];patches=[];provenance=[]
for folder,freezeSHA in [('generic-space-paper-bridge-1012','98c04211368236b316bdd6bf4dfedf12b5cf74136fac4b84bacb0ec7f5282973'),('generic-space-paper-ui-1012','4c29dcaee38140f885390cd36be605dc74e20d8b95d788884cca4ec20b628919')]:
 base=root/'output/parallel'/folder;freeze=base/'freeze.json';assert sha(freeze)==freezeSHA
 index=json.loads(freeze.read_text(encoding='utf8'))
 for r in index['files']:assert sha(base/r['path'])==r['sha256'],r['path']
 for r in index.get('references',[]):assert sha(Path(r['path']))==r['sha256'],r['path']
 manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'));patch=base/'candidate.patch';assert sha(patch)==manifest['patchSHA256'];patches.append(patch.read_text(encoding='utf8'))
 for r in manifest['targets']:
  name=r['target'];source=base/r['candidate'];assert sha(source)==r['sha256'];assert not (root/name).exists(),name
  dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
  files.append(dict(target=name,source=str(dest),baselineSha256=None,sha256=r['sha256'],kind='new'))
 provenance.append(dict(folder=folder,freezeSHA256=freezeSHA,manifestSHA256=sha(base/'manifest.json'),filesVerified=len(index['files'])))
patch=out/'generic-space-paper-root.patch';patch.write_text(''.join(patches),encoding='utf8')
(out/'manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(patch),frozenProvenance=provenance),ensure_ascii=False,indent=2),encoding='utf8')
print('Normalized 5 untouched frozen Generic Space delivery files; all own/reference hashes checked.')
