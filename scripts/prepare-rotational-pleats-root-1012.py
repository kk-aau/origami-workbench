from pathlib import Path
import json, hashlib, shutil, difflib

root=Path.cwd().resolve()
out=root/'output/parallel/rotational-pleats-root-stage-1012'
assert not out.exists()
out.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
files=[]
patches=[]
provenance=[]
for folder,manifestSHA,freezeSHA in [
    ('rotational-pleats-strain-1012','c39e9943892d893b60edb953b4aa9dbf9232461f74d1e6978feaa4523e143be8','68981ca51e9bb475a7829f58d7021ed493ed0002f28c1137ddf3013dfa1fcdf2'),
    ('rotational-pleats-ui-1012','ea4d724f732f02ec641d0456fe92877fd3d8c130512d58e133bde6257fc5a98f','c6e4b449081b8ccec58997d3c0771b9087de6605a69d2c739361880bd69cda5b')]:
    base=root/'output/parallel'/folder
    assert sha(base/'manifest.json')==manifestSHA and sha(base/'freeze.json')==freezeSHA
    manifest=json.loads((base/'manifest.json').read_text(encoding='utf8'))
    targets=manifest.get('newTargets',manifest.get('targets',manifest.get('files')))
    assert isinstance(targets,list)
    for r in targets:
        name=r.get('target',r.get('path'))
        source=base/r.get('candidate',r.get('source',''))
        digest=r.get('sha256',r.get('SHA256'))
        assert sha(source)==digest and not (root/name).exists(),name
        dest=out/name
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,dest)
        files.append(dict(target=name,source=str(dest),baselineSha256=None,sha256=digest,kind='new'))
    patch=base/('candidate.patch' if (base/'candidate.patch').exists() else 'root-integration.patch')
    patches.append(patch.read_text(encoding='utf8'))
    provenance.append(dict(folder=folder,manifestSHA256=manifestSHA,freezeSHA256=freezeSHA,patchSHA256=sha(patch)))
pp=out/'new-targets.patch'
pp.write_text(''.join(patches),encoding='utf8')
(out/'new-targets.manifest.json').write_text(json.dumps(dict(files=files,patchSha256=sha(pp),frozenProvenance=provenance),ensure_ascii=False,indent=2),encoding='utf8')

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
app, panel, menu, server, backend=targets
change(app,"import BasicPaperModelsCPDialog from './components/BasicPaperModelsCPDialog';", "import RotationalPleatsCPDialog from './components/RotationalPleatsCPDialog';\nimport {readRotationalPleatsCPRecipe,rotationalPleatsCPSourceMatches} from './app/rotationalPleatsCP';\nimport BasicPaperModelsCPDialog from './components/BasicPaperModelsCPDialog';")
change(app,'  const [basicPaperModelDialog,setBasicPaperModelDialog]=useState<{edit:boolean}|null>(null);','''  const [basicPaperModelDialog,setBasicPaperModelDialog]=useState<{edit:boolean}|null>(null);
  const rotationalPleatsRecipe=useMemo(()=>readRotationalPleatsCPRecipe(doc),[doc]);
  const [rotationalPleatsDialog,setRotationalPleatsDialog]=useState<{edit:boolean}|null>(null);''')
change(app,'  function adoptBasicPaperModelCP(next:Doc):boolean{','''  function adoptRotationalPleatsCP(next:Doc):boolean{
    try{const incoming=readRotationalPleatsCPRecipe(next);if(!rotationalPleatsDialog||!incoming||!rotationalPleatsCPSourceMatches(next))throw Error('旋转褶构造的原参数、工程根、材料与赋型不一致，未采用。');
      if(!approveReplace())return false;const previous=readRotationalPleatsCPRecipe(docRef.current),regenerating=rotationalPleatsDialog.edit&&previous!==null;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setRotationalPleatsDialog(null);inform('已采用原旋转褶纸带 CP。可保存、重开和修改来源参数；三维认证范围在构造窗口显示。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptBasicPaperModelCP(next:Doc):boolean{''')
change(app,'          {basicPaperModelRecipe&&','          {rotationalPleatsRecipe&&<button onClick={()=>setRotationalPleatsDialog({edit:true})}>修改旋转褶构造参数</button>}\n          {basicPaperModelRecipe&&')
change(app,'<TessellationPanel onOpenBasicPaperModels','<TessellationPanel onOpenRotationalPleats={()=>setRotationalPleatsDialog({edit:false})} onOpenBasicPaperModels')
change(app,'    {basicPaperModelDialog&&<BasicPaperModelsCPDialog','    {rotationalPleatsDialog&&<RotationalPleatsCPDialog initial={rotationalPleatsDialog.edit?rotationalPleatsRecipe??undefined:undefined} onAdoptCP={adoptRotationalPleatsCP} onClose={()=>setRotationalPleatsDialog(null)}/>}\n    {basicPaperModelDialog&&<BasicPaperModelsCPDialog')
change(panel,'{motherEditor,onOpenBasicPaperModels,','{motherEditor,onOpenRotationalPleats,onOpenBasicPaperModels,')
change(panel,'onOpenBasicPaperModels?:()=>void;','onOpenRotationalPleats?:()=>void;onOpenBasicPaperModels?:()=>void;')
change(panel,"if(next==='basic-paper-models-cp')","if(next==='rotational-pleats-cp')onOpenRotationalPleats?.();else if(next==='basic-paper-models-cp')",2)
change(menu,"= 'basic-paper-models-cp'|","= 'rotational-pleats-cp'|'basic-paper-models-cp'|")
change(menu,"dialog('basic-paper-models-cp','单纸基础模型 CP'),","dialog('rotational-pleats-cp','原旋转褶纸带 CP'),dialog('basic-paper-models-cp','单纸基础模型 CP'),")
change(server,"url.pathname === '/api/tessellate' ||","url.pathname === '/api/tessellation/rotational-pleats-strain' || url.pathname === '/api/tessellate' ||")
change(server,"const operation=url.pathname===", "const operation=url.pathname==='/api/tessellation/rotational-pleats-strain'?'rotational-pleats-strain':url.pathname===")
change(backend,"    if isinstance(data, dict) and 'operation' in data:\n", "    if isinstance(data, dict) and 'operation' in data:\n        if data['operation'] == 'rotational-pleats-strain':\n            from tessellation_rotational_pleats_strain import query_rotational_pleats_strain\n            return query_rotational_pleats_strain({k:v for k,v in data.items() if k!='operation'})\n")
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
(out/'shared-wiring.manifest.json').write_text(json.dumps(dict(files=rows,patchSha256=sha(pp),preservesParallelDiagramWorkspace=True,requiresFreshBackendAndServerChecks=True),ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared 6 exact new targets and 5 current shared targets; original bounded Root API only.')
