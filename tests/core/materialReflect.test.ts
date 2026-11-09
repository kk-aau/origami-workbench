import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialDoc,materialSlitFixture} from '../fixtures/materialModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {reflectMaterialEdge,type MaterialEdgeReflectIntent} from '../../src/core/materialReflect';
import {inspectMaterialTopology,createMaterialTopology} from '../../src/core/materialTopology';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {setStartingFace} from '../../src/app/flatFoldSettings';
import {computeMaterialFlatGeometry} from '../../src/core/materialFlatGeometry';
import {materialViewFrame} from '../../src/app/materialFrame';
import type {Doc,Point} from '../../src/core/types';
const material=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const view=(d:Doc)=>computeMaterialFlatGeometry(d,materialViewFrame(d).root).geometry.vertices;
const square=()=>materialDoc({vertices_coords:[[0,0],[100,0],[100,100],[0,100]],edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},[[0,0],[100,0],[100,100],[0,100]]);
export function reflectFixture(kind:'F'|'M'|'V'|'U'='F'){
 const r=editMaterialFaces(square(),{kind:'material-face-trace',component:0,from:{edgeId:'material-edge-3',fraction:.75},to:{edgeId:'material-edge-1',fraction:.25},assignment:kind,fixedSide:'left'}),doc=r.doc;
 doc.segments.push({id:'mirror-axis',a:[0,50],b:[100,50],assignment:'A',angle:null});
 return {doc,req:{kind:'material-edge-reflect',sourceId:r.insertedIds![0],axisId:'mirror-axis',component:'source',fixedSide:'left',cpOnly:false} as MaterialEdgeReflectIntent};
}
test('one material crease reflection keeps its finite geometry, source and FF while subdividing the target face',()=>{
 const {doc,req}=reflectFixture(),before=JSON.stringify(doc),old=material(doc),r=reflectMaterialEdge(doc,req),m=material(r.doc),s=r.doc.segments.find(s=>r.insertedIds!.includes(s.id))!;
 assert.equal(JSON.stringify(doc),before);assert.equal(r.facesAfter,3);assert.equal(r.insertedIds!.length,1);assert.deepEqual([s.a,s.b],[[0,75],[100,75]]);assert.equal(s.assignment,'F');assert.equal(s.angle,0);assert.equal(r.placement,'preserved');assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);assert.deepEqual(r.doc.segments.find(s=>s.id===req.sourceId),doc.segments.find(s=>s.id===req.sourceId));assert.deepEqual(prepareEditorCommit(doc,r.doc,req).doc,r.doc);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('M and V reflections retain semantic assignment and target angle and genuinely refold, independently of drawing preset',()=>{
 for(const assignment of ['M','V'] as const){const {doc,req}=reflectFixture(assignment),r=reflectMaterialEdge(doc,req),s=r.doc.segments.find(s=>r.insertedIds!.includes(s.id))!;assert.equal(s.assignment,assignment);assert.equal(s.angle,assignment==='M'?-180:180);assert.equal(r.placement,'recomputed');assert.equal(computeFlatFold(r.doc).layers.status,'solved');}
});
test('45-degree reflection produces exact boundary endpoints and a shared crossing without sqrt drift or snapping',()=>{
 const {doc,req}=reflectFixture(),axis=doc.segments.find(s=>s.id===req.axisId)!;axis.a=[0,0];axis.b=[100,100];const r=reflectMaterialEdge(doc,req),m=material(r.doc);assert.deepEqual(r.reflection.from,[25,0]);assert.deepEqual(r.reflection.to,[25,100]);assert.equal(m.graph.vertices_coords.filter(p=>p[0]===25&&p[1]===25).length,1);assert.equal(r.insertedIds!.length,2);assert.equal(r.trace!.length,100);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('source component versus all material is explicit and coincident copies never weld',()=>{
 const {doc:base,req}=reflectFixture(),doc=copyMaterialComponents(base,{kind:'material-copy',segmentIds:material(base).edgeSegmentIds,placements:[{dx:0,dy:0,rotation:0,scale:1,mirror:'none'}]}).doc;
 const one=reflectMaterialEdge(doc,req),all=reflectMaterialEdge(doc,{...req,component:'all'});assert.equal(one.insertedIds!.length,1);assert.equal(all.insertedIds!.length,2);assert.equal(material(one.doc).components.length,2);assert.equal(material(all.doc).components.length,2);assert.equal(material(all.doc).graph.vertices_coords.filter(p=>p[0]===0&&p[1]===75).length,2);
});
test('finite source endpoints on an existing internal edge are not extended to the opposite paper border',()=>{
 const {doc:base,req}=reflectFixture(),doc=editMaterialFaces(base,{kind:'material-face-trace',component:0,from:{edgeId:'material-edge-0',fraction:.5},to:{edgeId:'material-edge-2',fraction:.5},assignment:'F',fixedSide:'left'}).doc,source=doc.segments.find(s=>s.id===req.sourceId)!;
 assert.equal(Math.hypot(source.b[0]-source.a[0],source.b[1]-source.a[1]),50);const r=reflectMaterialEdge(doc,req);assert.equal(r.trace!.length,50);assert.equal(r.insertedIds!.length,1);assert.ok(r.doc.segments.filter(s=>r.insertedIds!.includes(s.id)).every(s=>Math.max(s.a[0],s.b[0])===50));
});
test('a material slit intersects the reflected line without welding its two banks or replacing the source edge',()=>{
 const doc=materialSlitFixture().source,m=material(doc),e=m.graph.edges_vertices.findIndex(([a,b])=>{const p=m.graph.vertices_coords[a],q=m.graph.vertices_coords[b];return p[0]===100&&q[0]===100&&Math.min(p[1],q[1])===0;});
 doc.segments.push({id:'axis',a:[125,0],b:[125,300],assignment:'A',angle:null});const r=reflectMaterialEdge(doc,{kind:'material-edge-reflect',sourceId:m.edgeSegmentIds[e],axisId:'axis',component:'source',fixedSide:'left',cpOnly:false}),next=material(r.doc);assert.equal(next.graph.vertices_coords.filter(p=>p[0]===150&&p[1]===100).length,2);assert.equal(next.components[0].boundaryLoops.length,2);assert.equal(r.synchronizedBanks,1);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('finite reflection through an empty concave bay constructs only the two actual material intervals',()=>{
 const p:Point[]=[[0,0],[300,0],[300,300],[200,300],[200,100],[100,100],[100,300],[0,300]],n=p.length,doc=materialDoc({vertices_coords:p,edges_vertices:p.map((_,i)=>[i,(i+1)%n]),edges_assignment:p.map(()=>'B'),edges_foldAngle:p.map(()=>0),faces_vertices:[p.map((_,i)=>i)],faces_edges:[p.map((_,i)=>i)],edges_faces:p.map(()=>[0]),faces_faces:[p.map(()=>null)] as unknown as number[][]},p),base=editMaterialFaces(doc,{kind:'material-face-trace',component:0,from:{edgeId:'material-edge-7',fraction:5/6},to:{edgeId:'material-edge-1',fraction:1/6},assignment:'F',fixedSide:'left'});
 base.doc.segments.push({id:'axis',a:[0,100],b:[300,100],assignment:'A',angle:null});const r=reflectMaterialEdge(base.doc,{kind:'material-edge-reflect',sourceId:base.insertedIds![0],axisId:'axis',component:'source',fixedSide:'left',cpOnly:false});assert.equal(r.insertedIds!.length,2);assert.ok(Math.abs(r.trace!.blankLength-100)<1e-9);assert.ok(r.doc.segments.filter(s=>r.insertedIds!.includes(s.id)).every(s=>Math.max(s.a[0],s.b[0])<=100||Math.min(s.a[0],s.b[0])>=200));assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('CP-only is explicit, unknown/custom angles are not silently converted, and missing original FF is not fabricated',()=>{
 const {doc,req}=reflectFixture('U'),r=reflectMaterialEdge(doc,req);assert.equal(r.doc.segments.find(s=>r.insertedIds!.includes(s.id))!.angle,null);
 const custom=structuredClone(doc),original=material(doc);custom.segments.find(s=>s.id===req.sourceId)!.angle=37;const cg=structuredClone(original.graph);cg.edges_foldAngle[original.edgeSegmentIds.indexOf(req.sourceId)]=37;custom.metadata!.materialTopology=createMaterialTopology(custom,cg,original.edgeSegmentIds,{startingFace:original.startingFace});const cr=reflectMaterialEdge(custom,req);assert.equal(cr.doc.segments.find(s=>cr.insertedIds!.includes(s.id))!.angle,37);assert.equal(material(cr.doc).foldedVertices,undefined);
 const {doc:folded,req:foldedReq}=reflectFixture('M'),cp=reflectMaterialEdge(folded,{...foldedReq,cpOnly:true});assert.equal(material(cp.doc).foldedVertices,undefined);assert.equal(cp.placement,'unavailable');
});
test('duplicate, dangling, missing and malformed operations reject without changing the input or accepting a forged proposal',()=>{
 const {doc,req}=reflectFixture(),before=JSON.stringify(doc);for(const bad of [{...req,extra:true},{...req,sourceId:'missing'},{...req,axisId:'missing'},{...req,sourceId:'material-edge-0'},{...req,component:'other'},{...req,cpOnly:undefined},{...req,fixedSide:'other'}])assert.throws(()=>reflectMaterialEdge(doc,bad as MaterialEdgeReflectIntent));assert.equal(JSON.stringify(doc),before);
 const sameAxis=structuredClone(doc);sameAxis.segments.find(s=>s.id==='mirror-axis')!.a=[0,25];sameAxis.segments.find(s=>s.id==='mirror-axis')!.b=[100,25];assert.throws(()=>reflectMaterialEdge(sameAxis,req),/重复|重叠/);
 const dangling=structuredClone(doc);dangling.segments.find(s=>s.id==='mirror-axis')!.a=[0,0];dangling.segments.find(s=>s.id==='mirror-axis')!.b=[100,50];assert.throws(()=>reflectMaterialEdge(dangling,req),/端点.*内部/);
 const result=reflectMaterialEdge(doc,req),forged=structuredClone(result.doc);forged.name='forged';assert.throws(()=>prepareEditorCommit(doc,forged,req),/独立重放/);assert.throws(()=>prepareEditorCommit(doc,result.doc));
});
test('reference and active FF face remain distinct, and JSON/FOLD reproduce indexed CP and the current visible frame',()=>{
 const {doc:base,req}=reflectFixture(),doc=setStartingFace(base,1),old=view(doc),r=reflectMaterialEdge(doc,req),next=view(r.doc);
 assert.notEqual(material(r.doc).startingFace,r.doc.flatFold!.materialFace);old.forEach((p,i)=>assert.ok(Math.hypot(p[0]-next[i][0],p[1]-next[i][1])<1e-9));for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(r.doc,format).text,format).doc,rm=material(reopened);assert.deepEqual(rm.graph,material(r.doc).graph);assert.deepEqual(rm.foldedVertices,material(r.doc).foldedVertices);assert.deepEqual(view(reopened),next);assert.equal(computeFlatFold(reopened).layers.status,'solved');}
});
