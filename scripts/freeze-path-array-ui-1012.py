from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();folder=root/'output/parallel/path-array-ui-root-1012';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert not (folder/'manifest.json').exists()
refs=[]
for name,digest in [('linear-space-root-ui-1012','026e3d720ebfa68b97530ef7746c3eadb7c4d0c75f6be689c72e6c530a9da762'),('general-spacer-root-ui-1012','5d62e1b7391e15a9ea3967b39a88ee804e0d28de62b939213c0017e88f7f680f')]:
 p=root/'output/parallel'/name/'manifest.json';assert sha(p)==digest
 manifest=json.loads(p.read_text(encoding='utf8'));refs.append(dict(path=p.relative_to(root).as_posix(),sha256=digest))
 for r in manifest['files']:
  src=Path(r['source']);assert sha(src)==r['sha256'];dest=folder/r['target'];assert not dest.exists();dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
baseline={r['file']:r['before'] for r in json.loads((folder/'baselines.json').read_text(encoding='utf8'))}
rows=[];patch=[]
for p in sorted((folder/'src').rglob('*')):
 if not p.is_file():continue
 name=p.relative_to(folder).as_posix();target=root/name;before=sha(target) if target.exists() else None;assert before==baseline.get(name),name
 rows.append(dict(target=name,source=str(p),baselineSha256=before,sha256=sha(p),kind='modify' if before else 'new'))
 patch.extend(difflib.unified_diff(target.read_text(encoding='utf8').splitlines(keepends=True) if before else [],p.read_text(encoding='utf8').splitlines(keepends=True),fromfile='a/'+name if before else '/dev/null',tofile='b/'+name))
assert len(rows)==10,len(rows)
(folder/'candidate.patch').write_text(''.join(patch),encoding='utf8')
(folder/'manifest.json').write_text(json.dumps(dict(files=rows,patchSha256=sha(folder/'candidate.patch'),references=refs,scope='Actual current main App routes plus 8 source model editors; actual acceptance still pending'),ensure_ascii=False,indent=2),encoding='utf8')
print('Frozen 10 UI files; existing App/Panel/Menu baseline preserved, 7 new UI targets verified absent.')
