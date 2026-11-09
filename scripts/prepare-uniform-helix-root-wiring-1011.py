from pathlib import Path
import hashlib
import json
import difflib

root=Path.cwd().resolve()
base=root/'output/parallel/original-uniform-helix-root-wiring-1011'
assert not base.exists()
base.mkdir()
sha=lambda b:hashlib.sha256(b).hexdigest()
def add(text,anchor,value,count=1):
 assert text.count(anchor)==count,(anchor,text.count(anchor))
 return text.replace(anchor,anchor+value)
def change(text,old,new,count=1):
 assert text.count(old)==count,(old,text.count(old))
 return text.replace(old,new)
expected={'src/App.tsx':'3169a5f4a62cac5af9b7588116be77c14a64898780268f8289e9acb03e53359b',
 'src/components/TessellationPanel.tsx':'0eaf45dd6141d07e727c4c42e18895cbbb44906c9a0a4539de545dea9be2561c'}
rows=[]; patches=[]
for name,value in expected.items():
 before=(root/name).read_bytes(); assert sha(before)==value,name
 old=before.decode('utf8'); text=old
 if name=='src/App.tsx':
  text=add(text,"import {nonuniformSpiralCP3968SourceMatches,readNonuniformSpiralCP3968Recipe} from './app/nonuniformSpiralCP3968';",
   "\nimport UniformHelixCP3951Dialog from './components/UniformHelixCP3951Dialog';\nimport {uniformHelixCP3951SourceMatches,readUniformHelixCP3951Recipe} from './app/uniformHelixCP3951';")
  state='  const nonuniformSpiral3968Recipe=useMemo(()=>readNonuniformSpiralCP3968Recipe(doc),[doc]),[nonuniformSpiral3968Edit,setNonuniformSpiral3968Edit]=useState(false);'
  text=add(text,state,'\n  const uniformHelix3951Recipe=useMemo(()=>readUniformHelixCP3951Recipe(doc),[doc]),[uniformHelix3951Edit,setUniformHelix3951Edit]=useState(false);')
  text=change(text,'  function adoptWovenCP()',
   "  function adoptUniformHelix3951CP(next:Doc){try{if(!uniformHelixCP3951SourceMatches(next))throw Error('原均匀螺旋输入、解析源、二维纸域或材料身份不一致，未采用。');\n"
   "    if(!approveReplace())return false;const regenerating=uniformHelix3951Edit&&!!readUniformHelixCP3951Recipe(docRef.current);\n"
   "    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n"
   "    setUniformHelix3951Edit(false);inform('已采用原均匀螺旋 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}\n  function adoptWovenCP()")
  anchor='          {nonuniformSpiral3968Recipe&&<button onClick={()=>setNonuniformSpiral3968Edit(true)}>修改原非均匀螺旋纸面参数</button>}'
  text=add(text,anchor,'\n          {uniformHelix3951Recipe&&<button onClick={()=>setUniformHelix3951Edit(true)}>修改原均匀螺旋纸面参数</button>}')
  text=add(text,'onAdoptNonuniformSpiral3968CP={adoptNonuniformSpiral3968CP}',' onAdoptUniformHelix3951CP={adoptUniformHelix3951CP}')
  anchor='    {nonuniformSpiral3968Edit&&nonuniformSpiral3968Recipe&&<NonuniformSpiralCP3968Dialog initial={nonuniformSpiral3968Recipe} onAdoptCP={adoptNonuniformSpiral3968CP} onClose={()=>setNonuniformSpiral3968Edit(false)}/>}'
  text=add(text,anchor,'\n    {uniformHelix3951Edit&&uniformHelix3951Recipe&&<UniformHelixCP3951Dialog initial={uniformHelix3951Recipe} onAdoptCP={adoptUniformHelix3951CP} onClose={()=>setUniformHelix3951Edit(false)}/>}')
 else:
  text=add(text,"import NonuniformSpiralCP3968Dialog from './NonuniformSpiralCP3968Dialog';","\nimport UniformHelixCP3951Dialog from './UniformHelixCP3951Dialog';")
  text=change(text,'onAdoptNonuniformSpiral3968CP}', 'onAdoptNonuniformSpiral3968CP,onAdoptUniformHelix3951CP}')
  text=change(text,'onAdoptNonuniformSpiral3968CP?:(doc:Doc)=>boolean}', 'onAdoptNonuniformSpiral3968CP?:(doc:Doc)=>boolean;onAdoptUniformHelix3951CP?:(doc:Doc)=>boolean}')
  text=add(text,"|'nonuniform-spiral-cp-3968'", "|'uniform-helix-cp-3951'")
  text=add(text,"event.target.value==='nonuniform-spiral-cp-3968'?setDialog('nonuniform-spiral-cp-3968'):","event.target.value==='uniform-helix-cp-3951'?setDialog('uniform-helix-cp-3951'):",2)
  text=add(text,'<option value="nonuniform-spiral-cp-3968">原非均匀螺旋内切 CP · In[3968]</option>','<option value="uniform-helix-cp-3951">原均匀螺旋 CP · In[3951]</option>',2)
  anchor="    {dialog==='nonuniform-spiral-cp-3968'&&<NonuniformSpiralCP3968Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptNonuniformSpiral3968CP}/>}"
  text=add(text,anchor,"\n    {dialog==='uniform-helix-cp-3951'&&<UniformHelixCP3951Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptUniformHelix3951CP}/>}")
 after=text.encode('utf8'); saved=base/'files'/name
 saved.parent.mkdir(parents=True,exist_ok=True); saved.write_bytes(after)
 rows.append(dict(target=name,baselineSha256=sha(before),sha256=sha(after),source=str(saved),kind='modified'))
 patches.extend(difflib.unified_diff(old.splitlines(True),text.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
patch=base/'root-wiring.patch'; patch.write_bytes(''.join(patches).encode('utf8'))
manifest=base/'manifest.json'; manifest.write_text(json.dumps(dict(files=rows,patchSha256=sha(patch.read_bytes()),productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
fs=[base/'files'/r['target'] for r in rows]+[patch,manifest]
(base/'freeze.json').write_text(json.dumps(dict(verified=True,files=[dict(file=f.relative_to(root).as_posix(),sha256=sha(f.read_bytes())) for f in fs]),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(prepared=2,sourceDomainUnchanged=True,productionWritten=False)))
