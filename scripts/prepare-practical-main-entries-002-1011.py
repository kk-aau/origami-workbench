from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();base=root/'output/parallel/practical-main-entries-root-002-1011';old=root/'output/parallel/practical-main-entries-root-1011';assert not base.exists();base.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rows=[];patch=''
for row in json.loads((old/'manifest.json').read_text(encoding='utf8'))['files']:
 name=row['target'];current=root/name;assert sha(current)==row['baselineSha256'];text=Path(row['source']).read_text(encoding='utf8')
 if name.endswith('LinkedBandsPlanarCP4086Dialog.tsx'):
  a='setView(v=>({...v,zoom:Math.max(.05,Math.min(20,v.zoom*factor)),x:p.x-(p.x-v.x)*factor,y:p.y-(p.y-v.y)*factor}));'
  b="const xs=doc.segments.flatMap(s=>[s.a[0],s.b[0]]),ys=doc.segments.flatMap(s=>[s.a[1],s.b[1]]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;setView(v=>{const zoom=Math.max(.05,Math.min(20,v.zoom*factor)),ratio=zoom/v.zoom;return {zoom,x:p.x-cx-(p.x-cx-v.x)*ratio,y:p.y-cy-(p.y-cy-v.y)*ratio};});"
  assert text.count(a)==1;text=text.replace(a,b)
  a='font=12.1/Math.min(size.w/vw,size.h/vh)';assert text.count(a)==1;text=text.replace(a,'font=12.1*view.zoom/Math.min(size.w/vw,size.h/vh)')
 before=current.read_text(encoding='utf8');saved=base/'before'/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(current,saved)
 dst=base/'files'/name;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(text,encoding='utf8',newline='\n')
 rows.append(dict(row,sha256=sha(dst),source=str(dst.resolve())))
 patch+=''.join(difflib.unified_diff(before.splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name))
p=base/'entries.patch';p.write_text(patch,encoding='utf8',newline='\n');(base/'manifest.json').write_text(json.dumps({'files':rows,'patchSha256':sha(p),'rootEntries':True,'mathAndCoordinateConversionsUnchanged':True,'previousCandidateNotIntegrated':str(old.relative_to(root))},ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared four entry/view targets, correcting wheel anchoring and zoom label size before integration.')
