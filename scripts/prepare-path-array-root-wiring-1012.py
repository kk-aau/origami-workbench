from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();old=root/'output/parallel/semigeneral-miura-root-ui-1011';out=root/'output/parallel/path-array-ui-root-1012'
assert not out.exists()
baselines=json.loads((old/'baselines.json').read_text(encoding='utf8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for r in baselines:assert sha(root/r['file'])==r['before'],r['file']
out.mkdir(parents=True)
for p in (old/'src').rglob('*'):
 if p.is_file():
  dest=out/p.relative_to(old);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
(out/'baselines.json').write_text(json.dumps(baselines,ensure_ascii=False,indent=2),encoding='utf8')
def change(p,needle,new,n=1):
 s=p.read_text(encoding='utf8');assert s.count(needle)==n,(p,needle,s.count(needle));p.write_text(s.replace(needle,new),encoding='utf8')
app=out/'src/App.tsx';panel=out/'src/components/TessellationPanel.tsx';menu=out/'src/components/SpaceConstructionMenu.tsx'
change(app,"import SemiGeneralMiuraCPDialog from './components/SemiGeneralMiuraCPDialog';", "import LinearSpacePolyhedralCPDialog from './components/LinearSpacePolyhedralCPDialog';\nimport {readLinearSpacePolyhedralCPRecipe,linearSpacePolyhedralCPSourceMatches} from './app/linearSpacePolyhedralCP';\nimport GeneralSpacerMiuraCPDialog from './components/GeneralSpacerMiuraCPDialog';\nimport {readGeneralSpacerMiuraRecipe,generalSpacerMiuraSourceMatches} from './app/generalSpacerMiuraCP';\nimport SemiGeneralMiuraCPDialog from './components/SemiGeneralMiuraCPDialog';")
change(app,'  const [semiGeneralMiuraDialog,setSemiGeneralMiuraDialog]=useState<{edit:boolean}|null>(null);', '''  const [semiGeneralMiuraDialog,setSemiGeneralMiuraDialog]=useState<{edit:boolean}|null>(null);
  const linearSpaceRecipe=useMemo(()=>readLinearSpacePolyhedralCPRecipe(doc),[doc]);
  const [linearSpaceDialog,setLinearSpaceDialog]=useState<{edit:boolean}|null>(null);
  const generalSpacerRecipe=useMemo(()=>readGeneralSpacerMiuraRecipe(doc),[doc]);
  const [generalSpacerDialog,setGeneralSpacerDialog]=useState<{edit:boolean}|null>(null);''')
for title,prefix,read,guard,dialog,state in [
 ('折链与空间折线纸带','LinearSpace','readLinearSpacePolyhedralCPRecipe','linearSpacePolyhedralCPSourceMatches','linearSpaceDialog','setLinearSpaceDialog'),
 ('一般与嫁接 Miura','GeneralSpacer','readGeneralSpacerMiuraRecipe','generalSpacerMiuraSourceMatches','generalSpacerDialog','setGeneralSpacerDialog')]:
 fn=f'''  function adopt{prefix}CP(next:Doc):boolean{{
    try{{const incoming={read}(next);if(!{dialog}||!incoming||!{guard}(next))throw Error('{title}的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous={read}(docRef.current),regenerating={dialog}.edit&&previous?.model===incoming.model;
      if(regenerating)next={{...next,name:docRef.current.name}};if(!replace(next,regenerating?projectId:null))return false;
      {state}(null);inform('已采用{title} CP。可保存、重开与修改来源参数。');return true;
    }}catch(e){{setError(errorText(e));return false;}}
  }}
'''
 change(app,'  function adoptSemiGeneralMiuraCP(next:Doc):boolean{',fn+'  function adoptSemiGeneralMiuraCP(next:Doc):boolean{')
change(app,'          {semiGeneralMiuraRecipe&&', '''          {linearSpaceRecipe&&<button onClick={()=>setLinearSpaceDialog({edit:true})}>修改折链纸带构造参数</button>}
          {generalSpacerRecipe&&<button onClick={()=>setGeneralSpacerDialog({edit:true})}>修改一般／嫁接 Miura 参数</button>}
          {semiGeneralMiuraRecipe&&''')
change(app,"<TessellationPanel onOpenSemiGeneralMiura", "<TessellationPanel onOpenLinearSpace={()=>setLinearSpaceDialog({edit:false})} onOpenGeneralSpacer={()=>setGeneralSpacerDialog({edit:false})} onOpenSemiGeneralMiura")
change(app,'    {semiGeneralMiuraDialog&&<SemiGeneralMiuraCPDialog', '''    {linearSpaceDialog&&<LinearSpacePolyhedralCPDialog initial={linearSpaceDialog.edit?linearSpaceRecipe??undefined:undefined} onAdoptCP={adoptLinearSpaceCP} onClose={()=>setLinearSpaceDialog(null)}/>}
    {generalSpacerDialog&&<GeneralSpacerMiuraCPDialog initial={generalSpacerDialog.edit?generalSpacerRecipe??undefined:undefined} onAdoptCP={adoptGeneralSpacerCP} onClose={()=>setGeneralSpacerDialog(null)}/>}
    {semiGeneralMiuraDialog&&<SemiGeneralMiuraCPDialog''')
change(panel,'{motherEditor,onOpenSemiGeneralMiura,','{motherEditor,onOpenLinearSpace,onOpenGeneralSpacer,onOpenSemiGeneralMiura,')
change(panel,'onOpenSemiGeneralMiura?:()=>void;','onOpenLinearSpace?:()=>void;onOpenGeneralSpacer?:()=>void;onOpenSemiGeneralMiura?:()=>void;')
change(panel,"if(next==='semigeneral-miura-cp')onOpenSemiGeneralMiura?.();else setDialog(next);","if(next==='semigeneral-miura-cp')onOpenSemiGeneralMiura?.();else if(next==='linear-space-polyhedral-cp')onOpenLinearSpace?.();else if(next==='general-spacer-miura-cp')onOpenGeneralSpacer?.();else setDialog(next);",2)
change(menu,"= 'semigeneral-miura-cp'|","= 'linear-space-polyhedral-cp'|'general-spacer-miura-cp'|'semigeneral-miura-cp'|")
change(menu,"dialog('semigeneral-miura-cp','路径波纹／Tachi CP'),","dialog('general-spacer-miura-cp','一般／嫁接 Miura CP'),dialog('linear-space-polyhedral-cp','折链／空间折线纸带 CP'),dialog('semigeneral-miura-cp','路径波纹／Tachi CP'),")
print('Prepared shared App, Panel and 29-entry menu candidate; production baselines unchanged.')
