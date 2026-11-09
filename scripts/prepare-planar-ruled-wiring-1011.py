from pathlib import Path
import hashlib,json,difflib
root=Path.cwd().resolve();base=root/'output/parallel/original-planar-ruled-root-wiring-1011';assert not base.exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
old=json.loads((root/'output/audits/original-conic-noncircle-final-1011.json').read_text(encoding='utf8'))
hashes={r['file']:r['sha256'] for r in old['snapshots']}
targets=['src/App.tsx','src/components/TessellationPanel.tsx'];patch=[];rows=[]
def replace(text,old,new,count=1):
    assert text.count(old)==count,(old,text.count(old));return text.replace(old,new)
for name in targets:
    before=(root/name).read_bytes();assert sha(before)==hashes[name],name
    text=before.decode('utf8').replace('\r\n','\n')
    if name=='src/App.tsx':
        text=replace(text,"import ConicNoncircleCPDialog from './components/ConicNoncircleCPDialog';", "import ConicNoncircleCPDialog from './components/ConicNoncircleCPDialog';\nimport PlanarRuledCP4040Dialog from './components/PlanarRuledCP4040Dialog';\nimport {planarRuledCP4040SourceMatches,readPlanarRuledCP4040Recipe} from './app/planarRuledCP4040';")
        text=replace(text,'const conicNoncircleRecipe=useMemo(()=>readConicNoncircleRecipe(doc),[doc]),[conicNoncircleEdit,setConicNoncircleEdit]=useState(false);','const conicNoncircleRecipe=useMemo(()=>readConicNoncircleRecipe(doc),[doc]),[conicNoncircleEdit,setConicNoncircleEdit]=useState(false);\n  const planarRuled4040Recipe=useMemo(()=>readPlanarRuledCP4040Recipe(doc),[doc]),[planarRuled4040Edit,setPlanarRuled4040Edit]=useState(false);')
        text=replace(text,'  function adoptWovenCP(){',"  function adoptPlanarRuled4040CP(next:Doc){try{if(!planarRuledCP4040SourceMatches(next))throw Error('原直纹输入、二维材料或来源身份不一致，未采用。');\n    if(!approveReplace())return false;const regenerating=planarRuled4040Edit&&!!readPlanarRuledCP4040Recipe(docRef.current);\n    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n    setPlanarRuled4040Edit(false);inform('已仅采用原直纹二维三面 CP：未知折痕 U、真实纸边 B。可以编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}\n  function adoptWovenCP(){")
        text=replace(text,'{conicNoncircleRecipe&&<button onClick={()=>setConicNoncircleEdit(true)}>修改原非圆纸面参数</button>}','{conicNoncircleRecipe&&<button onClick={()=>setConicNoncircleEdit(true)}>修改原非圆纸面参数</button>}\n          {planarRuled4040Recipe&&<button onClick={()=>setPlanarRuled4040Edit(true)}>修改原直纹纸面参数</button>}')
        text=replace(text,'onAdoptConicNoncircleCP={adoptConicNoncircleCP} curveEditRequest=','onAdoptConicNoncircleCP={adoptConicNoncircleCP} onAdoptPlanarRuled4040CP={adoptPlanarRuled4040CP} curveEditRequest=')
        anchor='{conicNoncircleEdit&&conicNoncircleRecipe&&<ConicNoncircleCPDialog initialRecipe={conicNoncircleRecipe} projectName={doc.name} onAdopt={adoptConicNoncircleCP} onClose={()=>setConicNoncircleEdit(false)}/>}'
        text=replace(text,anchor,anchor+'\n    {planarRuled4040Edit&&planarRuled4040Recipe&&<PlanarRuledCP4040Dialog initial={planarRuled4040Recipe} onAdoptCP={adoptPlanarRuled4040CP} onClose={()=>setPlanarRuled4040Edit(false)}/>}')
    else:
        text=replace(text,"import ConicNoncircleCPDialog from './ConicNoncircleCPDialog';","import ConicNoncircleCPDialog from './ConicNoncircleCPDialog';\nimport PlanarRuledCP4040Dialog from './PlanarRuledCP4040Dialog';")
        text=replace(text,'onAdoptConicCircleCP,onAdoptConicNoncircleCP}:','onAdoptConicCircleCP,onAdoptConicNoncircleCP,onAdoptPlanarRuled4040CP}:')
        text=replace(text,'onAdoptConicNoncircleCP?:(doc:Doc)=>boolean}){','onAdoptConicNoncircleCP?:(doc:Doc)=>boolean;onAdoptPlanarRuled4040CP?:(doc:Doc)=>boolean}){')
        text=replace(text,"|'conic-noncircle-cp'|","|'conic-noncircle-cp'|'planar-ruled-cp-4040'|")
        anchor="event.target.value==='conic-noncircle-cp'?setDialog('conic-noncircle-cp'):"
        text=replace(text,anchor,anchor+"event.target.value==='planar-ruled-cp-4040'?setDialog('planar-ruled-cp-4040'):",2)
        anchor='<option value="conic-noncircle-cp">原非圆截线 · 有限二维 CP</option>'
        text=replace(text,anchor,anchor+'<option value="planar-ruled-cp-4040">原直纹三面 CP · In[4040]</option>',2)
        anchor="{dialog==='conic-noncircle-cp'&&onAdoptConicNoncircleCP&&<ConicNoncircleCPDialog onClose={()=>setDialog(null)} onAdopt={onAdoptConicNoncircleCP}/>}"
        text=replace(text,anchor,anchor+"\n    {dialog==='planar-ruled-cp-4040'&&<PlanarRuledCP4040Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptPlanarRuled4040CP}/>}")
    after=text.encode('utf8')
    for part,data in [('before',before),('after',after)]:
        file=base/part/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
    patch.extend(difflib.unified_diff(before.decode('utf8').replace('\r\n','\n').splitlines(True),text.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
    rows.append(dict(target=name,baselineSha256=sha(before),sha256=sha(after),source=str(base/'after'/name)))
file=base/'entry.patch';file.write_text(''.join(patch),encoding='utf8')
(base/'manifest.json').write_text(json.dumps(dict(files=rows,patchSha256=sha(file.read_bytes()),originalHelpersWritten=False,entryAndSourceReeditOnly=True),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(targets=len(rows),patch=str(file))))
