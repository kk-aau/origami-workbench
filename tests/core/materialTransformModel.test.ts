import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {transformModelCase as fixture,transformModelRecipe as recipe} from '../fixtures/materialTransformModel';
import {traceModelBase,traceModelRecipe} from '../fixtures/materialTraceModel';
import {weakToolMaterial as mat,weakToolSheet} from '../fixtures/materialWeakTools';
import {topologyModelCase} from '../fixtures/materialTopologyModel';
import {materialTransformMap,reconcileMaterialEdit} from '../../src/app/materialEdit';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {inspectMaterialCurveModel,editMaterialCurveModel} from '../../src/core/materialCurveModel';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {createMaterialTopology} from '../../src/core/materialTopology';
const model=(d:Doc)=>{const c=inspectMaterialCurveModel(d);assert.ok(c.ok,c.ok?'':c.reason);return c;},same=(a:Doc,b:Doc)=>{assert.deepEqual(mat(a).graph,mat(b).graph);assert.deepEqual(mat(a).foldedVertices,mat(b).foldedVertices);};
for(const [kind,a,b] of [['move',20,10],['rotate',37,0],['scale',.75,0],['mirrorX',0,0],['mirrorY',0,0]] as const){
 test(`${kind}: saved transform matches ordinary CP/FF rule, preserves IDs and replay`,()=>{
  const d=fixture('source'),r=recipe(kind,a,b),legacy={...r.operation,segmentIds:mat(d).edgeSegmentIds},map=materialTransformMap(d,legacy),proposal={...structuredClone(d),segments:d.segments.map(s=>({...s,a:map.point(s.a),b:map.point(s.b)}))},expected=reconcileMaterialEdit(d,proposal,legacy),plain=editMaterialFaces(d,r).doc,off=editMaterialFaces(d,{...r,parametric:false}).doc,saved=editMaterialFaces(d,{...r,parametric:true}).doc;same(plain,expected);assert.deepEqual(plain,off);same(saved,expected);assert.equal(model(saved).model.schema,'zhezhi-material-curve-model-v5');assert.equal(model(saved).model.groups.length,2);assert.deepEqual(mat(saved).edgeSegmentIds,mat(d).edgeSegmentIds);assert.equal(computeFlatFold(saved).layers.status,'solved');assert.deepEqual(mat(saved).foldedVertices,mat(d).foldedVertices!.map(map.point));
 });
}
test('changing a saved move reconstructs from its original stage rather than accumulating offsets',()=>{
 const d=fixture('moved'),id=model(d).model.groups[1].id;for(const [x,y] of [[30,20],[-5,8],[0,0]]){const changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:id,recipe:recipe('move',x,y)}).doc;same(changed,editMaterialFaces(fixture('source'),recipe('move',x,y)).doc);assert.equal(model(changed).model.groups.length,2);assert.ok(mat(changed).graph.vertices_coords.some(p=>p[0]===x&&p[1]===y));}
});
test('an earlier trace and transform edit replays the later transform about the current CP centre',()=>{
 const d=fixture('two'),c=model(d),changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:traceModelRecipe(traceModelBase(),'material-face-trace',40)}).doc;assert.equal(model(changed).model.groups.length,3);const offset=editMaterialCurveModel(changed,{kind:'material-curve-group-edit',group:c.model.groups[1].id,recipe:recipe('move',30,20)}).doc;assert.equal(model(offset).model.groups.length,3);assert.equal(computeFlatFold(offset).layers.status,'solved');
});
test('a post-transform ray anchor follows the actual moved source edge and keeps world direction input',()=>{
 const d=fixture('ray'),c=model(d),ray=c.model.groups[2];assert.equal(ray.anchors![0].source,c.model.groups[1].id);const changed=editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:c.model.groups[1].id,recipe:recipe('move',30,20)}).doc;assert.equal(model(changed).model.groups.length,3);assert.deepEqual(model(changed).model.groups[2].recipe.kind==='material-face-ray'?model(changed).model.groups[2].recipe.through:null,[80,100]);assert.ok(changed.segments.some(s=>s.assignment==='F'&&s.a[0]===80&&s.a[1]===20));const before=JSON.stringify(d);assert.throws(()=>editMaterialCurveModel(d,{kind:'material-curve-group-remove',group:c.model.groups[1].id}),/依赖.*删除/);assert.equal(JSON.stringify(d),before);
});
test('a transform of one cut piece retains the bank source and leaves the other CP/FF piece exact',()=>{
 const source=topologyModelCase('cut'),m=mat(source),d=fixture('cut'),c=model(d),selected=m.components[0],other=m.components[1],after=mat(d);assert.equal(c.model.groups[2].selection![0].source,c.model.groups[1].id);for(const v of other.vertices){assert.deepEqual(after.graph.vertices_coords[v],m.graph.vertices_coords[v]);assert.deepEqual(after.foldedVertices![v],m.foldedVertices![v]);}for(const v of selected.vertices)assert.deepEqual(after.graph.vertices_coords[v],[m.graph.vertices_coords[v][0]+20,m.graph.vertices_coords[v][1]+10]);assert.throws(()=>editMaterialCurveModel(d,{kind:'material-curve-group-remove',group:c.model.groups[1].id}),/依赖.*删除/);
});
test('mirror and scale preserve real holes, face winding, cut identities and mesh preparation',()=>{
 const source=weakToolSheet(true);for(const r of [recipe('mirrorX',0),recipe('mirrorY',0),recipe('scale',1.5)]){const d=editMaterialFaces(source,{...r,parametric:true}).doc;assert.equal(mat(d).components[0].boundaryLoops.length,2);assert.equal(model(d).model.groups.length,1);assert.equal(computeFlatFold(d).layers.status,'solved');prepareSimulationDocument(mat(d).graph);}
});
test('JSON/FOLD preserve parameter transforms and permit reedit/removal without returning to stale geometry',()=>{
 const d=fixture('two'),id=model(d).model.groups[2].id;for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc;assert.deepEqual(model(back).model,model(d).model);const changed=editMaterialCurveModel(back,{kind:'material-curve-group-edit',group:id,recipe:recipe('rotate',45)}).doc;assert.equal(model(changed).model.groups.length,3);const removed=editMaterialCurveModel(changed,{kind:'material-curve-group-remove',group:id}).doc;same(removed,fixture('moved'));assert.equal(exportDXF(changed).text,exportDXF(editMaterialCurveModel(d,{kind:'material-curve-group-edit',group:id,recipe:recipe('rotate',45)}).doc).text);}
});
test('transform commits are independently verified and keep annotations, current styles, paper and history',()=>{
 const source=fixture('source');source.metadata!.userNote='当前';source.segments.push({id:'transform-aux',a:[2,4],b:[8,9],assignment:'A',angle:null});source.objects=[{id:'note',kind:'text',position:[5,5],text:'当前',fontSize:12,color:'#123456'}];source.segments[0].displayColor='#abcdef';const intent={...recipe(),parametric:true},r=editMaterialFaces(source,intent);assert.deepEqual(prepareEditorCommit(source,r.doc,intent).doc,r.doc);assert.deepEqual(r.doc.segments.find(s=>s.id==='transform-aux'),source.segments.at(-1));assert.deepEqual(r.doc.objects,source.objects);assert.deepEqual(r.doc.paper,source.paper);assert.equal(r.doc.segments[0].displayColor,'#abcdef');let h=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:r.doc});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,source);h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,r.doc);const bad=structuredClone(r.doc);bad.name='伪造';assert.throws(()=>prepareEditorCommit(source,bad,intent),/独立重放/);
});
test('invalid numbers, ignored arguments, component selection, flags and forged source references reject',()=>{
 const d=fixture('source'),before=JSON.stringify(d);for(const patch of [{components:[]},{components:[0,0]},{components:[99]},{operation:{kind:'scale',a:0}},{operation:{kind:'rotate',a:Infinity}},{operation:{kind:'rotate',a:1,b:1}},{operation:{kind:'mirrorX',a:1}},{operation:{kind:'move',a:NaN}}])assert.throws(()=>editMaterialFaces(d,{...recipe(),...patch} as any));for(const flag of [undefined,null,'true'])assert.throws(()=>editMaterialFaces(d,{...recipe(),parametric:flag} as any));assert.equal(JSON.stringify(d),before);const saved=fixture('moved');for(const mutate of [(m:any)=>m.schema='zhezhi-material-curve-model-v4',(m:any)=>m.groups[1].selection[0].source=m.groups[1].id,(m:any)=>m.groups[1].recipe.components=[99],(m:any)=>m.groups[1].selection=[]]){const bad=structuredClone(saved);mutate(bad.metadata!.materialCurveModel);assert.equal(inspectMaterialCurveModel(bad).ok,false);}
});
test('capacity and stale archival keep all previous work, while an unplaced source stays without FF',()=>{
 let d=fixture('source');for(let i=0;i<7;i++)d=editMaterialFaces(d,{...recipe('move',1,0),parametric:true}).doc;assert.equal(model(d).model.groups.length,8);const before=JSON.stringify(d);assert.throws(()=>editMaterialFaces(d,{...recipe(),parametric:true}),/最多8/);assert.equal(JSON.stringify(d),before);
 const source=fixture('moved'),stale=editMaterialFaces(source,recipe('move',2,3)).doc,old=stale.metadata!.materialCurveModel,saved=editMaterialFaces(stale,{...recipe('move',5,6),parametric:true}).doc;assert.deepEqual((saved.metadata!.materialCurveArchives as unknown[])[0],old);assert.deepEqual(model(saved).model.base.topology.graph,mat(stale).graph);assert.equal(model(saved).model.groups.length,1);
 const empty=traceModelBase(),m=mat(empty);empty.metadata!.materialTopology=createMaterialTopology(empty,m.graph,m.edgeSegmentIds,{startingFace:0});const unplaced=editMaterialFaces(empty,{...recipe(),parametric:true});assert.equal(unplaced.placement,'unavailable');assert.equal(mat(unplaced.doc).foldedVertices,undefined);assert.ok(model(unplaced.doc));
});
