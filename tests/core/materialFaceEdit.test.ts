import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,FoldGraph,Point} from '../../src/core/types';
import {editMaterialFaces,type MaterialFaceInsertIntent} from '../../src/core/materialFaceEdit';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {materialDoc,materialCutFixture,materialSlitFixture} from '../fixtures/materialModel';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {resolveStartingFace,setStartingFace} from '../../src/app/flatFoldSettings';
import {computeFlatFold} from '../../src/core/flatFold';
import {importDocument,exportDocument} from '../../src/core/formats';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {joinMaterialEdges} from '../../src/core/materialJoin';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';

function material(doc:Doc){const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;}
function polygon(points:Point[]):Doc{
 const n=points.length,edges=points.map((_,v)=>[v,(v+1)%n] as [number,number]);
 return materialDoc({vertices_coords:points,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0),faces_vertices:[points.map((_,v)=>v)],faces_edges:[points.map((_,v)=>v)],edges_faces:edges.map(()=>[0]),faces_faces:[points.map(()=>null)] as unknown as number[][]},points);
}
const square=()=>polygon([[0,0],[100,0],[100,100],[0,100]]);
function request(doc:Doc,kind:'M'|'V'|'F'|'U'='F'):MaterialFaceInsertIntent{const m=material(doc);return {kind:'material-face-insert',face:0,from:{edgeId:m.edgeSegmentIds[0],fraction:.5},to:{edgeId:m.edgeSegmentIds[2],fraction:.5},assignment:kind,fixedPart:0};}

test('face chord splits two boundary edges, preserves exact source points and F placement',()=>{
 const doc=square(),before=JSON.stringify(doc),old=material(doc),r=editMaterialFaces(doc,request(doc)),m=material(r.doc);
 assert.equal(JSON.stringify(doc),before);assert.equal(r.facesBefore,1);assert.equal(r.facesAfter,2);assert.equal(r.addedVertices,2);assert.equal(r.placement,'preserved');
 assert.deepEqual(m.graph.vertices_coords.slice(0,4),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices,m.graph.vertices_coords);assert.equal(m.graph.edges_vertices.length,7);assert.equal(m.components.length,1);
 assert.deepEqual(r.descendants.get(old.edgeSegmentIds[0]),[old.edgeSegmentIds[0],`${old.edgeSegmentIds[0]}::face-part`]);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('M/V subdivision re-folds from the chosen child of the original fixed face',()=>{
 for(const assignment of ['M','V'] as const)for(const fixedPart of [0,1] as const){
  const source=setStartingFace(square(),0),req={...request(source,assignment),fixedPart},r=editMaterialFaces(source,req),m=material(r.doc),root=fixedPart===0?0:1;
  assert.equal(r.placement,'recomputed');assert.equal(m.startingFace,root);assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:root,stale:false});
  m.graph.faces_vertices![root].forEach(v=>assert.ok(Math.hypot(m.foldedVertices![v][0]-m.graph.vertices_coords[v][0],m.foldedVertices![v][1]-m.graph.vertices_coords[v][1])<1e-10));
  assert.equal(computeFlatFold(r.doc).layers.status,'solved');
 }
});
test('unknown chord geometry does not invent layer certainty, and no FF remains absent',()=>{
 const source=square(),unknown=editMaterialFaces(source,request(source,'U'));assert.equal(computeFlatFold(unknown.doc).geometry.status,'ready');assert.equal(computeFlatFold(unknown.doc).layers.status,'unknown');
 delete (source.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;const noFF=editMaterialFaces(source,request(source,'M'));assert.equal(noFF.placement,'unavailable');assert.equal(material(noFF.doc).foldedVertices,undefined);
});
test('existing vertex endpoints do not add vertices and collision-safe IDs preserve metadata and style',()=>{
 const doc=square(),req=request(doc);doc.metadata!.custom={x:2};doc.segments[0].displayColor='#123456';doc.segments.push({id:'material-face-crease',a:[0,0],b:[1,1],assignment:'A',angle:0});
 req.from.fraction=0;req.to.fraction=0;const r=editMaterialFaces(doc,req),m=material(r.doc);assert.equal(r.addedVertices,0);assert.equal(m.graph.vertices_coords.length,4);assert.equal(r.insertedId,'material-face-crease-1');assert.deepEqual(r.doc.metadata!.custom,{x:2});assert.equal(r.doc.segments[0].displayColor,'#123456');assert.equal(r.doc.segments.find(s=>s.id==='material-face-crease')!.assignment,'A');
});
test('subdivision of a shared edge updates both incident faces without moving other banks',()=>{
 const source=materialSlitFixture().source,old=material(source),face=4,edges=old.graph.faces_edges![face],req:MaterialFaceInsertIntent={kind:'material-face-insert',face,from:{edgeId:old.edgeSegmentIds[edges[1]],fraction:.35},to:{edgeId:old.edgeSegmentIds[edges[3]],fraction:.65},assignment:'F',fixedPart:0};
 const r=editMaterialFaces(source,req),m=material(r.doc);assert.equal(m.graph.faces_vertices!.length,10);assert.equal(m.components.length,old.components.length);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);
 const splitIDs=r.descendants.get(req.from.edgeId)!;assert.equal(splitIDs.length,2);for(const id of splitIDs)assert.equal(m.graph.edges_faces![m.edgeSegmentIds.indexOf(id)].length,2);
});
test('a slit bank synchronizes the opposite partition using distinct vertices and without an across-bank hinge',()=>{
 const {source,banks}=materialSlitFixture(),old=material(source),e=banks[0],other=banks[1],f=old.graph.edges_faces![e][0],faceEdges=old.graph.faces_edges![f],k=faceEdges.indexOf(e),opposite=faceEdges[(k+2)%faceEdges.length];
 const r=editMaterialFaces(source,{kind:'material-face-insert',face:f,from:{edgeId:old.edgeSegmentIds[e],fraction:.5},to:{edgeId:old.edgeSegmentIds[opposite],fraction:.5},assignment:'F',fixedPart:0}),m=material(r.doc);
 assert.equal(r.synchronizedBanks,1);const bankIDs=r.descendants.get(old.edgeSegmentIds[e])!,otherIDs=r.descendants.get(old.edgeSegmentIds[other])!;assert.equal(otherIDs.length,2);assert.equal(bankIDs.length,2);
 const bankPoint=m.graph.edges_vertices[m.edgeSegmentIds.indexOf(bankIDs[0])][1],otherPoint=m.graph.edges_vertices[m.edgeSegmentIds.indexOf(otherIDs[0])][1];assert.notEqual(bankPoint,otherPoint);assert.deepEqual(m.graph.vertices_coords[bankPoint],m.graph.vertices_coords[otherPoint]);
 for(const id of [...bankIDs,...otherIDs]){const i=m.edgeSegmentIds.indexOf(id);assert.equal(m.graph.edges_assignment[i],'B');assert.equal(m.graph.edges_faces![i].length,1);}assert.equal(m.components.length,1);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('concave faces accept interior diagonals and reject chords outside or touching intervening corners',()=>{
 const source=polygon([[0,0],[100,0],[100,40],[40,40],[40,100],[0,100]]),ids=material(source).edgeSegmentIds;
 const req:MaterialFaceInsertIntent={kind:'material-face-insert',face:0,from:{edgeId:ids[0],fraction:0},to:{edgeId:ids[3],fraction:0},assignment:'F',fixedPart:0};
 assert.equal(editMaterialFaces(source,req).facesAfter,2);
 const bad={...req,from:{edgeId:ids[1],fraction:0},to:{edgeId:ids[4],fraction:0}};assert.throws(()=>editMaterialFaces(source,bad));
});
test('deleting F chord unions its face polygons; boundary splits remain exact and styles survive',()=>{
 const source=square(),split=editMaterialFaces(source,request(source)),old=material(split.doc),r=editMaterialFaces(split.doc,{kind:'material-face-remove',segmentIds:[split.insertedId!]}),m=material(r.doc);
 assert.equal(r.facesAfter,1);assert.equal(r.removedEdges,1);assert.equal(r.placement,'preserved');assert.deepEqual(m.graph.vertices_coords,old.graph.vertices_coords);assert.deepEqual(r.descendants.get(split.insertedId!),[]);assert.equal(m.graph.faces_vertices![0].length,6);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('deleting a folded crease restores a rigid combined face while anchoring the previous chosen side',()=>{
 const source=square(),split=editMaterialFaces(source,{...request(source,'M'),fixedPart:1}),old=material(split.doc),r=editMaterialFaces(split.doc,{kind:'material-face-remove',segmentIds:[split.insertedId!]}),m=material(r.doc);
 assert.equal(r.placement,'recomputed');assert.equal(m.startingFace,0);old.graph.faces_vertices![1].forEach(v=>assert.ok(Math.hypot(m.foldedVertices![v][0]-old.foldedVertices![v][0],m.foldedVertices![v][1]-old.foldedVertices![v][1])<1e-9));assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('batch removal consumes only selected interior edges and removes orphaned indexed vertices',()=>{
 const {source,banks}=materialSlitFixture(),old=material(source),joined=joinMaterialEdges(source,{kind:'material-join',pairs:[{first:old.edgeSegmentIds[banks[0]],second:old.edgeSegmentIds[banks[1]],assignment:'F'}]}).doc,m=material(joined),ids=m.edgeSegmentIds.filter((_,e)=>m.graph.edges_assignment[e]!=='B');
 const r=editMaterialFaces(joined,{kind:'material-face-remove',segmentIds:ids}),next=material(r.doc);assert.equal(r.facesBefore,9);assert.equal(r.facesAfter,1);assert.equal(next.graph.vertices_coords.length,12);assert.equal(next.graph.edges_vertices.length,12);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
 assert.throws(()=>editMaterialFaces(joined,{kind:'material-face-remove',segmentIds:ids.slice(1)}),/未删除折痕/);
});
test('invalid anchors, boundary deletion, unknown fields and inconsistent hinge loops reject atomically',()=>{
 const source=square(),before=JSON.stringify(source),req=request(source);
 for(const bad of [{...req,face:9},{...req,from:{edgeId:'missing',fraction:.5}},{...req,to:req.from},{...req,from:{...req.from,fraction:NaN}},{...req,extra:true},{...req,to:{edgeId:source.segments[0].id,fraction:0}},{kind:'material-face-remove',segmentIds:[source.segments[0].id]},{kind:'material-face-remove',segmentIds:[]}])assert.throws(()=>editMaterialFaces(source,bad as typeof req));
 assert.equal(JSON.stringify(source),before);
 const grid=materialSlitFixture().source,m=material(grid),fe=m.graph.faces_edges![4];assert.throws(()=>editMaterialFaces(grid,{kind:'material-face-insert',face:4,from:{edgeId:m.edgeSegmentIds[fe[1]],fraction:.5},to:{edgeId:m.edgeSegmentIds[fe[3]],fraction:.5},assignment:'M',fixedPart:0}),/闭合|一致/);
});
test('declared edits replay complete documents, history and JSON/FOLD preserve indexed topology and FF',()=>{
 const source=square(),req=request(source,'V'),r=editMaterialFaces(source,req),next=prepareEditorCommit(source,r.doc,req);assert.deepEqual(next.doc,r.doc);assert.throws(()=>prepareEditorCommit(source,r.doc));const bad=structuredClone(r.doc);bad.name='altered';assert.throws(()=>prepareEditorCommit(source,bad,req),/独立重放/);
 let history=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:next.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,source);history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,next.doc);
 for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(r.doc,format).text,format).doc;assert.deepEqual(material(loaded).graph,material(r.doc).graph);assert.deepEqual(material(loaded).foldedVertices,material(r.doc).foldedVertices);assert.equal(computeFlatFold(loaded).layers.status,'solved');}
 const cut=cutMaterialEdges(r.doc,{kind:'material-cut',segmentIds:[r.insertedId!]}),ids=cut.descendants.get(r.insertedId!)!;const restored=joinMaterialEdges(cut.doc,{kind:'material-join',pairs:[{first:ids[0],second:ids[1],assignment:'V'}]});assert.deepEqual(material(restored.doc).graph,material(r.doc).graph);
});
test('actual Origamica material permits subdivision without losing any original CP/FF or cut identity',()=>{
 const source=materialCutFixture().source,m=material(source);let success:ReturnType<typeof editMaterialFaces>|undefined;
 for(const [face,vs]of m.graph.faces_vertices!.entries()){if(vs.length<4)continue;const es=m.graph.faces_edges![face];try{success=editMaterialFaces(source,{kind:'material-face-insert',face,from:{edgeId:m.edgeSegmentIds[es[0]],fraction:0},to:{edgeId:m.edgeSegmentIds[es[2]],fraction:0},assignment:'F',fixedPart:0});break;}catch{/* Search valid interior diagonals, never weaken topology checks. */}}
 assert.ok(success);assert.equal(success.placement,'preserved');assert.deepEqual(material(success.doc).graph.vertices_coords,m.graph.vertices_coords);assert.deepEqual(material(success.doc).foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(success.doc).layers.status,'solved');
});

test('successive face chords create one shared crossing, then real M/V assignment and deletion roundtrip',()=>{
 const first=editMaterialFaces(square(),request(square(),'F'));
 const second=editMaterialFaces(first.doc,{kind:'material-face-insert',face:0,from:{edgeId:'material-edge-1',fraction:.5},to:{edgeId:first.insertedId!,fraction:.5},assignment:'F',fixedPart:0});
 const third=editMaterialFaces(second.doc,{kind:'material-face-insert',face:1,from:{edgeId:'material-edge-3',fraction:.5},to:{edgeId:first.insertedId!,fraction:1},assignment:'F',fixedPart:0}),m=material(third.doc);
 const centers=m.graph.vertices_coords.flatMap((p,v)=>p[0]===50&&p[1]===50?[v]:[]);assert.equal(centers.length,1);assert.equal(m.graph.faces_vertices!.length,4);assert.equal(m.graph.edges_vertices.filter(([a,b])=>a===centers[0]||b===centers[0]).length,4);
 const inside=m.edgeSegmentIds.filter((_,e)=>m.graph.edges_assignment[e]!=='B');
 // Existing atomic assignment editing accepts all four hinges together; the
 // subsequent single M→V change keeps geometry but gives valid 3M/1V layers.
 const mountains=prepareEditorCommit(third.doc,{...third.doc,segments:third.doc.segments.map(s=>inside.includes(s.id)?{...s,assignment:'M',angle:-180}:s)}).doc;
 const folded=prepareEditorCommit(mountains,{...mountains,segments:mountains.segments.map(s=>s.id===inside[0]?{...s,assignment:'V',angle:180}:s)}).doc;assert.equal(computeFlatFold(folded).layers.status,'solved');
 const removed=editMaterialFaces(folded,{kind:'material-face-remove',segmentIds:inside});assert.equal(removed.facesAfter,1);assert.equal(material(removed.doc).graph.vertices_coords.length,8);assert.equal(computeFlatFold(removed.doc).layers.status,'solved');
});
