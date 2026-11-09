from pathlib import Path
def edit(file, changes):
    p=Path(file); s=p.read_text(encoding='utf8')
    for a,b in changes:
        assert s.count(a)==1,(file,a[:110],s.count(a));s=s.replace(a,b)
    p.write_text(s,encoding='utf8')
edit('src/core/materialFaceCommon.ts', [('export type MaterialFaceEditResult={referenceFace?', 'export type MaterialFaceEditResult={auxiliary?:{createdIds:string[];createdKeys:string[];changedIds:string[];removedIds:string[]};referenceFace?')])
edit('src/core/materialFaceEdit.ts', [
    ("import {editMaterialReferenceFace,type MaterialReferenceFaceIntent} from './materialReferenceFace';", "import {editMaterialReferenceFace,type MaterialReferenceFaceIntent} from './materialReferenceFace';\nimport {editMaterialAuxiliary,type MaterialAuxiliaryIntent} from './materialAuxiliary';"),
    ('export type MaterialFaceEditIntent=MaterialReferenceFaceIntent|', 'export type MaterialFaceEditIntent=MaterialAuxiliaryIntent|MaterialReferenceFaceIntent|'),
    (" if(intent.kind==='material-reference-face')return editMaterialReferenceFace(doc,intent);", " if(intent.kind==='material-auxiliary')return editMaterialAuxiliary(doc,intent);\n if(intent.kind==='material-reference-face')return editMaterialReferenceFace(doc,intent);")
])
edit('src/app/editorCommit.ts', [("if(transform?.kind==='material-reference-face'||", "if(transform?.kind==='material-auxiliary'||transform?.kind==='material-reference-face'||")])
edit('src/core/materialCurveModel.ts', [
    ("import {resolveStartingFace} from '../app/flatFoldSettings';", "import {resolveStartingFace} from '../app/flatFoldSettings';\nimport {buildMaterialAuxiliary,bindMaterialAuxiliaryRecipe,resolveMaterialAuxiliaryRecipe,type MaterialAuxiliaryIntent,type MaterialAuxiliaryBinding} from './materialAuxiliary';"),
    ('export type MaterialGroupRecipe=MaterialReferenceFaceIntent|', 'export type MaterialGroupRecipe=MaterialAuxiliaryIntent|MaterialReferenceFaceIntent|'),
    ('reflection?:MaterialReflectBinding};', 'reflection?:MaterialReflectBinding;auxiliaryBinding?:MaterialAuxiliaryBinding};'),
    ("|'zhezhi-material-curve-model-v13';", "|'zhezhi-material-curve-model-v13'|'zhezhi-material-curve-model-v14';"),
    ("const build=(doc:Doc,recipe:MaterialGroupRecipe):Geometry=>recipe.kind==='material-reference-face'?", "const build=(doc:Doc,recipe:MaterialGroupRecipe):Geometry=>recipe.kind==='material-auxiliary'?buildMaterialAuxiliary(doc,recipe):recipe.kind==='material-reference-face'?"),
    ('v(?:[1-9]|1[0-3])', 'v(?:[1-9]|1[0-4])'),
    ("||version>=13&&g.recipe.kind==='material-reference-face');", "||version>=13&&g.recipe.kind==='material-reference-face'||version>=14&&g.recipe.kind==='material-auxiliary');"),
    ("const groupKeys=(g:MaterialCurveGroup)=>g.recipe.kind==='material-reference-face'?", "const groupKeys=(g:MaterialCurveGroup)=>g.recipe.kind==='material-auxiliary'?'auxiliaryBinding,baseComponent,baseFace,id,recipe':g.recipe.kind==='material-reference-face'?"),
    ("||!catalog.has(g.baseFace)||!Number.isInteger(g.baseComponent)||g.baseComponent!==catalog.get(g.baseFace)||", "||(g.recipe.kind==='material-auxiliary'?g.baseFace!==-1:!catalog.has(g.baseFace))||!Number.isInteger(g.baseComponent)||(g.recipe.kind==='material-auxiliary'?g.baseComponent!==-1:g.baseComponent!==catalog.get(g.baseFace))||g.recipe.kind==='material-auxiliary'&&!record(g.auxiliaryBinding)||"),
    ("if(!inspected.ok&&!isClipboard(group.recipe))bad(inspected.reason);", "if(!inspected.ok&&!isClipboard(group.recipe)&&group.recipe.kind!=='material-auxiliary')bad(inspected.reason);"),
    ("  if(group.recipe.kind==='material-reference-face'){", "  if(group.recipe.kind==='material-auxiliary'){\n   const resolved=resolveMaterialAuxiliaryRecipe(stage,group.recipe,group.auxiliaryBinding!,anchorStages);if(refreshReferences)group.recipe=resolved;else if(!equal(resolved,group.recipe))bad('辅助线端点与保存的材料来源不一致。');\n  }else if(group.recipe.kind==='material-reference-face'){"),
    (' const copyNames=new Map<string,string>();if(result.copy)', " const copyNames=new Map<string,string>();if(result.auxiliary)result.auxiliary.createdIds.forEach((id,i)=>copyNames.set(id,`${group}::aux-${result.auxiliary!.createdKeys[i]}`));if(result.copy)"),
    (' if(result.paste)result.paste.pastedIds=', " if(result.auxiliary){result.auxiliary.createdIds=result.auxiliary.createdIds.map(convert);result.auxiliary.changedIds=result.auxiliary.changedIds.map(convert);result.auxiliary.removedIds=result.auxiliary.removedIds.map(convert);}if(result.paste)result.paste.pastedIds="),
    ('if(result.clipboardCut?.empty)validateDoc(result.doc);else material(result.doc);', "if(result.clipboardCut?.empty||result.auxiliary&&!Object.hasOwn(result.doc.metadata??{},'materialTopology'))validateDoc(result.doc);else material(result.doc);"),
    ("'material-line-properties','material-reference-face'].includes(recipe.kind)", "'material-line-properties','material-reference-face','material-auxiliary'].includes(recipe.kind)"),
    ("  if(recipe.kind==='material-reference-face'){", "  if(recipe.kind==='material-auxiliary'){\n   const stage=checked.stages[index];build(stage,recipe);const auxiliaryBinding=bindMaterialAuxiliaryRecipe(stage,recipe,prior.anchorStages),resolved=resolveMaterialAuxiliaryRecipe(stage,recipe,auxiliaryBinding,prior.anchorStages);model.groups[index]={id:model.groups[index].id,recipe:resolved,baseFace:-1,baseComponent:-1,auxiliaryBinding};\n  }else if(recipe.kind==='material-reference-face'){"),
    ("...(last?.referenceFace?{referenceFace:last.referenceFace}:{}),", "...(last?.auxiliary?{auxiliary:last.auxiliary}:{}),...(last?.referenceFace?{referenceFace:last.referenceFace}:{}),")
])
print('Integrated v14 auxiliary recipes, stable creation keys, explicit endpoint/target origins and annotation-only empty states.')
