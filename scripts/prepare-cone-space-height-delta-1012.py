from pathlib import Path
import hashlib,json,difflib,shutil
root=Path.cwd().resolve();name='src/components/GenericSpacePaperBridgeDialog.css';work=root/'output/parallel/cone-space-check-snapshot-005-1012/work';out=root/'output/parallel/cone-space-height-delta-1012';assert not out.exists();out.mkdir();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=root/name;before=sha(p);assert before==sha(work/name);s=p.read_text(encoding='utf8')
new=s+'\n@media(max-height:690px){.gsp-workspace>aside{gap:4px}.gsp-dialog .gsp-functions{padding:5px 0;gap:3px}.gsp-functions input{height:25px;min-height:25px}.gsp-functions>strong{line-height:1.2}.gsp-dialog .gsp-fields label{line-height:1.2;gap:3px}.gsp-dialog .gsp-fields input,.gsp-dialog .gsp-fields select{height:25px;min-height:25px}.gsp-angle{line-height:1.2}.gsp-angle input{height:17px;min-height:17px}.gsp-dialog .sgm-restore{min-height:25px}}\n'
dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(new,encoding='utf8');patch=out/'height.patch';patch.write_text(''.join(difflib.unified_diff(s.splitlines(True),new.splitlines(True),fromfile='a/'+name,tofile='b/'+name)),encoding='utf8')
(out/'manifest.json').write_text(json.dumps(dict(files=[dict(target=name,source=str(dest),baselineSha256=before,sha256=sha(dest),kind='replace')],patchSha256=sha(patch),reason='Fit all space-curve controls and hint above the footer at 640px without shrinking charts or hiding controls'),ensure_ascii=False,indent=2),encoding='utf8')
saved=out/'before'/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(work/name,saved)
print('Prepared compact space-curve input rows; geometry and algorithms unchanged.')
