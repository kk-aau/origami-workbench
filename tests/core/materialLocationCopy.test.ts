import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {constructMaterialCopy,buildMaterialConstructionCopy,previewMaterialConstructionCopy} from '../../src/app/materialConstructionCopy';
import {locationCopyCase as fixture,locationCopyRecipe as recipe} from '../fixtures/materialLocationCopy';
import {weakToolMaterial as mat,weakToolSheet,weakToolSource} from '../fixtures/materialWeakTools';
import {traceModelBase,traceModelRecipe} from '../fixtures/materialTraceModel';
import {inspectMaterialCurveModel,editMaterialCurveModel} from '../../src/core/materialCurveModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {copyModelRecipe} from '../fixtures/materialCopyModel';
const model=(d:Doc)=>{const c=inspectMaterialCurveModel(d);assert.ok(c.ok,c.ok?'':c.reason);return c;},same=(a:Doc,b:Doc)=>{assert.deepEqual(mat(a).graph,mat(b).graph);assert.deepEqual(mat(a).foldedVertices,mat(b).foldedVertices);};
for(const kind of ['translate','similarity','reflect'] as const)test(`${kind}: saved world-reference copy equals original formula, source CP/FF and ordinary preview`,()=>{
 const d=fixture('source'),r=recipe(d,kind),plain=buildMaterialConstructionCopy(d,r),saved=constructMaterialCopy(d,{...r,parametric:true});same(saved.doc,plain.doc);assert.deepEqual(constructMaterialCopy(d,{...r,parametric:false}),plain);assert.deepEqual(previewMaterialConstructionCopy(d,{...r,parametric:true}),previewMaterialConstructionCopy(d,r));assert.equal(model(saved.doc).model.schema,'zhezhi-material-curve-model-v8');assert.equal(model(saved.doc).model.groups.length,2);assert.deepEqual(mat(saved.doc).graph.vertices_coords.slice(0,mat(d).graph.vertices_coords.length),mat(d).graph.vertices_coords);assert.deepEqual(mat(saved.doc).foldedVertices!.slice(0,mat(d).foldedVertices!.length),mat(d).foldedVertices);assert.deepEqual(prepareEditorCommit(d,saved.doc,{...r,parametric:true}).doc,saved.doc);assert.equal(computeFlatFold(saved.doc).layers.status,'solved');
});
test('editing transform mode reconstructs from original stage and replays the later copied-face chord',()=>{
 const d=fixture('two'),c=model(d),id=c.model.groups[1].id;for(const kind of ['translate','similarity','reflect'] as const){const changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:id,recipe:recipe(c.stages[1],kind,180)}).doc;assert.equal(model(changed).model.groups.length,3);assert.equal(model(changed).model.groups[2].region!.anchor.sourcePart,0);assert.equal(model(changed).model.groups[2].recipe.face,2);assert.equal(mat(changed).components.length,2);assert.equal(computeFlatFold(changed).layers.status,'solved');}
});
test('upstream geometry replays selected material while reference coordinates stay declared world parameters',()=>{
 const d=fixture('translate'),c=model(d),changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:traceModelRecipe(traceModelBase(),'material-face-trace',40)}).doc,after=model(changed);assert.deepEqual(after.model.groups[1].recipe.transform,c.model.groups[1].recipe.transform);assert.ok(mat(changed).graph.vertices_coords.some(p=>p[0]===150&&p[1]===60));
});
test('hole and weak-bank positioning copies preserve real rings and mesh identities',()=>{
 for(const source of [weakToolSheet(true),weakToolSource('boundary')])for(const kind of ['similarity','reflect'] as const){const r=recipe(source,kind),saved=constructMaterialCopy(source,{...r,parametric:true}).doc;same(saved,buildMaterialConstructionCopy(source,r).doc);assert.ok(model(saved));prepareSimulationDocument(mat(saved).graph);}
});
test('auxiliaries are retained once, copy source selections can change and annotations remain intact',()=>{
 const d=fixture('source');d.objects=[{id:'note',kind:'text',text:'当前',position:[1,1],fontSize:12,color:'#123456'}];d.segments.push({id:'aux',a:[1,2],b:[3,4],assignment:'A',angle:null,displayColor:'#abcdef'});const r={...recipe(d),segmentIds:[...recipe(d).segmentIds,'aux'],parametric:true},saved=constructMaterialCopy(d,r).doc,c=model(saved),changed=editMaterialCurveModel(saved,{kind:'material-curve-group-edit',group:c.model.groups[1].id,recipe:{...recipe(c.stages[1],'reflect'),segmentIds:r.segmentIds}}).doc;assert.deepEqual(changed.objects,d.objects);assert.equal(changed.segments.filter(s=>s.assignment==='A').length,2);assert.deepEqual(changed.segments.find(s=>s.id==='aux'),d.segments.at(-1));assert.ok(model(changed));
 const one=constructMaterialCopy(d,{...recipe(d),parametric:true}).doc,m=mat(one),r2={...recipe(one,'similarity'),segmentIds:m.components[1].edges.map(e=>m.edgeSegmentIds[e])},second=constructMaterialCopy(one,{...r2,parametric:true}).doc;assert.ok(model(second));assert.equal(model(second).model.groups[2].selection![0].source,model(one).model.groups[1].id);
});
test('new regular copy, face and transform operations keep v8 and do not drop the positioning recipe',()=>{
 let d=fixture('translate');d=copyMaterialComponents(d,{...copyModelRecipe(d,300),parametric:true}).doc;assert.equal(model(d).model.schema,'zhezhi-material-curve-model-v8');d=editMaterialFaces(d,{kind:'material-transform',components:[1],operation:{kind:'move',a:10,b:20},parametric:true}).doc;assert.equal(model(d).model.schema,'zhezhi-material-curve-model-v8');const f=mat(d).components[2].faces[0],es=mat(d).graph.faces_edges![f];d=editMaterialFaces(d,{kind:'material-face-insert',face:f,from:{edgeId:mat(d).edgeSegmentIds[es[0]],fraction:.5},to:{edgeId:mat(d).edgeSegmentIds[es[2]],fraction:.5},assignment:'F',fixedPart:0,cpOnly:false,parametric:true}).doc;assert.equal(model(d).model.schema,'zhezhi-material-curve-model-v8');
});
test('JSON/FOLD retain positioning transforms, allow reedit/remove and ordinary DXF stays exact',()=>{
 const d=fixture('translate'),id=model(d).model.groups[1].id;for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc;assert.deepEqual(model(back).model,model(d).model);const intent={kind:'material-curve-group-edit' as const,group:id,recipe:recipe(model(back).stages[1],'similarity',200)},changed=editMaterialCurveModel(back,intent).doc;assert.equal(exportDXF(changed).text,exportDXF(editMaterialCurveModel(d,intent).doc).text);same(editMaterialCurveModel(back,{kind:'material-curve-group-remove',group:id}).doc,fixture('source'));}
 const intent={...recipe(fixture('source')),parametric:true},r=constructMaterialCopy(fixture('source'),intent);let h=editorHistoryReducer(emptyEditorHistory(fixture('source')),{type:'commit',doc:r.doc});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,fixture('source'));h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,r.doc);const forged=structuredClone(r.doc);forged.name='伪造';assert.throws(()=>prepareEditorCommit(fixture('source'),forged,intent),/独立重放/);
});
test('invalid references/flags/partial sources and forged model versions reject without mutation',()=>{
 const d=fixture('source'),before=JSON.stringify(d);for(const transform of [{kind:'translate',from:[0,0],to:[Infinity,0]},{kind:'similarity',a:[0,0],b:[0,0],c:[1,1],d:[2,2]},{kind:'reflect',a:[0,0],b:[0,0]},{kind:'translate',from:[0,0],to:[1,1],ignored:1}])assert.throws(()=>constructMaterialCopy(d,{...recipe(d),transform,parametric:true} as any));for(const parametric of [undefined,null,'true'])assert.throws(()=>constructMaterialCopy(d,{...recipe(d),parametric} as any));assert.throws(()=>constructMaterialCopy(d,{...recipe(d),segmentIds:[d.segments[0].id],parametric:true}));assert.equal(JSON.stringify(d),before);const bad=fixture('translate');(bad.metadata!.materialCurveModel as any).schema='zhezhi-material-curve-model-v7';assert.equal(inspectMaterialCurveModel(bad).ok,false);const two=fixture('two');assert.throws(()=>editMaterialCurveModel(two,{kind:'material-curve-group-remove',group:model(two).model.groups[1].id}),/删除/);
});
test('capacity and outside-model edits retain previous work through explicit archival',()=>{
 let d=fixture('source');for(let i=0;i<7;i++)d=constructMaterialCopy(d,{...recipe(d,'translate',150*(i+1)),parametric:true}).doc;assert.equal(model(d).model.groups.length,8);const before=JSON.stringify(d);assert.throws(()=>constructMaterialCopy(d,{...recipe(d),parametric:true}),/最多8/);assert.equal(JSON.stringify(d),before);
 const saved=fixture('translate'),stale=constructMaterialCopy(saved,recipe(saved,'translate',10)).doc,old=stale.metadata!.materialCurveModel,current=constructMaterialCopy(stale,{...recipe(stale,'reflect'),parametric:true}).doc;assert.deepEqual((current.metadata!.materialCurveArchives as unknown[])[0],old);assert.equal(model(current).model.groups.length,1);
});
