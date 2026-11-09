from pathlib import Path
def edit(file, changes):
    p=Path(file);s=p.read_text(encoding='utf8')
    for a,b in changes:
        assert s.count(a)==1,(file,a[:90],s.count(a));s=s.replace(a,b)
    p.write_text(s,encoding='utf8')
edit('src/components/MaterialPieceSelector.tsx', [
    ("import MaterialReferenceFaceDialog from './MaterialReferenceFaceDialog';", "import MaterialReferenceFaceDialog from './MaterialReferenceFaceDialog';\nimport MaterialAuxiliaryDialog from './MaterialAuxiliaryDialog';"),
    ('[referenceOpen,setReferenceOpen]=useState(false)', '[auxiliaryOpen,setAuxiliaryOpen]=useState(false),[referenceOpen,setReferenceOpen]=useState(false)'),
    ('?<section><button className="outline" onClick={()=>setCurveModelOpen(true)}>参数构造组</button>', '?<section><button className="outline" onClick={()=>setAuxiliaryOpen(true)}>材料辅助线</button>{auxiliaryOpen&&<MaterialAuxiliaryDialog doc={doc} selected={selected} onApply={onFaceEdit} onClose={()=>setAuxiliaryOpen(false)}/>}<button className="outline" onClick={()=>setCurveModelOpen(true)}>参数构造组</button>'),
    ('return <section>{onFaceEdit&&<button', 'return <section>{onFaceEdit&&<button className="outline" onClick={()=>setAuxiliaryOpen(true)}>材料辅助线</button>}{auxiliaryOpen&&onFaceEdit&&<MaterialAuxiliaryDialog doc={doc} selected={selected} onApply={onFaceEdit} onClose={()=>setAuxiliaryOpen(false)}/>} {onFaceEdit&&<button')
])
edit('src/components/MaterialCurveModelDialog.tsx', [
    ("import MaterialReferenceFaceDialog from './MaterialReferenceFaceDialog';", "import MaterialReferenceFaceDialog from './MaterialReferenceFaceDialog';\nimport MaterialAuxiliaryDialog from './MaterialAuxiliaryDialog';"),
    ("const description=(r:MaterialGroupRecipe)=>r.kind==='material-reference-face'?", "const description=(r:MaterialGroupRecipe)=>r.kind==='material-auxiliary'?`${{create:'创建',update:'编辑',remove:'删除'}[r.operation.kind]}辅助线`:r.kind==='material-reference-face'?"),
    ("const scope=(r:MaterialGroupRecipe)=>r.kind==='material-reference-face'?", "const scope=(r:MaterialGroupRecipe)=>r.kind==='material-auxiliary'?'独立参考线':r.kind==='material-reference-face'?"),
    ("return kind==='material-reference-face'?", "return kind==='material-auxiliary'?<MaterialAuxiliaryDialog {...props}/>:kind==='material-reference-face'?")
])
edit('src/App.tsx', [("if(intent.kind==='material-reference-face'){inform(", "if(intent.kind==='material-auxiliary'){inform('已更新材料辅助线并保存参数，可撤销。');return true;}if(intent.kind==='material-reference-face'){inform(")])
with Path('src/components/materialCutDialog.css').open('a',encoding='utf8') as out:
    out.write('\n.material-auxiliary-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;flex:none;font-size:11px}.material-auxiliary-point{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}.material-auxiliary-point>label,.material-auxiliary-target{display:flex;gap:5px;align-items:center}.material-auxiliary-point select{max-width:150px;min-width:0}.material-auxiliary-target{grid-column:1/-1}.material-auxiliary-target select{min-width:0;max-width:100%}.material-auxiliary-point .number-field{margin:0;gap:5px;font-size:11px}.material-auxiliary-point .number-field>span:first-child{width:110px;flex:none}.material-auxiliary-point .number-input{width:110px}.material-auxiliary-feedback{min-height:34px;flex:none;font-size:11px}.material-auxiliary-feedback p{margin:4px 0}.material-auxiliary-dialog>label,.material-auxiliary-dialog>span{flex:none;font-size:11px}.material-auxiliary-dialog .material-face-toolbar{gap:5px;font-size:11px;flex-wrap:wrap}@media(max-width:600px){.material-auxiliary-dialog>.note{font-size:10px;line-height:1.4}.material-auxiliary-fields{gap:5px 8px;font-size:10px}.material-auxiliary-point>label{flex-wrap:wrap}.material-auxiliary-point .number-field{font-size:10px;flex-wrap:wrap}.material-auxiliary-point .number-field>span:first-child{width:75px}.material-auxiliary-point .number-input{width:95px}.material-auxiliary-point select{max-width:140px}.material-auxiliary-feedback{font-size:10px}}\n')
print('Added auxiliary editing entry, stable batch rows, explicit point binding and empty-history editing.')
