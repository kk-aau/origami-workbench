from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();work=root/'output/parallel/cone-space-check-snapshot-002-1012/work';out=root/'output/parallel/cone-space-layout-delta-1012';assert not out.exists();out.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files=[];patch=[]
for name,expected in [('src/components/FlutedMultiSliceConeCPDialog.css','7030c658a1168f51310a81e055de3361ea24af3da6ba93b3b9f9a47b1387f56c'),('src/components/GenericSpacePaperBridgeDialog.css','1a89a1eef9d167afce6fc4e96309e4819731ea40a98adcf0904aaa5146273a61')]:
 p=root/name;assert sha(p)==expected and sha(work/name)==expected,name;s=p.read_text(encoding='utf8')
 if 'Fluted' in name:
  needle='.fmc-plots{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr) minmax(0,1fr)}';assert s.count(needle)==1
  new=s.replace(needle,'.fmc-plots.paired{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)}')
 else:new=s+'\n@media(min-width:1001px) and (max-width:1100px){.gsp-dialog .gsp-plots.paired{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr)}}\n'
 dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(new,encoding='utf8');files.append(dict(target=name,source=str(dest),baselineSha256=expected,sha256=sha(dest),kind='replace'))
 patch.extend(difflib.unified_diff(s.splitlines(True),new.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
 pp=out/'snapshot-before'/name;pp.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(work/name,pp)
patchp=out/'layout.patch';patchp.write_text(''.join(patch),encoding='utf8');(out/'manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(patchp),reason='Keep previews side by side at 1024 desktop width; stacked panes collapsed below usable chart height'),ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared exact CSS delta for both 1024 desktop layouts, no geometry or behavior changes.')
