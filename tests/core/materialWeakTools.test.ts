import test from 'node:test';
import assert from 'node:assert/strict';
import {weakToolMaterial as mat,weakToolSource as source,weakToolSheet as sheet,weakToolLine as line,weakToolAnchor as anchor} from '../fixtures/materialWeakTools';
import type {Doc,Point} from '../../src/core/types';
import {editMaterialFaces,type MaterialFaceTraceIntent} from '../../src/core/materialFaceEdit';
import {materialAreaRings} from '../../src/core/materialWeak';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {triangulateWeakConstraints} from '../../src/engine/simWeakConstraints';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
const trace=(doc:Doc,a:Point,b:Point,assignment:'F'|'M'='F'):MaterialFaceTraceIntent=>({kind:'material-face-trace',component:0,from:anchor(doc,a),to:anchor(doc,b),assignment,fixedSide:'left'});
const area=(doc:Doc)=>{const g=mat(doc).graph;return g.faces_vertices!.reduce((sum,_,f)=>sum+materialAreaRings(g,f).reduce((n,r)=>n+r.reduce((a,v,k)=>{const p=g.vertices_coords[v],q=g.vertices_coords[r[(k+1)%r.length]];return a+(p[0]*q[1]-q[0]*p[1])/2;},0),0),0);};
const check=(before:Doc,after:Doc,hole=false)=>{const old=mat(before),m=mat(after);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);assert.equal(area(after),hole?9600:10000);m.graph.edges_faces!.forEach((fs,e)=>assert.equal(fs.length,m.graph.edges_assignment[e]==='B'?1:2));assert.ok(!m.graph.edges_assignment.includes('J'));prepareSimulationDocument(m.graph);};

test('a complete mountain trace crossing an independent slit really solves its flat geometry and retains both driven segments',()=>{
 const doc=source('interior'),r=editMaterialFaces(doc,trace(doc,[50,0],[50,100],'M')),m=mat(r.doc),flat=computeFlatFold(r.doc),p=prepareSimulationDocument(m.graph).prepared;assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(m.graph.edges_assignment.filter(a=>a==='M').length,2);for(const e of m.graph.edges_assignment.flatMap((a,e)=>a==='M'?[e]:[]))assert.ok(p.creaseParams.some(c=>c.edge===e));check(doc,r.doc);
});
for(const name of ['interior','boundary','cross','hole'])test(`${name} slit accepts actual cross-bank straight subdivision without welding the banks`,()=>{
 const doc=source(name),x=name==='interior'?50:name==='cross'?40:20,before=JSON.stringify(doc),dxf=exportDXF(doc).text,r=editMaterialFaces(doc,trace(doc,[x,0],[x,100]));assert.equal(r.trace!.length,100);assert.equal(r.trace!.blankLength,0);assert.equal(r.trace!.pieces,2);assert.ok(r.facesAfter>r.facesBefore);check(doc,r.doc,name==='hole');const m=mat(r.doc),hits=m.graph.vertices_coords.filter(p=>p[0]===x&&p[1]===50);assert.equal(hits.length,2);assert.equal(computeFlatFold(r.doc).layers.status,'solved');assert.equal(JSON.stringify(doc),before);assert.equal(exportDXF(doc).text,dxf);
});
for(const name of ['interior','boundary','cross','hole'])test(`${name} slit single-face insert uses real material darts and can be removed without closing the slit`,()=>{
 const doc=source(name),r=editMaterialFaces(doc,{kind:'material-face-insert',face:0,from:anchor(doc,[0,25]),to:anchor(doc,[100,25]),assignment:'F',fixedPart:0});assert.ok(r.insertedIds?.length);check(doc,r.doc,name==='hole');const removed=editMaterialFaces(r.doc,{kind:'material-face-remove',segmentIds:r.insertedIds!});assert.equal(removed.facesAfter,1);assert.equal(area(removed.doc),name==='hole'?9600:10000);assert.ok(mat(removed.doc).graph.edges_assignment.every(a=>a==='B'));assert.equal(computeFlatFold(removed.doc).layers.status,'solved');
});
test('a ray from a slit bank respects the explicitly picked side, rejects its opposite and never extends backward',()=>{
 const doc=source('interior'),m=mat(doc),g=m.graph,banks=g.edges_assignment.flatMap((a,e)=>a==='B'&&e>=4?[e]:[]),e=banks.find(e=>g.faces_holeEdges![0][0].includes(e)&&(()=>{const ring=g.faces_holes![0][0],k=g.faces_holeEdges![0][0].indexOf(e);return g.vertices_coords[ring[(k+1)%ring.length]][0]<g.vertices_coords[ring[k]][0];})())!,request={kind:'material-face-ray' as const,component:0,from:anchor(doc,[50,50],e),through:[50,49] as Point,assignment:'F' as const,fixedSide:'left' as const,cpOnly:false},r=editMaterialFaces(doc,request);assert.equal(r.ray!.materialLength,50);assert.ok(r.doc.segments.filter(s=>r.insertedIds!.includes(s.id)).every(s=>s.a[1]<=50&&s.b[1]<=50));check(doc,r.doc);assert.throws(()=>editMaterialFaces(doc,{...request,from:anchor(doc,[50,50],banks.find(b=>b!==e)!)}),/切口侧.*出射方向/);
});
test('a ray through a cross-cut junction selects distinct actual corner fans on either side',()=>{
 const doc=source('cross'),r=editMaterialFaces(doc,{kind:'material-face-ray',component:0,from:anchor(doc,[0,0]),through:[1,1],assignment:'F',fixedSide:'left',cpOnly:false});assert.ok(Math.abs(r.ray!.materialLength-100*Math.SQRT2)<1e-10);assert.equal(r.trace!.pieces,2);check(doc,r.doc);const m=mat(r.doc),segments=r.doc.segments.filter(s=>r.insertedIds!.includes(s.id));assert.equal(segments.length,2);const shared=segments.map(s=>m.graph.edges_vertices[m.edgeSegmentIds.indexOf(s.id)].find(v=>m.graph.vertices_coords[v][0]===50&&m.graph.vertices_coords[v][1]===50));assert.notEqual(shared[0],shared[1]);
});
test('a ray across a real hole and weak single bridge keeps empty space uncreased',()=>{
 const doc=source('hole'),r=editMaterialFaces(doc,{kind:'material-face-ray',component:0,from:anchor(doc,[50,0]),through:[50,1],assignment:'M',fixedSide:'left',cpOnly:true});assert.equal(r.ray!.materialLength,80);assert.equal(r.ray!.blankLength,20);check(doc,r.doc,true);assert.ok(r.doc.segments.filter(s=>r.insertedIds!.includes(s.id)).every(s=>Math.max(s.a[1],s.b[1])<=40||Math.min(s.a[1],s.b[1])>=60));assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('two-line batches reuse original anchors through successive weak-bank splits and preserve per-piece assignment',()=>{
 const doc=source('interior'),r=editMaterialFaces(doc,{kind:'material-face-traces',component:0,lines:[40,60].map(x=>({from:anchor(doc,[x,0]),to:anchor(doc,[x,100]),assignment:'F'})),fixedPoint:[10,10],cpOnly:true,overrides:[{line:1,piece:1,assignment:'M'}]});assert.equal(r.batch!.pieces.length,4);assert.equal(r.batch!.pieces.filter(p=>p.assignment==='M').length,1);check(doc,r.doc);assert.deepEqual(prepareEditorCommit(doc,r.doc,{kind:'material-face-traces',component:0,lines:[40,60].map(x=>({from:anchor(doc,[x,0]),to:anchor(doc,[x,100]),assignment:'F'})),fixedPoint:[10,10],cpOnly:true,overrides:[{line:1,piece:1,assignment:'M'}]}).doc,r.doc);
});
test('a direct hole bridge can be constructed explicitly as CP without pretending to be rigidly folded',()=>{
 const doc=sheet(true),request={kind:'material-face-insert' as const,face:0,from:anchor(doc,[0,50]),to:anchor(doc,[40,50]),assignment:'M' as const,fixedPart:0 as const};assert.throws(()=>editMaterialFaces(doc,request));const r=editMaterialFaces(doc,{...request,cpOnly:true});assert.equal(r.placement,'unavailable');assert.equal(r.facesAfter,1);assert.equal(mat(r.doc).foldedVertices,undefined);assert.equal(computeFlatFold(r.doc).geometry.status,'unsupported');check(doc,r.doc,true);
});
test('F tracing preserves existing weak FF poses while explicit CP-only invalidates FF and remains one undoable commit',()=>{
 const doc=editMaterialFaces(sheet(),line([25,50],[75,50],'F',false)).doc,request=trace(doc,[50,0],[50,100]),r=editMaterialFaces(doc,request),old=mat(doc);assert.equal(r.placement,'preserved');assert.deepEqual(mat(r.doc).foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);const cp=editMaterialFaces(doc,{...request,cpOnly:true});assert.equal(mat(cp.doc).foldedVertices,undefined);assert.deepEqual(prepareEditorCommit(doc,cp.doc,{...request,cpOnly:true}).doc,cp.doc);let h=editorHistoryReducer(emptyEditorHistory(doc),{type:'commit',doc:cp.doc});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,doc);h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,cp.doc);
});
test('coincident independent slit sheets remain separate through all-component tracing',()=>{
 const base=source('boundary'),doc=copyMaterialComponents(base,{kind:'material-copy',segmentIds:base.segments.map(s=>s.id),placements:[{dx:0,dy:0,rotation:0,scale:1,mirror:'none'}]}).doc,r=editMaterialFaces(doc,{...trace(doc,[20,0],[20,100]),component:'all'});assert.equal(r.trace!.length,200);assert.equal(r.trace!.blankLength,0);assert.equal(r.trace!.pieces,4);assert.equal(area(r.doc),20000);assert.equal(mat(r.doc).components.length,2);prepareSimulationDocument(mat(r.doc).graph);
});
test('straight weak-tool JSON/FOLD roundtrips and ordinary DXF preserve indexed banks and exact source coordinates',()=>{
 const doc=source('hole'),r=editMaterialFaces(doc,trace(doc,[20,0],[20,100])),expected=mat(r.doc);for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(r.doc,format).text,format).doc,m=mat(loaded);assert.deepEqual(m.graph,expected.graph);assert.equal(exportDXF(loaded).text,exportDXF(r.doc).text);assert.equal(computeFlatFold(loaded).layers.status,'solved');}assert.deepEqual(prepareEditorCommit(doc,r.doc,trace(doc,[20,0],[20,100])).doc,r.doc);
});
test('overlap and malformed CP flags fail atomically and never silently move a source endpoint',()=>{
 const doc=source('boundary'),before=JSON.stringify(doc),request=trace(doc,[20,0],[20,100]);for(const patch of [{cpOnly:'true'},{cpOnly:null},{extra:1},{from:request.to},{component:8}])assert.throws(()=>editMaterialFaces(doc,{...request,...patch} as MaterialFaceTraceIntent));assert.throws(()=>editMaterialFaces(doc,trace(doc,[0,50],[100,50])),/重叠|重复/);assert.equal(JSON.stringify(doc),before);
});

test('a branched slit with a one-sided ray stays complete under reversed winding and a planar 3D lift',()=>{
 const doc=source('interior'),g=mat(doc).graph,e=g.faces_holeEdges![0][0].find((_,k)=>{const r=g.faces_holes![0][0];return g.vertices_coords[r[(k+1)%r.length]][0]<g.vertices_coords[r[k]][0];})!,r=editMaterialFaces(doc,{kind:'material-face-ray',component:0,from:anchor(doc,[50,50],e),through:[50,49],assignment:'F',fixedSide:'left',cpOnly:false}),base=mat(r.doc).graph;
 for(const reversed of [false,true]){const lifted=structuredClone(base);lifted.vertices_coords=base.vertices_coords.map(([x,y])=>[x,.6*y,.8*y] as unknown as Point);if(reversed){lifted.faces_vertices=lifted.faces_vertices!.map(row=>[row[0],...row.slice(1).reverse()]);lifted.faces_edges=lifted.faces_edges!.map(row=>[...row].reverse());lifted.faces_faces=lifted.faces_faces!.map(row=>[...row].reverse());}const p=prepareSimulationDocument(lifted).prepared;assert.equal(p.faceCount,9);assert.equal(p.vertexCount,base.vertices_coords.length);assert.deepEqual(p.edgesVertices.slice(0,base.edges_vertices.length),base.edges_vertices);base.vertices_coords.forEach(([x,y],v)=>{assert.equal(p.positions[3*v],x);assert.equal(p.positions[3*v+1],.8*y);assert.equal(p.positions[3*v+2],-.6*y);});}
});

test('constrained triangulation consumes the explicit work budget and never mutates source coordinates or rows',()=>{
 const g=mat(source('boundary')).graph,before=JSON.stringify(g);let n=0;assert.throws(()=>triangulateWeakConstraints(g.vertices_coords,[g.faces_vertices![0]], [g.faces_edges![0]],g.edges_vertices,()=>{if(++n>5)throw Error('budget');}),/budget/);assert.equal(JSON.stringify(g),before);
});
