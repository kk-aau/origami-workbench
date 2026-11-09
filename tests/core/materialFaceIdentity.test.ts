import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {faceIdentityCase as fixture} from '../fixtures/materialFaceIdentity';
import {weakToolMaterial as mat} from '../fixtures/materialWeakTools';
import {inspectMaterialCurveModel,editMaterialCurveModel} from '../../src/core/materialCurveModel';
import {editMaterialFaces,buildMaterialFaceInsert} from '../../src/core/materialFaceEdit';
import {transformModelRecipe} from '../fixtures/materialTransformModel';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
const model=(d:Doc)=>{const c=inspectMaterialCurveModel(d);assert.ok(c.ok,c.ok?'':c.reason);return c;},same=(a:Doc,b:Doc)=>{assert.deepEqual(mat(a).graph,mat(b).graph);assert.deepEqual(mat(a).foldedVertices,mat(b).foldedVertices);};
for(const kind of ['mirrorX','mirrorY','rotate','move','scale'] as const)test(`earlier ${kind} change keeps the selected source face and independently recomputed CP/FF`,()=>{
 const d=fixture('move'),c=model(d),r=transformModelRecipe(kind,kind==='scale'?1.2:kind==='rotate'?30:40,20),changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:r}).doc,updated=model(changed),stage=updated.stages[1],insert=updated.model.groups[1].recipe;assert.equal(insert.kind,'material-face-insert');if(insert.kind!=='material-face-insert')throw Error('insert');same(changed,buildMaterialFaceInsert(stage,insert).doc);assert.equal(insert.face,0);assert.equal(updated.model.groups[1].region!.owner,0);assert.equal(computeFlatFold(changed).layers.status,'solved');
});
test('repeated reflection changes update direction consistently without accumulating transformations',()=>{
 let d=fixture('move'),id=model(d).model.groups[0].id;for(const r of [transformModelRecipe('mirrorX',0),transformModelRecipe('mirrorY',0),transformModelRecipe('rotate',-37),transformModelRecipe('move',20,10),transformModelRecipe('mirrorX',0)]){d=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:id,recipe:r}).doc;const c=model(d),insert=c.model.groups[1].recipe;if(insert.kind!=='material-face-insert')throw Error('insert');same(d,buildMaterialFaceInsert(c.stages[1],insert).doc);}assert.equal(model(d).model.groups.length,2);
});
test('old direction-only regions migrate before changing a preceding reflection and keep the document atomic',()=>{
 const d=fixture('move');delete (d.metadata!.materialCurveModel as any).groups[1].region.owner;const c=model(d),before=JSON.stringify(d),intent={kind:'material-curve-group-edit' as const,group:c.model.groups[0].id,recipe:transformModelRecipe('mirrorX',0)},changed=editMaterialCurveModel(d,intent).doc;assert.equal(JSON.stringify(d),before);assert.equal(model(changed).model.groups[1].region!.owner,0);assert.deepEqual(prepareEditorCommit(d,changed,intent).doc,changed);
});
test('a later chord on one child of a shared crease keeps that child when the whole component mirrors',()=>{
 const d=fixture('shared'),c=model(d),transform=c.model.groups[1],changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:transform.id,recipe:transformModelRecipe('mirrorX',0)}).doc,after=model(changed);assert.equal(after.model.groups[2].recipe.kind,'material-face-insert');assert.equal(after.model.groups[2].recipe.face,0);assert.equal(mat(changed).graph.faces_vertices!.length,3);assert.ok(mat(changed).graph.vertices_coords.some(p=>p[0]===0&&p[1]===50));
});
test('changing one copy mirror and growing copy count keeps its own face and the other original CP/FF',()=>{
 const d=fixture('copy'),c=model(d),r=c.model.groups[0].recipe;if(r.kind!=='material-copy')throw Error('copy');const recipe={...r,placements:[{...r.placements[0],mirror:'x' as const},{...r.placements[1],mirror:'y' as const},{...r.placements[1],dx:450}]},changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe}).doc,after=model(changed);assert.equal(after.model.groups[1].region!.anchor.sourcePart,0);assert.equal(after.model.groups[1].recipe.face,1);assert.equal(mat(changed).components.length,4);const original=mat(c.stages[0]);assert.deepEqual(mat(changed).graph.vertices_coords.slice(0,original.graph.vertices_coords.length),original.graph.vertices_coords);assert.deepEqual(mat(changed).foldedVertices!.slice(0,original.foldedVertices!.length),original.foldedVertices);
});
test('holed and weak cut boundaries retain their logical face through reflection',()=>{
 for(const name of ['hole','weak']){const d=fixture(name),c=model(d),changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups.find(g=>g.recipe.kind==='material-transform')!.id,recipe:transformModelRecipe('mirrorX',0)}).doc;assert.ok(model(changed));assert.equal(mat(changed).components.length,mat(d).components.length);prepareSimulationDocument(mat(changed).graph);}
});
test('JSON/FOLD preserve owner identities, allow another reflection edit and keep ordinary DXF exact',()=>{
 const d=editMaterialCurveModel(fixture('move'),{kind:'material-curve-group-edit',group:model(fixture('move')).model.groups[0].id,recipe:transformModelRecipe('mirrorX',0)}).doc;for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc;assert.deepEqual(model(back).model,model(d).model);const intent={kind:'material-curve-group-edit' as const,group:model(back).model.groups[0].id,recipe:transformModelRecipe('mirrorY',0)},changed=editMaterialCurveModel(back,intent).doc;assert.equal(exportDXF(changed).text,exportDXF(editMaterialCurveModel(d,intent).doc).text);}
 let h=editorHistoryReducer(emptyEditorHistory(fixture('move')),{type:'commit',doc:d});h=editorHistoryReducer(h,{type:'undo'});same(h.present,fixture('move'));h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,d);
});
test('malformed owners and orientation or deleted source do not rebind another face',()=>{
 const d=fixture('move'),before=JSON.stringify(d);for(const owner of [undefined,null,-1,1,NaN,0.5,'0']){const bad=structuredClone(d);(bad.metadata!.materialCurveModel as any).groups[1].region.owner=owner;assert.equal(inspectMaterialCurveModel(bad).ok,false);}const wrong=structuredClone(d);(wrong.metadata!.materialCurveModel as any).groups[1].region.side='right';assert.equal(inspectMaterialCurveModel(wrong).ok,false);assert.throws(()=>editMaterialCurveModel(d,{kind:'material-curve-group-remove',group:model(d).model.groups[0].id}),/删除/);assert.equal(JSON.stringify(d),before);
});
test('reflection before two successive chords follows the physical child defined by its source boundary edges',()=>{
 let d=fixture('move');const c=model(d),first=c.model.groups[1].id;d=editMaterialFaces(d,{kind:'material-face-insert',face:0,from:{edgeId:first+'::crease-0',fraction:.5},to:{edgeId:'material-edge-1',fraction:.5},assignment:'F',fixedPart:0,cpOnly:false,parametric:true}).doc;const changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:transformModelRecipe('mirrorX',0)}).doc,after=model(changed);assert.equal(after.model.groups[2].recipe.face,1);assert.equal(after.model.groups[2].region!.owner,1);assert.equal(mat(changed).graph.faces_vertices!.length,3);assert.ok(mat(changed).graph.vertices_coords.some(p=>p[0]===0&&p[1]===50));
});
