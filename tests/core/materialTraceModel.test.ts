import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {traceModelBase as base,traceModelCase as fixture,traceModelRecipe as recipe} from '../fixtures/materialTraceModel';
import {weakToolMaterial as mat,weakToolAnchor as anchor,weakToolSource as weak,weakToolSheet} from '../fixtures/materialWeakTools';
import {materialSlitFixture} from '../fixtures/materialModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {editMaterialCurveModel,inspectMaterialCurveModel,type MaterialTraceRecipe} from '../../src/core/materialCurveModel';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {networkModelRecipe,networkModelCurve} from '../fixtures/materialNetworkModel';
const model=(d:Doc)=>{const c=inspectMaterialCurveModel(d);assert.ok(c.ok,c.ok?'':c.reason);return c;};
const same=(a:Doc,b:Doc)=>{assert.deepEqual(mat(a).graph,mat(b).graph);assert.deepEqual(mat(a).foldedVertices,mat(b).foldedVertices);};
for(const kind of ['material-face-trace','material-face-ray','material-face-traces'] as const){
 test(`${kind}: legacy geometry and optional recording agree; saved recipe is independently replayed`,()=>{
  const d=base(),r=recipe(d,kind),plain=editMaterialFaces(d,r),off=editMaterialFaces(d,{...r,parametric:false}),saved=editMaterialFaces(d,{...r,parametric:true});same(saved.doc,plain.doc);assert.deepEqual(off.doc,plain.doc);assert.equal(plain.doc.metadata!.materialCurveModel,undefined);assert.equal(model(saved.doc).model.schema,'zhezhi-material-curve-model-v3');assert.equal(model(saved.doc).model.groups[0].anchors!.length,kind==='material-face-ray'?1:2);assert.equal(Object.hasOwn(model(saved.doc).model.groups[0].recipe,'parametric'),false);assert.equal(computeFlatFold(saved.doc).layers.status,'solved');
 });
 test(`${kind}: edit reconstructs clean geometry and JSON/FOLD retain editable references`,()=>{
  const first=editMaterialFaces(base(),{...recipe(base(),kind),parametric:true}).doc,id=model(first).model.groups[0].id;
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(first,format).text,format).doc,changed=editMaterialCurveModel(back,{kind:'material-curve-group-edit',group:id,recipe:recipe(base(),kind,45)}).doc;same(changed,editMaterialFaces(base(),recipe(base(),kind,45)).doc);assert.equal(model(changed).model.groups[0].id,id);assert.equal(mat(changed).graph.edges_vertices.length,7);prepareSimulationDocument(mat(changed).graph);}
 });
}
test('three trace kinds remap later boundary anchors by source proportion after prior splits move',()=>{
 const d=fixture('three'),old=model(d),first=old.model.groups[0].id,changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:first,recipe:recipe(base(),'material-face-trace',40)}).doc;
 assert.deepEqual(model(changed).model.groups.map(g=>g.id),old.model.groups.map(g=>g.id));
 for(const y of [40,70,85])assert.ok(changed.segments.some(s=>s.a[1]===y&&s.b[1]===y&&s.assignment==='F'));
 assert.ok(!changed.segments.some(s=>s.a[1]===30&&s.b[1]===30));assert.equal(computeFlatFold(changed).layers.status,'solved');
 const removed=editMaterialCurveModel(changed,{kind:'material-curve-group-remove',group:first}).doc;assert.equal(model(removed).model.groups.length,2);assert.ok(!removed.segments.some(s=>s.a[1]===40&&s.b[1]===40));assert.ok(removed.segments.some(s=>s.a[1]===70&&s.b[1]===70));
});
test('anchor on a generated crease follows its moving source proportion; deleting the source rejects atomically',()=>{
 const first=fixture('single'),m=mat(first),id=model(first).model.groups[0].id,e=m.graph.edges_assignment.indexOf('F'),second:MaterialTraceRecipe={kind:'material-face-ray',component:0,from:{edgeId:m.edgeSegmentIds[e],fraction:.25},through:[25,20],assignment:'F',fixedSide:'left',cpOnly:false},both=editMaterialFaces(first,{...second,parametric:true}).doc,before=JSON.stringify(both);
 assert.equal(model(both).model.groups[1].anchors![0].source,id);
 const changed=editMaterialCurveModel(both,{kind:'material-curve-group-edit',group:id,recipe:recipe(base(),'material-face-trace',40)}).doc;assert.ok(changed.segments.some(s=>s.a[0]===25&&s.b[0]===25&&Math.max(s.a[1],s.b[1])===40));assert.equal(model(changed).model.groups.length,2);
 assert.throws(()=>editMaterialCurveModel(both,{kind:'material-curve-group-remove',group:id}),/依赖.*删除/);assert.equal(JSON.stringify(both),before);
});
test('all supported recipe kinds preserve mixed model version and material ancestry',()=>{
 let d=editMaterialFaces(base(),networkModelCurve(8)).doc;assert.equal(model(d).model.schema,'zhezhi-material-curve-model-v15');d=editMaterialFaces(d,{...recipe(d,'material-face-ray',20),parametric:true}).doc;assert.equal(model(d).model.schema,'zhezhi-material-curve-model-v15');d=editMaterialFaces(d,{...networkModelRecipe(35,65),parametric:true}).doc;assert.equal(model(d).model.schema,'zhezhi-material-curve-model-v15');d=editMaterialFaces(d,networkModelCurve(12)).doc;assert.equal(model(d).model.groups.length,4);const old=model(d),changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:old.model.groups[0].id,recipe:networkModelCurve(15)}).doc;assert.equal(model(changed).model.groups.length,4);assert.equal(computeFlatFold(changed).layers.status,'solved');
});
test('weak cut bank anchors retain distinct indexed source sides and independent split points',()=>{
 const {source,banks}=materialSlitFixture(),m=mat(source),r:MaterialTraceRecipe={kind:'material-face-ray',component:'all',from:{edgeId:m.edgeSegmentIds[banks[0]],fraction:.5},through:[150,99],assignment:'F',fixedSide:'left',cpOnly:false},d=editMaterialFaces(source,{...r,parametric:true}).doc,c=model(d);assert.equal(c.model.groups[0].anchors![0].edgeId,r.from.edgeId);assert.equal(mat(d).graph.vertices_coords.filter(p=>p[0]===150&&p[1]===100).length,2);const changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:{...r,from:{...r.from,fraction:.6},through:[160,99]}}).doc;assert.equal(mat(changed).graph.vertices_coords.filter(p=>p[0]===160&&p[1]===100).length,2);assert.equal(computeFlatFold(changed).layers.status,'solved');
});
test('stale model archives preserve manual cuts when recording a ray from current material',()=>{
 const d=weak('interior'),before=JSON.stringify(d),saved=editMaterialFaces(d,{...recipe(d,'material-face-ray',20),parametric:true}).doc;assert.deepEqual((saved.metadata!.materialCurveArchives as unknown[])[0],d.metadata!.materialCurveModel);assert.deepEqual(model(saved).model.base.topology.graph,mat(d).graph);assert.equal(JSON.stringify(d),before);
});
test('tampered source references, flags, v1/v2 claims and out-of-group changes reject',()=>{
 const d=fixture('two');for(const mutate of [(m:any)=>m.schema='zhezhi-material-curve-model-v2',(m:any)=>m.groups[1].anchors[0].source=m.groups[1].id,(m:any)=>m.groups[1].anchors[0].edgeCount++,(m:any)=>m.groups[1].anchors[0].fraction+=.01,(m:any)=>m.groups[1].anchors.push(m.groups[1].anchors[0]),(m:any)=>m.groups[1].recipe.parametric=true]){const bad=structuredClone(d);mutate(bad.metadata!.materialCurveModel);assert.equal(inspectMaterialCurveModel(bad).ok,false);}
 for(const flag of [undefined,null,'true'])assert.throws(()=>editMaterialFaces(base(),{...recipe(base(),'material-face-ray'),parametric:flag} as any));
 const raw=editMaterialFaces(d,recipe(d,'material-face-trace',90)).doc;assert.equal(inspectMaterialCurveModel(raw).ok,false);assert.throws(()=>editMaterialCurveModel(raw,{kind:'material-curve-group-remove',group:model(d).model.groups[0].id}),/组外修改/);
});
test('history and independent commit replay preserve auxiliaries, colors and paper properties',()=>{
 const d=fixture('three');d.name='当前工程';d.metadata!.userNote='保留';d.segments.push({id:'trace-model-aux',a:[2,4],b:[95,3],assignment:'A',angle:null});d.segments[0].displayColor='#abcdef';const id=model(d).model.groups[0].id,intent={kind:'material-curve-group-edit' as const,group:id,recipe:recipe(base(),'material-face-trace',40)},next=editMaterialCurveModel(d,intent).doc;assert.deepEqual(prepareEditorCommit(d,next,intent).doc,next);let h=editorHistoryReducer(emptyEditorHistory(d),{type:'commit',doc:next});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,d);h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,next);assert.equal(next.name,d.name);assert.deepEqual(next.paper,d.paper);assert.equal(next.metadata!.userNote,d.metadata!.userNote);assert.deepEqual(next.segments.find(s=>s.id==='trace-model-aux'),d.segments.at(-1));assert.equal(next.segments[0].displayColor,d.segments[0].displayColor);assert.ok(exportDXF(next).text.includes('AC1009'));assert.equal((exportDXF(next).text.match(/\r?\nLINE\r?\n/g)??[]).length,next.segments.length);
});
test('later overlapping trace blocks an earlier parameter edit without changing source history',()=>{
 const d=fixture('two'),before=JSON.stringify(d),id=model(d).model.groups[0].id;assert.throws(()=>editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:id,recipe:recipe(base(),'material-face-trace',70)}),/重叠|重复|沿已有/);assert.equal(JSON.stringify(d),before);
});
test('hole crossings preserve blank material intervals after ray parameter edits',()=>{
 const source=weakToolSheet(true),first=editMaterialFaces(source,{...recipe(source,'material-face-ray',50),parametric:true}).doc,c=model(first);assert.equal(mat(first).components[0].boundaryLoops.length,2);
 const changed=editMaterialCurveModel(first,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:recipe(source,'material-face-ray',55)});assert.equal(changed.ray!.blankLength,20);assert.equal(changed.ray!.materialLength,80);for(const s of changed.doc.segments.filter(s=>changed.insertedIds!.includes(s.id)))assert.ok(Math.max(s.a[0],s.b[0])<=40||Math.min(s.a[0],s.b[0])>=60);assert.equal(computeFlatFold(changed.doc).layers.status,'solved');
});
test('batch assignments and overrides are recorded, editable and returned with namespaced IDs',()=>{
 const d=base(),r=recipe(d,'material-face-traces',25);assert.equal(r.kind,'material-face-traces');if(r.kind!=='material-face-traces')return;r.lines=[...r.lines,{from:anchor(d,[0,75]),to:anchor(d,[100,75]),assignment:'U'}];r.cpOnly=true;r.overrides=[{line:1,piece:0,assignment:'F'}];const first=editMaterialFaces(d,{...r,parametric:true}),c=model(first.doc);assert.equal(first.batch!.pieces.length,2);assert.ok(first.batch!.pieces.every(p=>first.doc.segments.some(s=>s.id===p.id)));
 const next=editMaterialCurveModel(first.doc,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:{...r,overrides:[]}});assert.deepEqual(next.batch!.pieces.map(p=>p.assignment),['F','U']);assert.ok(next.batch!.pieces.every(p=>next.doc.segments.some(s=>s.id===p.id)));assert.equal(mat(next.doc).foldedVertices,undefined);assert.equal(model(next.doc).model.groups.length,1);
});
test('eight mixed trace groups retain monotonic IDs, and capacity rejection is atomic',()=>{
 let d=base();for(let i=1;i<=8;i++)d=editMaterialFaces(d,{...recipe(d,i%2?'material-face-ray':'material-face-trace',i*10),parametric:true}).doc;const c=model(d),before=JSON.stringify(d);assert.equal(c.model.groups.length,8);assert.throws(()=>editMaterialFaces(d,{...recipe(d,'material-face-trace',90),parametric:true}),/最多8/);assert.equal(JSON.stringify(d),before);const removed=editMaterialCurveModel(d,{kind:'material-curve-group-remove',group:c.model.groups[0].id}).doc,next=editMaterialFaces(removed,{...recipe(removed,'material-face-trace',90),parametric:true}).doc;assert.equal(model(next).model.groups.at(-1)!.id,'curve-group-9');
});
test('fractional split ratios validate without rewriting original adopted geometry',()=>{
 const d=fixture('single'),r=recipe(d,'material-face-ray',70),plain=editMaterialFaces(d,r).doc,saved=editMaterialFaces(d,{...r,parametric:true}).doc;assert.equal(model(saved).model.groups.length,2);assert.deepEqual(saved.metadata!.materialCurveArchives,undefined);same(saved,plain);const back=importDocument(exportDocument(saved,'json').text,'json').doc;assert.equal(model(back).model.groups.length,2);
});
