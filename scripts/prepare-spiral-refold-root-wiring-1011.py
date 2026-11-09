from pathlib import Path
import hashlib
import json
import difflib

root=Path.cwd().resolve()
base=root/'output/parallel/original-spiral-refold-root-wiring-1011'
assert not base.exists()
base.mkdir()
sha=lambda b:hashlib.sha256(b).hexdigest()
def add(text,anchor,value,count=1):
 assert text.count(anchor)==count,(anchor,text.count(anchor))
 return text.replace(anchor,anchor+value)
def change(text,old,new,count=1):
 assert text.count(old)==count,(old,text.count(old))
 return text.replace(old,new)
expected={'src/App.tsx':'c365e1f8024c88538834d8f45506203dfa13d21d80c85b2fb41d6c89ccf4076d',
 'src/components/TessellationPanel.tsx':'4436980c99a06811cecc0ef4450ebee204c41d6acf44bf64dfe81d82a463bfe2'}
rows=[]; patches=[]
for name,value in expected.items():
 before=(root/name).read_bytes(); assert sha(before)==value,name
 old=before.decode('utf8'); text=old
 if name=='src/App.tsx':
  text=add(text,"import {uniformHelixCP3951SourceMatches,readUniformHelixCP3951Recipe} from './app/uniformHelixCP3951';",
   "\nimport SpiralRefoldCP3980Dialog from './components/SpiralRefoldCP3980Dialog';\nimport {spiralRefoldCP3980SourceMatches,readSpiralRefoldCP3980Recipe} from './app/spiralRefoldCP3980';")
  state='  const uniformHelix3951Recipe=useMemo(()=>readUniformHelixCP3951Recipe(doc),[doc]),[uniformHelix3951Edit,setUniformHelix3951Edit]=useState(false);'
  text=add(text,state,'\n  const spiralRefold3980Recipe=useMemo(()=>readSpiralRefoldCP3980Recipe(doc),[doc]),[spiralRefold3980Edit,setSpiralRefold3980Edit]=useState(false);')
  text=change(text,'  function adoptWovenCP()',
   "  function adoptSpiralRefold3980CP(next:Doc){try{if(!spiralRefoldCP3980SourceMatches(next))throw Error('原展开再折回输入、递减折角源、二维纸域或材料身份不一致，未采用。');\n"
   "    if(!approveReplace())return false;const regenerating=spiralRefold3980Edit&&!!readSpiralRefoldCP3980Recipe(docRef.current);\n"
   "    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n"
   "    setSpiralRefold3980Edit(false);inform('已采用原展开再折回 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}\n  function adoptWovenCP()")
  anchor='          {uniformHelix3951Recipe&&<button onClick={()=>setUniformHelix3951Edit(true)}>修改原均匀螺旋纸面参数</button>}'
  text=add(text,anchor,'\n          {spiralRefold3980Recipe&&<button onClick={()=>setSpiralRefold3980Edit(true)}>修改原展开再折回纸面参数</button>}')
  text=add(text,'onAdoptUniformHelix3951CP={adoptUniformHelix3951CP}',' onAdoptSpiralRefold3980CP={adoptSpiralRefold3980CP}')
  anchor='    {uniformHelix3951Edit&&uniformHelix3951Recipe&&<UniformHelixCP3951Dialog initial={uniformHelix3951Recipe} onAdoptCP={adoptUniformHelix3951CP} onClose={()=>setUniformHelix3951Edit(false)}/>}'
  text=add(text,anchor,'\n    {spiralRefold3980Edit&&spiralRefold3980Recipe&&<SpiralRefoldCP3980Dialog initial={spiralRefold3980Recipe} onAdoptCP={adoptSpiralRefold3980CP} onClose={()=>setSpiralRefold3980Edit(false)}/>}')
 else:
  text=add(text,"import UniformHelixCP3951Dialog from './UniformHelixCP3951Dialog';","\nimport SpiralRefoldCP3980Dialog from './SpiralRefoldCP3980Dialog';")
  text=change(text,'onAdoptNonuniformSpiral3968CP,onAdoptUniformHelix3951CP}', 'onAdoptNonuniformSpiral3968CP,onAdoptUniformHelix3951CP,onAdoptSpiralRefold3980CP}')
  text=change(text,'onAdoptUniformHelix3951CP?:(doc:Doc)=>boolean}', 'onAdoptUniformHelix3951CP?:(doc:Doc)=>boolean;onAdoptSpiralRefold3980CP?:(doc:Doc)=>boolean}')
  text=add(text,"|'uniform-helix-cp-3951'", "|'spiral-refold-cp-3980'")
  text=add(text,"event.target.value==='uniform-helix-cp-3951'?setDialog('uniform-helix-cp-3951'):","event.target.value==='spiral-refold-cp-3980'?setDialog('spiral-refold-cp-3980'):",2)
  text=add(text,'<option value="uniform-helix-cp-3951">原均匀螺旋 CP · In[3951]</option>','<option value="spiral-refold-cp-3980">原展开再折回 CP · In[3951]</option>',2)
  anchor="    {dialog==='uniform-helix-cp-3951'&&<UniformHelixCP3951Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptUniformHelix3951CP}/>}"
  text=add(text,anchor,"\n    {dialog==='spiral-refold-cp-3980'&&<SpiralRefoldCP3980Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptSpiralRefold3980CP}/>}")
 after=text.encode('utf8'); saved=base/'files'/name
 saved.parent.mkdir(parents=True,exist_ok=True); saved.write_bytes(after)
 rows.append(dict(target=name,baselineSha256=sha(before),sha256=sha(after),source=str(saved),kind='modified'))
 patches.extend(difflib.unified_diff(old.splitlines(True),text.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
patch=base/'root-wiring.patch'; patch.write_bytes(''.join(patches).encode('utf8'))
manifest=base/'manifest.json'; manifest.write_text(json.dumps(dict(files=rows,patchSha256=sha(patch.read_bytes()),productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
fs=[base/'files'/r['target'] for r in rows]+[patch,manifest]
(base/'freeze.json').write_text(json.dumps(dict(verified=True,files=[dict(file=f.relative_to(root).as_posix(),sha256=sha(f.read_bytes())) for f in fs]),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(prepared=2,sourceDomainUnchanged=True,productionWritten=False)))
