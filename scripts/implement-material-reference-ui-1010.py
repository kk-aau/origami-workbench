from pathlib import Path
def edit(file, changes):
    p=Path(file); s=p.read_text(encoding='utf8')
    for a,b in changes:
        assert s.count(a)==1,(file,a[:100],s.count(a));s=s.replace(a,b)
    p.write_text(s,encoding='utf8')
edit('src/components/MaterialPieceSelector.tsx', [
    ("import MaterialLinePropertiesDialog from './MaterialLinePropertiesDialog';", "import MaterialLinePropertiesDialog from './MaterialLinePropertiesDialog';\nimport MaterialReferenceFaceDialog from './MaterialReferenceFaceDialog';"),
    ('[propertiesOpen,setPropertiesOpen]=useState(false)', '[referenceOpen,setReferenceOpen]=useState(false),[propertiesOpen,setPropertiesOpen]=useState(false)'),
    ('return <section>{onFaceEdit&&<button', 'return <section>{onFaceEdit&&<button className="outline" onClick={()=>setReferenceOpen(true)}>材料参考面</button>}{referenceOpen&&onFaceEdit&&<MaterialReferenceFaceDialog doc={doc} onApply={onFaceEdit} onClose={()=>setReferenceOpen(false)}/>} {onFaceEdit&&<button')
])
edit('src/components/MaterialCurveModelDialog.tsx', [
    ("import MaterialLinePropertiesDialog from './MaterialLinePropertiesDialog';", "import MaterialLinePropertiesDialog from './MaterialLinePropertiesDialog';\nimport MaterialReferenceFaceDialog from './MaterialReferenceFaceDialog';"),
    ("const description=(r:MaterialGroupRecipe)=>r.kind==='material-line-properties'?", "const description=(r:MaterialGroupRecipe)=>r.kind==='material-reference-face'?(r.face===null?'默认参考面':`参考面 F${r.face+1}`):r.kind==='material-line-properties'?"),
    ("const scope=(r:MaterialGroupRecipe)=>r.kind==='material-line-properties'?", "const scope=(r:MaterialGroupRecipe)=>r.kind==='material-reference-face'?'查看基准':r.kind==='material-line-properties'?"),
    ("return kind==='material-line-properties'?", "return kind==='material-reference-face'?<MaterialReferenceFaceDialog {...props}/>:kind==='material-line-properties'?")
])
edit('src/App.tsx', [
    ("import {buildMaterialLineProperties,type MaterialPropertyOperation} from './core/materialLineProperties';", "import {buildMaterialLineProperties,type MaterialPropertyOperation} from './core/materialLineProperties';\nimport {buildMaterialReferenceFace} from './core/materialReferenceFace';"),
    ('  function applyStartingFace(face:number){try{const next=setStartingFace(doc,face);if(commit(next)){', '''  function commitStartingFace(face:number|null){
    if(!hasMaterialTopology(doc))return commit(face===null?clearStartingFace(doc):setStartingFace(doc,face));
    const recipe={kind:'material-reference-face' as const,face},pure=buildMaterialReferenceFace(doc,recipe);if(!pure.referenceFace!.changed)return true;
    const checked=inspectMaterialCurveModel(doc),last=checked.ok?checked.model.groups.at(-1):null,intent:MaterialFaceEditIntent=last?.recipe.kind==='material-reference-face'?{kind:'material-curve-group-edit',group:last.id,recipe}:{...recipe,parametric:true},result=editMaterialFaces(doc,intent);return commit(result.doc,selected,intent);
  }
  function restoreDefaultStartingFace(){try{if(commitStartingFace(null))inform('已恢复默认起始面，可撤销；材料参数组已同步。');}catch(e){setError(errorText(e));}}
  function applyStartingFace(face:number){try{if(commitStartingFace(face)){'''),
    ("onClick={()=>commit(clearStartingFace(doc))}", "onClick={restoreDefaultStartingFace}"),
    ("if(intent.kind==='material-line-properties'){inform(", "if(intent.kind==='material-reference-face'){inform('已更新材料参考面，可撤销；平折层序需要重新计算。');return true;}if(intent.kind==='material-line-properties'){inform(")
])
with Path('src/components/materialCutDialog.css').open('a',encoding='utf8') as out:
    out.write('\n.material-reference-controls{display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap;flex:none;font-size:11px}.material-reference-controls>label{display:flex;align-items:center;gap:5px}.material-reference-controls select{max-width:170px}.material-reference-feedback{min-height:36px;flex:none;font-size:11px}.material-reference-feedback p{margin:4px 0}@media(max-width:600px){.material-reference-dialog>.note{font-size:10px;line-height:1.4}.material-reference-controls{gap:5px 10px;font-size:10px}.material-reference-dialog .material-face-toolbar{flex-wrap:wrap;gap:4px}}\n')
print('Added visible reference-face editor and routed original starting-face controls through persistent material recipes.')
