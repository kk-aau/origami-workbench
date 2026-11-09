from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();out=root/'output/parallel/cone-space-ui-root-1012';assert not out.exists();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
targets=['src/App.tsx','src/components/TessellationPanel.tsx','src/components/SpaceConstructionMenu.tsx'];baselines=[]
for name in targets:
 p=root/name;dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);baselines.append(dict(file=name,before=sha(p)))
def change(p,needle,new,n=1):
 s=p.read_text(encoding='utf8');assert s.count(needle)==n,(p,needle,s.count(needle));p.write_text(s.replace(needle,new),encoding='utf8')
app=out/targets[0];panel=out/targets[1];menu=out/targets[2]
change(app,"import BistableTwistTubeCPDialog from './components/BistableTwistTubeCPDialog';", "import FlutedMultiSliceConeCPDialog from './components/FlutedMultiSliceConeCPDialog';\nimport {readFlutedMultiSliceConeRecipe,flutedMultiSliceConeSourceMatches} from './app/flutedMultiSliceConeCP';\nimport GenericSpacePaperBridgeDialog from './components/GenericSpacePaperBridgeDialog';\nimport {readGenericSpacePaperRecipe,genericSpacePaperSourceMatches} from './app/genericSpacePaperBridge';\nimport BistableTwistTubeCPDialog from './components/BistableTwistTubeCPDialog';")
change(app,'  const [bistableTwistTubeDialog,setBistableTwistTubeDialog]=useState<{edit:boolean}|null>(null);', '''  const [bistableTwistTubeDialog,setBistableTwistTubeDialog]=useState<{edit:boolean}|null>(null);
  const flutedMultiSliceConeRecipe=useMemo(()=>readFlutedMultiSliceConeRecipe(doc),[doc]);
  const [flutedMultiSliceConeDialog,setFlutedMultiSliceConeDialog]=useState<{edit:boolean}|null>(null);
  const genericSpacePaperRecipe=useMemo(()=>readGenericSpacePaperRecipe(doc),[doc]);
  const [genericSpacePaperDialog,setGenericSpacePaperDialog]=useState<{edit:boolean}|null>(null);''')
for title,prefix,read,guard,dialog,state,model in [
 ('褶锥与多次切片','FlutedMultiSliceCone','readFlutedMultiSliceConeRecipe','flutedMultiSliceConeSourceMatches','flutedMultiSliceConeDialog','setFlutedMultiSliceConeDialog','previous?.model===incoming.model'),
 ('空间曲折有限纸面','GenericSpacePaper','readGenericSpacePaperRecipe','genericSpacePaperSourceMatches','genericSpacePaperDialog','setGenericSpacePaperDialog','previous!==null')]:
 fn=f'''  function adopt{prefix}CP(next:Doc):boolean{{
    try{{const incoming={read}(next);if(!{dialog}||!incoming||!{guard}(next))throw Error('{title}的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous={read}(docRef.current),regenerating={dialog}.edit&&({model});
      if(regenerating)next={{...next,name:docRef.current.name}};if(!replace(next,regenerating?projectId:null))return false;
      {state}(null);inform('已采用{title} CP。可保存、重开与修改来源参数。');return true;
    }}catch(e){{setError(errorText(e));return false;}}
  }}
'''
 change(app,'  function adoptBistableTwistTubeCP(next:Doc):boolean{',fn+'  function adoptBistableTwistTubeCP(next:Doc):boolean{')
change(app,'          {bistableTwistTubeRecipe&&', '''          {flutedMultiSliceConeRecipe&&<button onClick={()=>setFlutedMultiSliceConeDialog({edit:true})}>修改褶锥与切片参数</button>}
          {genericSpacePaperRecipe&&<button onClick={()=>setGenericSpacePaperDialog({edit:true})}>修改空间曲折纸面参数</button>}
          {bistableTwistTubeRecipe&&''')
change(app,'<TessellationPanel onOpenBistableTwistTube', '<TessellationPanel onOpenFlutedMultiSliceCone={()=>setFlutedMultiSliceConeDialog({edit:false})} onOpenGenericSpacePaper={()=>setGenericSpacePaperDialog({edit:false})} onOpenBistableTwistTube')
change(app,'    {bistableTwistTubeDialog&&<BistableTwistTubeCPDialog', '''    {flutedMultiSliceConeDialog&&<FlutedMultiSliceConeCPDialog initial={flutedMultiSliceConeDialog.edit?flutedMultiSliceConeRecipe??undefined:undefined} onAdoptCP={adoptFlutedMultiSliceConeCP} onClose={()=>setFlutedMultiSliceConeDialog(null)}/>}
    {genericSpacePaperDialog&&<GenericSpacePaperBridgeDialog initial={genericSpacePaperDialog.edit?genericSpacePaperRecipe??undefined:undefined} onAdoptCP={adoptGenericSpacePaperCP} onClose={()=>setGenericSpacePaperDialog(null)}/>}
    {bistableTwistTubeDialog&&<BistableTwistTubeCPDialog''')
change(panel,'{motherEditor,onOpenBistableTwistTube,','{motherEditor,onOpenFlutedMultiSliceCone,onOpenGenericSpacePaper,onOpenBistableTwistTube,')
change(panel,'onOpenBistableTwistTube?:()=>void;','onOpenFlutedMultiSliceCone?:()=>void;onOpenGenericSpacePaper?:()=>void;onOpenBistableTwistTube?:()=>void;')
change(panel,"if(next==='bistable-twist-tube-cp')", "if(next==='fluted-multislice-cone-cp')onOpenFlutedMultiSliceCone?.();else if(next==='generic-space-paper-cp')onOpenGenericSpacePaper?.();else if(next==='bistable-twist-tube-cp')",2)
change(menu,"= 'bistable-twist-tube-cp'|", "= 'fluted-multislice-cone-cp'|'generic-space-paper-cp'|'bistable-twist-tube-cp'|")
change(menu,"dialog('bistable-twist-tube-cp','双稳态三角折管 CP'),", "dialog('fluted-multislice-cone-cp','褶锥／多次切片 CP'),dialog('bistable-twist-tube-cp','双稳态三角折管 CP'),")
change(menu,"{label:'曲折纸域 CP',entries:[", "{label:'曲折纸域 CP',entries:[dialog('generic-space-paper-cp','空间曲折 · 有限弦纸张 CP'),")
patch=[];files=[]
for r in baselines:
 name=r['file'];p=out/name;assert sha(root/name)==r['before'],name
 patch.extend(difflib.unified_diff((root/name).read_text(encoding='utf8').splitlines(True),p.read_text(encoding='utf8').splitlines(True),fromfile='a/'+name,tofile='b/'+name));files.append(dict(target=name,source=str(p),baselineSha256=r['before'],sha256=sha(p),kind='replace'))
pp=out/'cone-space-root-wiring.patch';pp.write_text(''.join(patch),encoding='utf8');(out/'manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(pp),preservesParallelDiagramWorkspace=True),ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared 3 shared targets against current production; 33 public space entries, Diagram preserved.')
