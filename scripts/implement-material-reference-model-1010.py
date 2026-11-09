from pathlib import Path

def edit(file, changes):
    p = Path(file)
    s = p.read_text(encoding='utf8')
    for before, after in changes:
        assert s.count(before) == 1, (file, before[:110], s.count(before))
        s = s.replace(before, after)
    p.write_text(s, encoding='utf8')

edit('src/core/materialFaceCommon.ts', [('export type MaterialFaceEditResult={properties?', 'export type MaterialFaceEditResult={referenceFace?:{previous:number|null;current:number;default:boolean;changed:boolean};properties?')])
edit('src/core/materialFaceEdit.ts', [
    ("import {editMaterialLineProperties,type MaterialLinePropertiesIntent} from './materialLineProperties';", "import {editMaterialLineProperties,type MaterialLinePropertiesIntent} from './materialLineProperties';\nimport {editMaterialReferenceFace,type MaterialReferenceFaceIntent} from './materialReferenceFace';"),
    ('export type MaterialFaceEditIntent=MaterialLinePropertiesIntent|', 'export type MaterialFaceEditIntent=MaterialReferenceFaceIntent|MaterialLinePropertiesIntent|'),
    (" if(intent.kind==='material-line-properties')return editMaterialLineProperties(doc,intent);", " if(intent.kind==='material-reference-face')return editMaterialReferenceFace(doc,intent);\n if(intent.kind==='material-line-properties')return editMaterialLineProperties(doc,intent);")
])
edit('src/app/editorCommit.ts', [("if(transform?.kind==='material-line-properties'||", "if(transform?.kind==='material-reference-face'||transform?.kind==='material-line-properties'||")])
edit('src/core/materialCurveModel.ts', [
    ("import {buildMaterialLineProperties,type MaterialLinePropertiesIntent} from './materialLineProperties';", "import {buildMaterialLineProperties,type MaterialLinePropertiesIntent} from './materialLineProperties';\nimport {buildMaterialReferenceFace,type MaterialReferenceFaceIntent} from './materialReferenceFace';\nimport {resolveStartingFace} from '../app/flatFoldSettings';"),
    ('export type MaterialGroupRecipe=MaterialLinePropertiesIntent|', 'export type MaterialGroupRecipe=MaterialReferenceFaceIntent|MaterialLinePropertiesIntent|'),
    ("|'zhezhi-material-curve-model-v12';", "|'zhezhi-material-curve-model-v12'|'zhezhi-material-curve-model-v13';"),
    ("const build=(doc:Doc,recipe:MaterialGroupRecipe):Geometry=>recipe.kind==='material-line-properties'?", "const build=(doc:Doc,recipe:MaterialGroupRecipe):Geometry=>recipe.kind==='material-reference-face'?buildMaterialReferenceFace(doc,recipe):recipe.kind==='material-line-properties'?"),
    ('v(?:[1-9]|1[0-2])', 'v(?:[1-9]|1[0-3])'),
    ("||version>=12&&g.recipe.kind==='material-line-properties');", "||version>=12&&g.recipe.kind==='material-line-properties'||version>=13&&g.recipe.kind==='material-reference-face');"),
    ("const groupKeys=(g:MaterialCurveGroup)=>g.recipe.kind==='material-line-properties'?", "const groupKeys=(g:MaterialCurveGroup)=>g.recipe.kind==='material-reference-face'?(g.recipe.face===null?'baseComponent,baseFace,id,recipe':'baseComponent,baseFace,id,recipe,region'):g.recipe.kind==='material-line-properties'?"),
    ("||g.recipe.kind==='material-face-insert'&&(!Array.isArray(g.anchors)", "||g.recipe.kind==='material-reference-face'&&g.recipe.face!==null&&!record(g.region)||g.recipe.kind==='material-face-insert'&&(!Array.isArray(g.anchors)"),
    ("  if(group.recipe.kind==='material-line-properties'){", "  if(group.recipe.kind==='material-reference-face'){\n   if(group.recipe.face!==null){const face=resolveMaterialFaceRegion(stage,group.region!,anchorStages,refreshReferences);if(!origins[face].includes(group.baseFace))bad('参考面已不属于原材料来源。');if(refreshReferences)group.recipe={...group.recipe,face};else if(face!==group.recipe.face)bad('参考面与原材料来源不一致。');}\n  }else if(group.recipe.kind==='material-line-properties'){"),
    ("'material-construction-move','material-line-properties'].includes(recipe.kind)", "'material-construction-move','material-line-properties','material-reference-face'].includes(recipe.kind)"),
    ("  if(recipe.kind==='material-line-properties'){", "  if(recipe.kind==='material-reference-face'){\n   const stage=checked.stages[index];build(stage,recipe);const face=recipe.face??source!.startingFace??0,baseFace=sourceParents[face],group={id:model.groups[index].id,recipe,baseFace,baseComponent:originComponent(doc,model,baseFace)};model.groups[index]=recipe.face===null?group:{...group,region:bindMaterialFaceRegion(stage,face,prior.anchorStages)};\n  }else if(recipe.kind==='material-line-properties'){"),
    ("...(last?.properties?{properties:last.properties}:{}),", "...(last?.referenceFace?{referenceFace:last.referenceFace}:{}),...(last?.properties?{properties:last.properties}:{}),")
])
print('Integrated reference-face recipes and v13 replay, retaining original geometry and reference math.')
