from pathlib import Path
import hashlib,json,shutil,difflib

root=Path.cwd().resolve()
out=root/'output/parallel/strain-tq-shared-root-stage-1012'
assert not out.exists()
out.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
targets=['src/App.tsx','src/components/TessellationPanel.tsx','src/components/SpaceConstructionMenu.tsx','server.mjs','backend/tessellate.py']
baselines=[]
for name in targets:
    p=root/name
    dest=out/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,dest)
    baselines.append(dict(file=name,before=sha(p)))
def change(name,needle,new,count=1):
    p=out/name
    text=p.read_text(encoding='utf8')
    assert text.count(needle)==count,(name,needle,text.count(needle))
    p.write_text(text.replace(needle,new),encoding='utf8')
app,panel,menu,server,backend=targets
change(app,"import RotationalPleatsCPDialog from './components/RotationalPleatsCPDialog';", "import StrainTQDesignCPDialog from './components/StrainTQDesignCPDialog';\nimport {readStrainTQRecipe,strainTQSourceMatches} from './app/strainTQDesignCP';\nimport RotationalPleatsCPDialog from './components/RotationalPleatsCPDialog';")
change(app,'  const [rotationalPleatsDialog,setRotationalPleatsDialog]=useState<{edit:boolean}|null>(null);','''  const [rotationalPleatsDialog,setRotationalPleatsDialog]=useState<{edit:boolean}|null>(null);
  const strainTQRecipe=useMemo(()=>readStrainTQRecipe(doc),[doc]);
  const [strainTQDialog,setStrainTQDialog]=useState<{edit:boolean}|null>(null);''')
change(app,'  function adoptRotationalPleatsCP(next:Doc):boolean{','''  function adoptStrainTQCP(next:Doc):boolean{
    try{const incoming=readStrainTQRecipe(next);if(!strainTQDialog||!incoming||!strainTQSourceMatches(next))throw Error('TQ 约束设计的原参数、工程极小值、材料与赋型不一致，未采用。');
      if(!approveReplace())return false;const previous=readStrainTQRecipe(docRef.current),regenerating=strainTQDialog.edit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setStrainTQDialog(null);inform('已采用原 TQ 约束设计 CP。可保存、重开与修改完整来源参数；工程求解与三维认证范围在构造窗口显示。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptRotationalPleatsCP(next:Doc):boolean{''')
change(app,'          {rotationalPleatsRecipe&&','          {strainTQRecipe&&<button onClick={()=>setStrainTQDialog({edit:true})}>修改 TQ 约束设计参数</button>}\n          {rotationalPleatsRecipe&&')
change(app,'<TessellationPanel onOpenRotationalPleats','<TessellationPanel onOpenStrainTQDesign={()=>setStrainTQDialog({edit:false})} onOpenRotationalPleats')
change(app,'    {rotationalPleatsDialog&&<RotationalPleatsCPDialog','    {strainTQDialog&&<StrainTQDesignCPDialog initial={strainTQDialog.edit?strainTQRecipe??undefined:undefined} onAdoptCP={adoptStrainTQCP} onClose={()=>setStrainTQDialog(null)}/>}\n    {rotationalPleatsDialog&&<RotationalPleatsCPDialog')
change(panel,'{motherEditor,onOpenRotationalPleats,','{motherEditor,onOpenStrainTQDesign,onOpenRotationalPleats,')
change(panel,'onOpenRotationalPleats?:()=>void;','onOpenStrainTQDesign?:()=>void;onOpenRotationalPleats?:()=>void;')
change(panel,"if(next==='rotational-pleats-cp')","if(next==='strain-tq-design-cp')onOpenStrainTQDesign?.();else if(next==='rotational-pleats-cp')",2)
change(menu,"= 'rotational-pleats-cp'|","= 'strain-tq-design-cp'|'rotational-pleats-cp'|")
change(menu,"dialog('rotational-pleats-cp','原旋转褶纸带 CP'),","dialog('strain-tq-design-cp','原 TQ 约束变形 CP'),dialog('rotational-pleats-cp','原旋转褶纸带 CP'),")
change(server,"url.pathname === '/api/tessellation/rotational-pleats-strain' ||", "url.pathname === '/api/tessellation/strain-tq-practical' || url.pathname === '/api/tessellation/rotational-pleats-strain' ||")
change(server,"const operation=url.pathname==='/api/tessellation/rotational-pleats-strain'", "const operation=url.pathname==='/api/tessellation/strain-tq-practical'?'strain-tq-practical':url.pathname==='/api/tessellation/rotational-pleats-strain'")
change(backend,"    if isinstance(data, dict) and 'operation' in data:\n", "    if isinstance(data, dict) and 'operation' in data:\n        if data['operation'] == 'strain-tq-practical':\n            from tessellation_strain_tq_practical import query_strain_tq_practical\n            return query_strain_tq_practical({k:v for k,v in data.items() if k!='operation'})\n")
rows=[]
patch=[]
for r in baselines:
    name=r['file']
    p=out/name
    assert sha(root/name)==r['before'],name
    patch.extend(difflib.unified_diff((root/name).read_text(encoding='utf8').splitlines(True),p.read_text(encoding='utf8').splitlines(True),fromfile='a/'+name,tofile='b/'+name))
    rows.append(dict(target=name,source=str(p),baselineSha256=r['before'],sha256=sha(p),kind='replace'))
pp=out/'shared-wiring.patch'
pp.write_text(''.join(patch),encoding='utf8')
(out/'manifest.json').write_text(json.dumps(dict(files=rows,patchSha256=sha(pp),preservesParallelDiagramWorkspace=True,requiresFreshBackendAndServerChecks=True),ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared 5 exact shared TQ targets; 37 public source construction entries.')
