import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import {editMaterialFaces,type MaterialFaceTraceIntent} from '../../src/core/materialFaceEdit';
import {materialDoc,materialSlitFixture,materialCutFixture} from '../fixtures/materialModel';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {joinMaterialEdges} from '../../src/core/materialJoin';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {computeFlatFold} from '../../src/core/flatFold';
import {importDocument,exportDocument} from '../../src/core/formats';
import {setStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {materialOrientation} from '../../src/core/materialTraceGeometry';

function material(doc:Doc){const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;}
function grid(){const {source,banks}=materialSlitFixture(),m=material(source);return joinMaterialEdges(source,{kind:'material-join',pairs:[{first:m.edgeSegmentIds[banks[0]],second:m.edgeSegmentIds[banks[1]],assignment:'F'}]}).doc;}
function trace(doc:Doc,y=50,assignment:'F'|'M'|'V'|'U'='F'):MaterialFaceTraceIntent{
 const m=material(doc),anchor=(x:number)=>{const e=m.graph.edges_vertices.findIndex(([a,b])=>m.graph.vertices_coords[a][0]===x&&m.graph.vertices_coords[b][0]===x&&Math.min(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])<=y&&Math.max(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])>=y);assert.ok(e>=0);const [a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]);return {edgeId:m.edgeSegmentIds[e],fraction:(y-a[1])/(b[1]-a[1])};};
 return {kind:'material-face-trace',component:0,from:anchor(0),to:anchor(300),assignment,fixedSide:'left'};
}

test('one horizontal trace crosses three F faces with unique indexed intersections and one atomic refold',()=>{
 const source=grid(),old=material(source),before=JSON.stringify(source),req=trace(source,50,'M'),r=editMaterialFaces(source,req),m=material(r.doc);
 assert.equal(JSON.stringify(source),before);assert.equal(r.trace!.pieces,3);assert.equal(r.trace!.faces,3);assert.equal(r.trace!.blankLength,0);assert.equal(r.trace!.length,300);assert.equal(r.facesBefore,9);assert.equal(r.facesAfter,12);assert.equal(r.placement,'recomputed');
 assert.equal(r.insertedIds!.length,3);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);for(const x of [0,100,200,300])assert.equal(m.graph.vertices_coords.filter(p=>p[0]===x&&p[1]===50).length,1);
 assert.equal(computeFlatFold(r.doc).layers.status,'solved');assert.deepEqual(prepareEditorCommit(source,r.doc,req).doc,r.doc);
});
test('F trace preserves FF, U trace retains unknown layer semantics and missing FF stays unavailable',()=>{
 const source=grid(),old=material(source),r=editMaterialFaces(source,trace(source));assert.equal(r.placement,'preserved');assert.deepEqual(material(r.doc).foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);
 assert.equal(computeFlatFold(editMaterialFaces(source,trace(source,50,'U')).doc).layers.status,'unknown');delete (source.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;const noFF=editMaterialFaces(source,trace(source,50,'M'));assert.equal(noFF.placement,'unavailable');assert.equal(material(noFF.doc).foldedVertices,undefined);
});
test('a trace through existing vertices uses them exactly and does not add duplicate near-corner nodes',()=>{
 const source=grid(),m=material(source),a=m.graph.vertices_coords.findIndex(p=>p[0]===0&&p[1]===0),b=m.graph.vertices_coords.findIndex(p=>p[0]===300&&p[1]===300),anchor=(v:number)=>{const e=m.graph.edges_vertices.findIndex(row=>row.includes(v));return {edgeId:m.edgeSegmentIds[e],fraction:m.graph.edges_vertices[e][0]===v?0:1};};
 const r=editMaterialFaces(source,{kind:'material-face-trace',component:0,from:anchor(a),to:anchor(b),assignment:'F',fixedSide:'right'});assert.equal(r.trace!.pieces,3);assert.equal(r.addedVertices,0);assert.equal(r.facesAfter,12);assert.deepEqual(material(r.doc).graph.vertices_coords,m.graph.vertices_coords);
});
test('slit banks remain distinct when a trace intersects both sides of a cut',()=>{
 const source=materialSlitFixture().source,m=material(source),pick=(x:number,y:number)=>{const e=m.graph.edges_vertices.findIndex(([a,b])=>{const p=m.graph.vertices_coords[a],q=m.graph.vertices_coords[b];return p[1]===y&&q[1]===y&&Math.min(p[0],q[0])<=x&&Math.max(p[0],q[0])>=x;});const [a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]);return {edgeId:m.edgeSegmentIds[e],fraction:(x-a[0])/(b[0]-a[0])};};
 const r=editMaterialFaces(source,{kind:'material-face-trace',component:0,from:pick(150,0),to:pick(150,300),assignment:'F',fixedSide:'left'}),next=material(r.doc),crossing=next.graph.vertices_coords.flatMap((p,v)=>p[0]===150&&p[1]===100?[v]:[]);
 assert.equal(r.trace!.pieces,3);assert.equal(crossing.length,2);assert.equal(next.components.length,1);assert.equal(r.synchronizedBanks,1);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('paper with a real central hole clips the trace into two material intervals and never bridges blank',()=>{
 const source=grid(),m=material(source),faces=m.graph.faces_vertices!.filter((_,f)=>f!==4),fe=m.graph.faces_edges!.filter((_,f)=>f!==4),owners=m.graph.edges_vertices.map(()=>[] as number[]);fe.forEach((row,f)=>row.forEach(e=>owners[e].push(f)));
 const g={...m.graph,faces_vertices:faces,faces_edges:fe,edges_faces:owners,edges_assignment:owners.map(row=>row.length===1?'B':'F'),edges_foldAngle:owners.map(()=>0),faces_faces:fe.map((row,f)=>row.map(e=>owners[e].find(other=>other!==f)??null)) as unknown as number[][]};
 const holed=materialDoc(g,g.vertices_coords),r=editMaterialFaces(holed,trace(holed,150,'F')),next=material(r.doc);assert.equal(next.components[0].boundaryLoops.length,2);assert.equal(r.trace!.pieces,2);assert.ok(Math.abs(r.trace!.blankLength-100)<1e-10);assert.ok(Math.abs(r.trace!.length-200)<1e-10);
 for(const id of r.insertedIds!){const s=r.doc.segments.find(s=>s.id===id)!;assert.ok(Math.max(s.a[0],s.b[0])<=100||Math.min(s.a[0],s.b[0])>=200);}
 const mountain=editMaterialFaces(holed,trace(holed,150,'M'));assert.equal(mountain.placement,'recomputed');assert.equal(computeFlatFold(mountain.doc).layers.status,'solved');
});
test('concave single face can produce multiple intervals without crossing its outside bay',()=>{
 const points:Point[]=[[0,0],[300,0],[300,300],[200,300],[200,100],[100,100],[100,300],[0,300]],n=points.length,source=materialDoc({vertices_coords:points,edges_vertices:points.map((_,v)=>[v,(v+1)%n] as [number,number]),edges_assignment:points.map(()=>'B'),edges_foldAngle:points.map(()=>0),faces_vertices:[points.map((_,v)=>v)],faces_edges:[points.map((_,v)=>v)],edges_faces:points.map(()=>[0]),faces_faces:[points.map(()=>null)] as unknown as number[][]},points),r=editMaterialFaces(source,trace(source,200));
 assert.equal(r.trace!.pieces,2);assert.equal(r.trace!.faces,1);assert.equal(r.facesAfter,3);assert.ok(Math.abs(r.trace!.blankLength-100)<1e-10);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('chosen root side, JSON/FOLD persistence and cancel-equivalent undo/redo preserve the full contract',()=>{
 const source=setStartingFace(grid(),0),req=trace(source,50,'V'),r=editMaterialFaces(source,req),m=material(r.doc);assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:m.startingFace,stale:false});m.graph.faces_vertices![m.startingFace!].forEach(v=>assert.ok(Math.hypot(m.foldedVertices![v][0]-m.graph.vertices_coords[v][0],m.foldedVertices![v][1]-m.graph.vertices_coords[v][1])<1e-9));
 assert.ok(m.graph.faces_vertices![m.startingFace!].every(v=>m.graph.vertices_coords[v][1]<=50),'visual left of a rightward line is above it on the Y-down CP canvas');
 const right=material(editMaterialFaces(source,{...req,fixedSide:'right'}).doc);assert.ok(right.graph.faces_vertices![right.startingFace!].every(v=>right.graph.vertices_coords[v][1]>=50));
 let history=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:r.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,source);history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,r.doc);
 for(const format of ['json','fold'] as const){const imported=importDocument(exportDocument(r.doc,format).text,format).doc;assert.deepEqual(material(imported).graph,m.graph);assert.deepEqual(material(imported).foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(imported).layers.status,'solved');}
 const bad=structuredClone(r.doc);bad.name='tampered';assert.throws(()=>prepareEditorCommit(source,bad,req),/独立重放/);assert.throws(()=>prepareEditorCommit(source,r.doc));
});
test('invalid input and existing collinear creases reject without modifying source',()=>{
 const source=grid(),before=JSON.stringify(source),req=trace(source),m=material(source);
 for(const bad of [{...req,component:9},{...req,from:{edgeId:'missing',fraction:.5}},{...req,to:req.from},{...req,extra:true},{...req,fixedSide:'bad'},{...req,to:{...req.to,fraction:Infinity}}])assert.throws(()=>editMaterialFaces(source,bad as MaterialFaceTraceIntent));
 assert.throws(()=>editMaterialFaces(source,trace(source,100)),/重复|重叠/);assert.equal(JSON.stringify(source),before);assert.equal(m.components.length,1);
 assert.equal(materialOrientation([0,0],[1,1],[.5,.5+Number.EPSILON]),1);assert.equal(materialOrientation([0,0],[1,1],[.5,.5]),0);
});
test('actual Origamica material can clip a chosen line without changing original coordinates or pieces',()=>{
 const source=materialCutFixture().source,m=material(source);let result:ReturnType<typeof editMaterialFaces>|undefined;
 for(const [face,vs]of m.graph.faces_vertices!.entries()){if(vs.length<4)continue;const es=m.graph.faces_edges![face];try{result=editMaterialFaces(source,{kind:'material-face-trace',component:'all',from:{edgeId:m.edgeSegmentIds[es[0]],fraction:.5},to:{edgeId:m.edgeSegmentIds[es[2]],fraction:.5},assignment:'F',fixedSide:'left'});if(computeFlatFold(result.doc).layers.status==='solved')break;result=undefined;}catch{}}
 assert.ok(result);assert.deepEqual(material(result.doc).graph.vertices_coords.slice(0,m.graph.vertices_coords.length),m.graph.vertices_coords);assert.deepEqual(material(result.doc).foldedVertices!.slice(0,m.foldedVertices!.length),m.foldedVertices);assert.equal(material(result.doc).components.length,m.components.length);
});

function twoPieces(coincident=false){
 const x=coincident?0:200,points:Point[]=[[0,0],[100,0],[100,100],[0,100],[x,0],[x+100,0],[x+100,100],[x,100]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],ff=points.map((p,v)=>v<4?[...p] as Point:[p[0],p[1]+200] as Point);
 return materialDoc({vertices_coords:points,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0),faces_vertices:[[0,1,2,3],[4,5,6,7]],faces_edges:[[0,1,2,3],[4,5,6,7]],edges_faces:edges.map((_,e)=>[e<4?0:1]),faces_faces:[[null,null,null,null],[null,null,null,null]] as unknown as number[][]},ff);
}
test('explicit all-component trace clips disconnected pieces without a connecting line through empty space',()=>{
 const source=twoPieces(),req:MaterialFaceTraceIntent={kind:'material-face-trace',component:'all',from:{edgeId:'material-edge-3',fraction:.5},to:{edgeId:'material-edge-5',fraction:.5},assignment:'M',fixedSide:'right'},r=editMaterialFaces(source,req),m=material(r.doc);
 assert.equal(r.trace!.pieces,2);assert.equal(m.components.length,2);assert.ok(Math.abs(r.trace!.blankLength-100)<1e-10);for(const id of r.insertedIds!){const s=r.doc.segments.find(s=>s.id===id)!;assert.ok(Math.max(s.a[0],s.b[0])<=100||Math.min(s.a[0],s.b[0])>=200);}assert.equal(computeFlatFold(r.doc).layers.status,'solved');
 assert.throws(()=>editMaterialFaces(source,{...req,component:0}),/不属于/);
});
test('coincident independent pieces retain separate new vertices, material identities and different FF placement',()=>{
 const source=twoPieces(true),old=material(source),req:MaterialFaceTraceIntent={kind:'material-face-trace',component:'all',from:{edgeId:'material-edge-3',fraction:.5},to:{edgeId:'material-edge-1',fraction:.5},assignment:'F',fixedSide:'left'},r=editMaterialFaces(source,req),m=material(r.doc);
 assert.equal(r.trace!.pieces,2);assert.equal(r.trace!.length,200);assert.equal(r.trace!.blankLength,0);assert.equal(m.components.length,2);assert.equal(r.addedVertices,4);assert.deepEqual(m.foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);const a=m.components[0].vertices.filter(v=>v>=8),b=m.components[1].vertices.filter(v=>v>=8);assert.equal(a.length,2);assert.equal(b.length,2);assert.ok(a.every(v=>!b.includes(v)));
});
test('a nearby parallel trace retains its true intersection and never snaps onto existing vertices',()=>{
 const source=grid(),old=material(source),y=100+1e-6,r=editMaterialFaces(source,trace(source,y)),m=material(r.doc);
 assert.equal(r.trace!.pieces,3);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);for(const id of r.insertedIds!){const s=r.doc.segments.find(s=>s.id===id)!;assert.ok(s.a[1]>100&&s.b[1]>100);assert.ok(Math.abs(s.a[1]-y)<1e-12&&Math.abs(s.b[1]-y)<1e-12);}
 assert.throws(()=>editMaterialFaces(source,trace(source,100+1e-10)),/精度|零长|未分离|接触|重叠/);
});
test('an inconsistent final hinge cycle rejects the whole multi-face transaction, while an F trace preserves the existing fold',()=>{
 const points:Point[]=[[0,0],[100,0],[100,100],[0,100]],square=materialDoc({vertices_coords:points,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},points),source=editMaterialFaces(square,{kind:'material-face-insert',face:0,from:{edgeId:'material-edge-0',fraction:.5},to:{edgeId:'material-edge-2',fraction:.5},assignment:'M',fixedPart:0}).doc;
 const before=JSON.stringify(source),req:MaterialFaceTraceIntent={kind:'material-face-trace',component:0,from:{edgeId:'material-edge-3',fraction:.75},to:{edgeId:'material-edge-1',fraction:.75},assignment:'M',fixedSide:'left'};assert.throws(()=>editMaterialFaces(source,req),/一致|闭合/);assert.equal(JSON.stringify(source),before);
 const flat=editMaterialFaces(source,{...req,assignment:'F'});assert.equal(flat.trace!.pieces,2);assert.equal(flat.placement,'preserved');assert.deepEqual(material(flat.doc).foldedVertices!.slice(0,material(source).foldedVertices!.length),material(source).foldedVertices);
});
