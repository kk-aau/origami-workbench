import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point,FoldGraph} from '../../src/core/types';
import {editMaterialFaces,type MaterialFaceRayIntent} from '../../src/core/materialFaceEdit';
import {materialDoc,materialSlitFixture} from '../fixtures/materialModel';
import {joinMaterialEdges} from '../../src/core/materialJoin';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {computeFlatFold} from '../../src/core/flatFold';
import {importDocument,exportDocument} from '../../src/core/formats';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {materialCanonical} from '../../src/core/materialFaceCommon';
function material(doc:Doc){const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;}
function grid(){const {source,banks}=materialSlitFixture(),m=material(source);return joinMaterialEdges(source,{kind:'material-join',pairs:[{first:m.edgeSegmentIds[banks[0]],second:m.edgeSegmentIds[banks[1]],assignment:'F'}]}).doc;}
function ray(doc:Doc,x=100,y=50):MaterialFaceRayIntent{const m=material(doc),e=m.graph.edges_vertices.findIndex(([a,b])=>m.graph.vertices_coords[a][0]===x&&m.graph.vertices_coords[b][0]===x&&Math.min(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])<y&&Math.max(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])>y);assert.ok(e>=0);const [a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]);return {kind:'material-face-ray',component:'all',from:{edgeId:m.edgeSegmentIds[e],fraction:(y-a[1])/(b[1]-a[1])},through:[x+1,y],assignment:'F',fixedSide:'left',cpOnly:false};}
test('forward ray extends past direction point, never constructs behind its origin and preserves old geometry',()=>{
 const doc=grid(),old=material(doc),before=JSON.stringify(doc),req=ray(doc),r=editMaterialFaces(doc,req),m=material(r.doc);assert.equal(JSON.stringify(doc),before);assert.equal(r.trace!.pieces,2);assert.equal(r.ray!.materialLength,200);assert.equal(r.ray!.blankLength,0);assert.equal(r.ray!.reachedLength,200);assert.equal(r.facesAfter,r.facesBefore+2);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);for(const s of r.doc.segments.filter(s=>r.insertedIds!.includes(s.id))){assert.ok(s.a[0]>=100&&s.b[0]>=100);assert.equal(s.a[1],50);assert.equal(s.b[1],50);}assert.deepEqual(editMaterialFaces(doc,{...req,through:[200,50]}).doc,r.doc);
});
test('ray crosses independent sheets without drawing in the gap or welding identities',()=>{
 const vertices:Point[]=[[0,0],[100,0],[100,100],[0,100],[300,0],[400,0],[400,100],[300,100]],graph:FoldGraph={vertices_coords:vertices,edges_vertices:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],edges_assignment:Array(8).fill('B'),edges_foldAngle:Array(8).fill(null),faces_vertices:[[0,1,2,3],[4,5,6,7]],faces_edges:[[0,1,2,3],[4,5,6,7]],edges_faces:Array.from({length:8},(_,e)=>[Math.floor(e/4)]),faces_faces:[[null,null,null,null],[null,null,null,null]] as unknown as number[][]},doc=materialDoc(graph,vertices),r=editMaterialFaces(doc,ray(doc,0));assert.equal(r.ray!.materialLength,200);assert.equal(r.ray!.blankLength,200);assert.equal(r.ray!.reachedLength,400);assert.equal(material(r.doc).components.length,2);assert.equal(r.insertedIds!.length,2);assert.ok(r.doc.segments.filter(s=>r.insertedIds!.includes(s.id)).every(s=>Math.max(s.a[0],s.b[0])<=100||Math.min(s.a[0],s.b[0])>=300));
});
test('M ray across the whole F grid genuinely refolds; partial M requires explicit CP-only',()=>{
 const doc=grid(),r=editMaterialFaces(doc,{...ray(doc,0),assignment:'M'});assert.equal(r.placement,'recomputed');assert.equal(computeFlatFold(r.doc).layers.status,'solved');assert.throws(()=>editMaterialFaces(doc,{...ray(doc),assignment:'M'}),/闭合|一致|角度|折角/);const cp=editMaterialFaces(doc,{...ray(doc),assignment:'M',cpOnly:true});assert.equal(cp.placement,'unavailable');assert.equal(material(cp.doc).foldedVertices,undefined);
});
test('direction, bank identity, outward and overlapping rays reject atomically',()=>{
 const doc=grid(),req=ray(doc,0),before=JSON.stringify(doc);for(const patch of [{through:[0,50]},{through:[-1,50]},{through:[NaN,50]},{through:[0,80]},{from:{...req.from,edgeId:'missing'}},{component:999}])assert.throws(()=>editMaterialFaces(doc,{...req,...patch} as MaterialFaceRayIntent));assert.equal(JSON.stringify(doc),before);
});
test('ray uses one history transaction and verified replay; actual JSON/FOLD roundtrips preserve material',()=>{
 const doc=grid(),req=ray(doc),r=editMaterialFaces(doc,req),m=material(r.doc);assert.deepEqual(prepareEditorCommit(doc,r.doc,req).doc,r.doc);let h=editorHistoryReducer(emptyEditorHistory(doc),{type:'commit',doc:r.doc});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,doc);h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,r.doc);for(const format of ['json','fold'] as const){const restored=importDocument(exportDocument(r.doc,format).text,format).doc,x=material(restored);assert.deepEqual(x.graph,m.graph);assert.deepEqual(x.foldedVertices,m.foldedVertices);}const bad=structuredClone(r.doc);bad.name='forged';assert.throws(()=>prepareEditorCommit(doc,bad,req),/独立重放/);
});
test('a forward ray through a hole clips both material intervals and keeps the hole boundary',()=>{
 const p:Point[]=[[0,0],[100,0],[100,100],[0,100],[40,40],[60,40],[60,60],[40,60]],g=materialCanonical(p,[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],Array(8).fill('B'),Array(8).fill(null),[[0,1,2,3]],[[0,1,2,3]],[[[4,7,6,5]]],[[[7,6,5,4]]]),doc=materialDoc(g,p),m=material(doc);
 const request:MaterialFaceRayIntent={kind:'material-face-ray',component:0,from:{edgeId:m.edgeSegmentIds[0],fraction:.5},through:[50,1],assignment:'M',fixedSide:'left',cpOnly:false},r=editMaterialFaces(doc,request),after=material(r.doc);assert.equal(r.ray!.materialLength,80);assert.equal(r.ray!.blankLength,20);assert.equal(r.trace!.pieces,2);assert.equal(after.components[0].boundaryLoops.length,2);assert.equal(computeFlatFold(r.doc).layers.status,'solved');for(const s of r.doc.segments.filter(s=>r.insertedIds!.includes(s.id)))assert.ok(Math.max(s.a[1],s.b[1])<=40||Math.min(s.a[1],s.b[1])>=60);
});
test('ray origin on one slit bank keeps both coincident bank identities and synchronized split points',()=>{
 const {source,banks}=materialSlitFixture(),before=material(source),e=banks[0],r=editMaterialFaces(source,{kind:'material-face-ray',component:'all',from:{edgeId:before.edgeSegmentIds[e],fraction:.5},through:[150,99],assignment:'F',fixedSide:'left',cpOnly:false}),after=material(r.doc);
 assert.equal(r.ray!.materialLength,100);assert.equal(r.ray!.blankLength,0);assert.ok(r.synchronizedBanks>=1);assert.equal(after.graph.vertices_coords.filter(p=>p[0]===150&&p[1]===100).length,2);assert.equal(after.components.length,before.components.length);assert.deepEqual(after.graph.vertices_coords.slice(0,before.graph.vertices_coords.length),before.graph.vertices_coords);
});
