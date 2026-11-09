import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,FoldGraph,Point} from '../../src/core/types';
import {joinMaterialEdges,type MaterialJoinIntent} from '../../src/core/materialJoin';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {materialDoc,materialSlitFixture,materialCutFixture} from '../fixtures/materialModel';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {setStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {computeFlatFold} from '../../src/core/flatFold';
import {importDocument,exportDocument} from '../../src/core/formats';
import {transformSelection} from '../../src/app/state';

function material(doc:Doc){const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;}
function hinged():Doc{
 const vertices:Point[]=[[0,0],[100,0],[200,0],[0,100],[100,100],[200,100]];
 const graph:FoldGraph={vertices_coords:vertices,edges_vertices:[[0,1],[1,2],[2,5],[5,4],[4,3],[3,0],[1,4]],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[0,0,0,0,0,0,-180],faces_vertices:[[0,1,4,3],[1,2,5,4]],faces_edges:[[0,6,4,5],[1,2,3,6]],edges_faces:[[0],[1],[1],[1],[0],[0],[0,1]],faces_faces:[[null,1,null,null],[null,null,null,0]] as unknown as number[][]};
 return materialDoc(graph,[[0,0],[100,0],[0,0],[0,100],[100,100],[0,100]]);
}
function separated(){const source=hinged(),cut=cutMaterialEdges(source,{kind:'material-cut',segmentIds:[source.segments[6].id]});return {source,cut,ids:cut.descendants.get(source.segments[6].id)!};}
const intent=(ids:string[],assignment:'M'|'V'|'F'|'U'='M'):MaterialJoinIntent=>({kind:'material-join',pairs:[{first:ids[0],second:ids[1],assignment}]});

test('joining explicit cut banks restores the original graph and exact FF without moving CP',()=>{
 const {source,cut,ids}=separated(),before=JSON.stringify(cut.doc),result=joinMaterialEdges(cut.doc,intent(ids)),old=material(source),next=material(result.doc);
 assert.equal(JSON.stringify(cut.doc),before);assert.equal(result.placement,'preserved');assert.equal(result.componentsBefore,2);assert.equal(result.componentsAfter,1);assert.equal(result.mergedVertices,2);
 assert.deepEqual(next.graph,old.graph);assert.deepEqual(next.foldedVertices,old.foldedVertices);
 assert.deepEqual(result.descendants.get(ids[1]),[ids[0]]);assert.equal(result.doc.segments.find(s=>s.id===ids[0])!.assignment,'M');
 assert.equal(computeFlatFold(result.doc).layers.status,'solved');
});

test('explicit flat join re-folds the merged component and preserves its root face',()=>{
 const {cut,ids}=separated(),r=joinMaterialEdges(cut.doc,intent(ids,'F')),m=material(r.doc),old=material(cut.doc);
 assert.equal(r.placement,'recomputed');assert.deepEqual(m.foldedVertices,m.graph.vertices_coords);
 const root=old.graph.faces_vertices![0];root.forEach(v=>assert.deepEqual(m.foldedVertices![v],old.foldedVertices![v]));
 assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});

test('joining with a different chosen root keeps that source face anchored',()=>{
 const {cut,ids}=separated(),doc=setStartingFace(cut.doc,1),old=material(doc),r=joinMaterialEdges(doc,intent(ids,'F')),m=material(r.doc);
 assert.equal(m.startingFace,old.startingFace);assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:1,stale:false});
 const before=old.graph.faces_vertices![1],after=m.graph.faces_vertices![1];
 after.forEach((v,k)=>assert.ok(Math.hypot(m.foldedVertices![v][0]-old.foldedVertices![before[k]][0],m.foldedVertices![v][1]-old.foldedVertices![before[k]][1])<1e-9));
});

test('an internal slit with shared tips closes by explicit edge slots, without losing unrelated banks',()=>{
 const {source,banks}=materialSlitFixture(),old=material(source),ids=banks.map(e=>old.edgeSegmentIds[e]),r=joinMaterialEdges(source,intent(ids,'F')),m=material(r.doc);
 assert.equal(r.componentsBefore,1);assert.equal(r.componentsAfter,1);assert.equal(r.mergedVertices,0);assert.equal(m.graph.edges_vertices.length,old.graph.edges_vertices.length-1);
 assert.equal(m.components[0].boundaryLoops.length,1);assert.deepEqual(m.foldedVertices,old.foldedVertices);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});

test('actual Origamica material survives new cut then explicit join and JSON/FOLD re-fold',()=>{
 const {source}=materialCutFixture(),old=material(source),e=old.graph.edges_assignment.findIndex(k=>k!=='B'),id=old.edgeSegmentIds[e];
 const cut=cutMaterialEdges(source,{kind:'material-cut',segmentIds:[id]}),r=joinMaterialEdges(cut.doc,intent(cut.descendants.get(id)!,'V')),m=material(r.doc);
 assert.equal(r.placement,'preserved');assert.equal(m.components.length,old.components.length);assert.deepEqual(m.graph,old.graph);assert.deepEqual(m.foldedVertices,old.foldedVertices);
 for(const format of ['json','fold'] as const){const doc=importDocument(exportDocument(r.doc,format).text,format).doc;assert.deepEqual(material(doc).graph,m.graph);assert.deepEqual(material(doc).foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(doc).layers.status,'solved');}
});

test('M/V and unassigned joins keep geometry semantics distinct from layer certainty',()=>{
 const {cut,ids}=separated();
 const valley=joinMaterialEdges(cut.doc,intent(ids,'V')).doc;assert.equal(valley.segments.find(s=>s.id===ids[0])!.angle,180);assert.equal(computeFlatFold(valley).layers.status,'solved');
 const unknown=joinMaterialEdges(cut.doc,intent(ids,'U')).doc;assert.equal(unknown.segments.find(s=>s.id===ids[0])!.angle,null);assert.equal(computeFlatFold(unknown).geometry.status,'ready');assert.equal(computeFlatFold(unknown).layers.status,'unknown');
});

test('declared joins replay atomically, reject altered proposals and undo/redo exact identity',()=>{
 const {cut,ids}=separated(),request=intent(ids),r=joinMaterialEdges(cut.doc,request),next=prepareEditorCommit(cut.doc,r.doc,request);
 assert.deepEqual(next.doc,r.doc);assert.deepEqual(next.descendants.get(ids[1]),[ids[0]]);
 let history=editorHistoryReducer(emptyEditorHistory(cut.doc),{type:'commit',doc:next.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,cut.doc);history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,next.doc);
 assert.throws(()=>prepareEditorCommit(cut.doc,r.doc),/合同|身份/);
 const bad=structuredClone(r.doc);bad.name='bad';assert.throws(()=>prepareEditorCommit(cut.doc,bad,request),/独立重放/);
});

test('bad, reused, nonboundary or noncoincident seam selections never modify input',()=>{
 const {cut,ids}=separated(),before=JSON.stringify(cut.doc),m=material(cut.doc);
 for(const request of [intent([]),intent([ids[0],ids[0]]),intent([ids[0],'missing']),{...intent(ids),extra:true}, {kind:'material-join',pairs:[...intent(ids).pairs,...intent(ids).pairs]},intent([m.edgeSegmentIds[0],m.edgeSegmentIds[1]])])assert.throws(()=>joinMaterialEdges(cut.doc,request as MaterialJoinIntent));
 assert.equal(JSON.stringify(cut.doc),before);
 const source=hinged();assert.throws(()=>joinMaterialEdges(source,intent([source.segments[6].id,source.segments[0].id])),/只能粘合/);
});

test('unplaced material remains unplaced and explicit first-bank styling wins',()=>{
 const {cut,ids}=separated();delete (cut.doc.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;
 cut.doc.segments.find(s=>s.id===ids[0])!.displayColor='#123456';cut.doc.segments.find(s=>s.id===ids[1])!.displayColor='#654321';
 const r=joinMaterialEdges(cut.doc,intent(ids)),m=material(r.doc);assert.equal(r.placement,'unavailable');assert.equal(m.foldedVertices,undefined);assert.equal(r.doc.segments.find(s=>s.id===ids[0])!.displayColor,'#123456');
});

test('a closed cut can be joined as a batch, and an inconsistent hinge cycle rejects atomically',()=>{
 const {source,banks}=materialSlitFixture(),old=material(source),base=joinMaterialEdges(source,intent(banks.map(e=>old.edgeSegmentIds[e]),'F')).doc,grid=material(base);
 const ids=grid.graph.faces_edges![4].map(e=>grid.edgeSegmentIds[e]);
 const cut=cutMaterialEdges(base,{kind:'material-cut',segmentIds:ids});
 const request:MaterialJoinIntent={kind:'material-join',pairs:ids.map(id=>{const [first,second]=cut.descendants.get(id)!;return {first,second,assignment:'F'};})};
 const restored=joinMaterialEdges(cut.doc,request);assert.equal(restored.joinedPairs,4);assert.equal(restored.componentsBefore,2);assert.equal(restored.componentsAfter,1);assert.deepEqual(material(restored.doc).graph,grid.graph);
 const before=JSON.stringify(cut.doc),bad=structuredClone(request);bad.pairs[0].assignment='M';
 assert.throws(()=>joinMaterialEdges(cut.doc,bad),/闭合|一致/);assert.equal(JSON.stringify(cut.doc),before);
});

test('sub-tolerance gaps are rejected without endpoint snapping',()=>{
 const {cut,ids}=separated(),m=material(cut.doc),component=m.components.find(c=>c.faces.includes(1))!,chosen=new Set(component.edges.map(e=>m.edgeSegmentIds[e]));
 const moved=prepareEditorCommit(cut.doc,transformSelection(cut.doc,chosen,'move',1e-9,0),{kind:'move',segmentIds:[...chosen],a:1e-9,b:0}).doc;
 assert.throws(()=>joinMaterialEdges(moved,intent(ids)),/完全重合/);
});
