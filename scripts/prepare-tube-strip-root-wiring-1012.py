from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();out=root/'output/parallel/tube-strip-ui-root-1012'
assert not out.exists()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
targets=['src/App.tsx','src/components/TessellationPanel.tsx','src/components/SpaceConstructionMenu.tsx']
baselines=[]
for name in targets:
 p=root/name;dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 baselines.append(dict(file=name,before=sha(p)))
def change(p,needle,new,n=1):
 s=p.read_text(encoding='utf8');assert s.count(needle)==n,(p,needle,s.count(needle));p.write_text(s.replace(needle,new),encoding='utf8')
app=out/targets[0];panel=out/targets[1];menu=out/targets[2]
change(app,"import SemiGeneralMiuraCPDialog from './components/SemiGeneralMiuraCPDialog';", "import BistableTwistTubeCPDialog from './components/BistableTwistTubeCPDialog';\nimport {readBistableTwistTubeRecipe,bistableTwistTubeSourceMatches} from './app/bistableTwistTubeCP';\nimport FlatTroublewitStripCPDialog from './components/FlatTroublewitStripCPDialog';\nimport {readFlatTroublewitStripRecipe,flatTroublewitStripSourceMatches} from './app/flatTroublewitStripCP';\nimport SemiGeneralMiuraCPDialog from './components/SemiGeneralMiuraCPDialog';")
change(app,'  const [semiGeneralMiuraDialog,setSemiGeneralMiuraDialog]=useState<{edit:boolean}|null>(null);', '''  const [semiGeneralMiuraDialog,setSemiGeneralMiuraDialog]=useState<{edit:boolean}|null>(null);
  const bistableTwistTubeRecipe=useMemo(()=>readBistableTwistTubeRecipe(doc),[doc]);
  const [bistableTwistTubeDialog,setBistableTwistTubeDialog]=useState<{edit:boolean}|null>(null);
  const flatTroublewitStripRecipe=useMemo(()=>readFlatTroublewitStripRecipe(doc),[doc]);
  const [flatTroublewitStripDialog,setFlatTroublewitStripDialog]=useState<{edit:boolean}|null>(null);''')
for title,prefix,read,guard,dialog,state,model in [
 ('双稳态折管','BistableTwistTube','readBistableTwistTubeRecipe','bistableTwistTubeSourceMatches','bistableTwistTubeDialog','setBistableTwistTubeDialog','previous!==null'),
 ('平折路径纸带与 Troublewit','FlatTroublewitStrip','readFlatTroublewitStripRecipe','flatTroublewitStripSourceMatches','flatTroublewitStripDialog','setFlatTroublewitStripDialog','previous?.model===incoming.model')]:
 fn=f'''  function adopt{prefix}CP(next:Doc):boolean{{
    try{{const incoming={read}(next);if(!{dialog}||!incoming||!{guard}(next))throw Error('{title}的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous={read}(docRef.current),regenerating={dialog}.edit&&({model});
      if(regenerating)next={{...next,name:docRef.current.name}};if(!replace(next,regenerating?projectId:null))return false;
      {state}(null);inform('已采用{title} CP。可保存、重开与修改来源参数。');return true;
    }}catch(e){{setError(errorText(e));return false;}}
  }}
'''
 change(app,'  function adoptSemiGeneralMiuraCP(next:Doc):boolean{',fn+'  function adoptSemiGeneralMiuraCP(next:Doc):boolean{')
change(app,'          {semiGeneralMiuraRecipe&&', '''          {bistableTwistTubeRecipe&&<button onClick={()=>setBistableTwistTubeDialog({edit:true})}>修改双稳态折管参数</button>}
          {flatTroublewitStripRecipe&&<button onClick={()=>setFlatTroublewitStripDialog({edit:true})}>修改平折纸带参数</button>}
          {semiGeneralMiuraRecipe&&''')
change(app,'<TessellationPanel onOpenLinearSpace', '<TessellationPanel onOpenBistableTwistTube={()=>setBistableTwistTubeDialog({edit:false})} onOpenFlatTroublewitStrip={()=>setFlatTroublewitStripDialog({edit:false})} onOpenLinearSpace')
change(app,'    {semiGeneralMiuraDialog&&<SemiGeneralMiuraCPDialog', '''    {bistableTwistTubeDialog&&<BistableTwistTubeCPDialog initial={bistableTwistTubeDialog.edit?bistableTwistTubeRecipe??undefined:undefined} onAdoptCP={adoptBistableTwistTubeCP} onClose={()=>setBistableTwistTubeDialog(null)}/>}
    {flatTroublewitStripDialog&&<FlatTroublewitStripCPDialog initial={flatTroublewitStripDialog.edit?flatTroublewitStripRecipe??undefined:undefined} onAdoptCP={adoptFlatTroublewitStripCP} onClose={()=>setFlatTroublewitStripDialog(null)}/>}
    {semiGeneralMiuraDialog&&<SemiGeneralMiuraCPDialog''')
change(panel,'{motherEditor,onOpenLinearSpace,','{motherEditor,onOpenBistableTwistTube,onOpenFlatTroublewitStrip,onOpenLinearSpace,')
change(panel,'onOpenLinearSpace?:()=>void;','onOpenBistableTwistTube?:()=>void;onOpenFlatTroublewitStrip?:()=>void;onOpenLinearSpace?:()=>void;')
change(panel,"if(next==='semigeneral-miura-cp')", "if(next==='bistable-twist-tube-cp')onOpenBistableTwistTube?.();else if(next==='flat-troublewit-strip-cp')onOpenFlatTroublewitStrip?.();else if(next==='semigeneral-miura-cp')",2)
change(menu,"= 'linear-space-polyhedral-cp'|", "= 'bistable-twist-tube-cp'|'flat-troublewit-strip-cp'|'linear-space-polyhedral-cp'|")
change(menu,"dialog('semigeneral-miura-cp','路径波纹／Tachi CP'),", "dialog('semigeneral-miura-cp','路径波纹／Tachi CP'),dialog('bistable-twist-tube-cp','双稳态三角折管 CP'),dialog('flat-troublewit-strip-cp','平折路径纸带／Troublewit CP'),")
patch=[];files=[]
for r in baselines:
 name=r['file'];p=out/name;assert sha(root/name)==r['before'],name
 patch.extend(difflib.unified_diff((root/name).read_text(encoding='utf8').splitlines(True),p.read_text(encoding='utf8').splitlines(True),fromfile='a/'+name,tofile='b/'+name))
 files.append(dict(target=name,source=str(p),baselineSha256=r['before'],sha256=sha(p),kind='replace'))
pp=out/'tube-strip-root-wiring.patch';pp.write_text(''.join(patch),encoding='utf8')
(out/'manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(pp),preservesParallelDiagramWorkspace=True),ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared 3 shared targets against current production, preserving Diagram workspace.')
