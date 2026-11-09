from pathlib import Path
import hashlib,json,difflib
root=Path.cwd().resolve();folder=root/'output/parallel/path-array-handle-delta-1012';assert not folder.exists()
name='src/components/CPConstructionPlot.tsx';source=root/name;before=hashlib.sha256(source.read_bytes()).hexdigest();text=source.read_text(encoding='utf8')
needle="points.map(([a,b],i)=><g key={i}>";assert text.count(needle)==1
text=text.replace(needle,"points.map((p,i)=>({p,i})).sort((a,b)=>Number(a.i===selected)-Number(b.i===selected)).map(({p:[a,b],i})=><g key={i}>")
delivery=folder/name;delivery.parent.mkdir(parents=True);delivery.write_text(text,encoding='utf8');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(folder/'candidate.patch').write_text(''.join(difflib.unified_diff(source.read_text(encoding='utf8').splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name)),encoding='utf8')
(folder/'manifest.json').write_text(json.dumps(dict(files=[dict(target=name,source=str(delivery),baselineSha256=before,sha256=sha(delivery),kind='modify')],patchSha256=sha(folder/'candidate.patch'),reason='When multiple XYZ stations share a 2D projection, render the explicitly selected handle last so drag edits the selected station. Original polyline and coordinates unchanged; actual failed run 001 preserved.'),ensure_ascii=False,indent=2),encoding='utf8')
print(before,sha(delivery))
