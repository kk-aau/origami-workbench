import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import {sampleMaterialCurves,materialCurvePaths,readMaterialCurves,type MaterialCurve,type MaterialCurveIntent} from '../../src/core/materialCurves';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {inspectMaterialCurveModel,editMaterialCurveModel} from '../../src/core/materialCurveModel';
import {materialDoc,materialSlitFixture} from '../fixtures/materialModel';
import {importDocument,exportDocument} from '../../src/core/formats';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {computeFlatFold} from '../../src/core/flatFold';
const path=(a:Point=[0,50],b:Point=[100,50],bend=20):MaterialCurve=>({kind:'bezier-path',assignment:'F',nodes:[{point:a,incoming:a,outgoing:[a[0]+(b[0]-a[0])/3,a[1]-bend]},{point:b,incoming:[a[0]+2*(b[0]-a[0])/3,b[1]+bend],outgoing:b}]});
const sheet=(hole=false):Doc=>{const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[45,45],[55,45],[55,55],[45,55]] as Point[]:[])],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];return materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);};
const req=(curves=[path()],scope?:'component'|'all'):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves,deviation:.5,fixedPoint:[10,10],cpOnly:false,...(scope?{scope}:{})});
const mat=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
test('open cubic sampling preserves exact endpoints and a conservative error without adding a closure',()=>{
 const c=path(),before=JSON.stringify(c),s=sampleMaterialCurves([c],.1);assert.ok(s.open);assert.equal(s.graph.edges.length,s.graph.vertices.length-1);assert.deepEqual(s.graph.vertices[0],[0,50]);assert.deepEqual(s.graph.vertices.at(-1),[100,50]);assert.ok(s.maximumError<=.1);assert.equal(JSON.stringify(c),before);assert.ok(!materialCurvePaths([c])[0].endsWith(' Z'));
 if(c.kind==='ellipse')throw Error('Wrong type');const [a,b]=c.nodes;for(let i=0;i<=1000;i++){const t=i/1000,u=1-t,p=a.point.map((v,j)=>u*u*u*v+3*u*u*t*a.outgoing[j]+3*u*t*t*b.incoming[j]+t*t*t*b.point[j]) as Point;const error=Math.min(...s.graph.edges.map(([v,w])=>{const a=s.graph.vertices[v],b=s.graph.vertices[w],dx=b[0]-a[0],dy=b[1]-a[1],q=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-q*dx,p[1]-a[1]-q*dy);}));assert.ok(error<=s.maximumError+1e-12);}
 const straight=sampleMaterialCurves([path([0,50],[100,50],0)],.5);assert.equal(straight.graph.vertices.length,2);assert.equal(straight.graph.edges.length,1);
});
test('boundary-to-boundary open paths build actual faces, preserve source CP/FF and commit independently',()=>{
 for(const scope of [undefined,'component'] as const){const doc=sheet(),before=JSON.stringify(doc),intent=req([path()],scope),r=editMaterialFaces(doc,intent),m=mat(r.doc);assert.equal(JSON.stringify(doc),before);assert.equal(m.graph.faces_vertices!.length,2);assert.deepEqual(m.graph.vertices_coords.slice(0,4),mat(doc).graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,4),mat(doc).foldedVertices);assert.equal(computeFlatFold(r.doc).layers.status,'solved');assert.deepEqual(prepareEditorCommit(doc,r.doc,intent).doc,r.doc);}
});
test('an open source extending beyond the paper clips only real material and never joins its ends',()=>{
 const c=path([-20,50],[120,50]),r=editMaterialFaces(sheet(),req([c])),m=mat(r.doc);assert.ok(r.curves!.clipping!.blankLength>0);assert.ok(r.insertedIds!.length>0);for(const id of r.insertedIds!){const s=r.doc.segments.find(s=>s.id===id)!;assert.ok([s.a,s.b].every(p=>p[0]>=0&&p[0]<=100));assert.equal(s.assignment,'F');}assert.equal(m.graph.faces_vertices!.length,2);assert.equal(computeFlatFold(r.doc).layers.status,'solved');assert.deepEqual((r.doc.metadata!.materialCurveConstruction as any).intent.curves,[c]);
});
test('a path through a hole skips the void and keeps both indexed boundaries',()=>{
 const doc=sheet(true),r=editMaterialFaces(doc,req([path([0,50],[100,50],0)])),m=mat(r.doc);assert.equal(r.insertedIds!.length,2);assert.equal(m.components[0].boundaryLoops.length,2);assert.ok(Math.abs(r.curves!.clipping!.blankLength-10)<1e-10);for(const id of r.insertedIds!){const s=r.doc.segments.find(s=>s.id===id)!;assert.ok(!(Math.min(s.a[0],s.b[0])<55&&Math.max(s.a[0],s.b[0])>45));}assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('exactly shared path endpoints connect explicitly; no tolerance welding or duplicate-edge deletion',()=>{
 const curves=[path([0,50],[50,50],10),path([50,50],[100,50],-10)],s=sampleMaterialCurves(curves,.5);assert.equal(s.graph.vertices.filter(p=>p[0]===50&&p[1]===50).length,1);const r=editMaterialFaces(sheet(),req(curves));assert.equal(mat(r.doc).graph.faces_vertices!.length,2);assert.equal(computeFlatFold(r.doc).layers.status,'solved');assert.throws(()=>editMaterialFaces(sheet(),req([path(),path()])),/重复|重叠/);
});
test('interior loose mountain endpoints, collinear overlaps and malformed inputs reject atomically',()=>{
 const d=sheet(),before=JSON.stringify(d);for(const c of [path([10,50],[90,50]),path([0,50],[90,50])]){c.assignment='M';assert.throws(()=>editMaterialFaces(d,req([c])),/悬空端点/);}assert.equal(JSON.stringify(d),before);assert.throws(()=>editMaterialFaces(d,req([path([0,0],[100,0],0)])),/重复|重叠/);assert.equal(readMaterialCurves([{...path(),extra:true}]),null);const bad=path();if(bad.kind!=='ellipse')bad.nodes[0].outgoing[0]=NaN;assert.equal(readMaterialCurves([bad]),null);assert.throws(()=>sampleMaterialCurves([path()],1e-15));
});
test('open curves persist through JSON/FOLD and support independent group rebuild and deletion',()=>{
 const source=sheet(),first=editMaterialFaces(source,req()).doc,checked=inspectMaterialCurveModel(first);assert.ok(checked.ok);const id=checked.model.groups[0].id;
 for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(first,format).text,format).doc;assert.ok(inspectMaterialCurveModel(back).ok);const r=editMaterialCurveModel(back,{kind:'material-curve-group-edit',group:id,recipe:req([path([0,50],[100,50],10)])});assert.equal(computeFlatFold(r.doc).layers.status,'solved');const gone=editMaterialCurveModel(r.doc,{kind:'material-curve-group-remove',group:id}).doc;assert.deepEqual(mat(gone).graph,mat(source).graph);}
});
test('curved mountain paths cannot preserve stale FF; explicit CP-only keeps actual CP',()=>{
 const intent=req([{...path(),assignment:'M'}]);assert.throws(()=>editMaterialFaces(sheet(),intent));const r=editMaterialFaces(sheet(),{...intent,cpOnly:true});assert.equal(mat(r.doc).foldedVertices,undefined);assert.ok(r.insertedIds!.every(id=>r.doc.segments.find(s=>s.id===id)!.assignment==='M'));
});
test('an open path across disjoint sheets clips blank space and keeps material ownership separate',()=>{
 const g=mat(sheet()).graph,p=[...g.vertices_coords,...g.vertices_coords.map(([x,y])=>[x+200,y] as Point)],e=[...g.edges_vertices,...g.edges_vertices.map(([a,b])=>[a+4,b+4] as [number,number])],d=materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3],[4,5,6,7]],[[0,1,2,3],[4,5,6,7]]),p),r=editMaterialFaces(d,req([path([-10,50],[310,50],0)],'all')),m=mat(r.doc);
 assert.equal(m.components.length,2);assert.equal(r.curves!.clipping!.components,2);assert.ok(Math.abs(r.curves!.clipping!.materialLength-200)<1e-10);assert.ok(Math.abs(r.curves!.clipping!.blankLength-120)<1e-10);const owners=new Map<number,number>();m.components.forEach((c,i)=>c.vertices.forEach(v=>owners.set(v,i)));for(const [a,b]of m.graph.edges_vertices)assert.equal(owners.get(a),owners.get(b));assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('open paths across a same-component slit preserve separate bank vertices and FF',()=>{
 const {source,banks}=materialSlitFixture(),old=mat(source),intent=req([path([150,0],[150,300],0)],'component'),r=editMaterialFaces(source,intent),m=mat(r.doc);assert.equal(m.components.length,1);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,old.graph.vertices_coords.length),old.foldedVertices);
 const vs=banks.map(e=>new Set(r.descendants.get(old.edgeSegmentIds[e])!.flatMap(id=>m.graph.edges_vertices[m.edgeSegmentIds.indexOf(id)]))),added=[...vs[0]].filter(v=>v>=old.graph.vertices_coords.length);assert.ok(added.length>0);for(const v of added){assert.ok(!vs[1].has(v));assert.ok([...vs[1]].some(w=>m.graph.vertices_coords[w].join(',')===m.graph.vertices_coords[v].join(',')));}assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('crossing open paths through original paper corners share one intersection and create four actual faces',()=>{
 const curves=[path([0,0],[100,100],0),path([100,0],[0,100],0)];for(const c of curves){if(c.kind==='ellipse')throw Error('Wrong source');const [a,b]=c.nodes;a.outgoing=a.point.map((v,i)=>v+(b.point[i]-v)/4) as Point;b.incoming=a.point.map((v,i)=>v+3*(b.point[i]-v)/4) as Point;}const intent={...req(curves),fixedPoint:[20,10] as Point},r=editMaterialFaces(sheet(),intent),m=mat(r.doc);assert.equal(m.graph.faces_vertices!.length,4);const intersections=m.graph.vertices_coords.flatMap((p,i)=>p[0]===50&&p[1]===50?[i]:[]);assert.equal(intersections.length,1);assert.equal(m.graph.edges_vertices.filter(e=>e.includes(intersections[0])).length,4);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('mixed open and closed sources are split simultaneously without an artificial connecting edge',()=>{
 const ellipse:MaterialCurve={kind:'ellipse',center:[50,50],radii:[20,20],rotation:0,assignment:'F'},r=editMaterialFaces(sheet(),req([path([0,50],[100,50],0),ellipse])),m=mat(r.doc);assert.equal(m.graph.faces_vertices!.length,4);assert.equal(r.curves!.count,2);assert.ok(r.curves!.clipping!.curveForInsertedSegment.includes(0)&&r.curves!.clipping!.curveForInsertedSegment.includes(1));assert.equal(m.components[0].boundaryLoops.length,1);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('near-coincident distinct curve intersections below material resolution reject without endpoint welding',()=>{
 const doc=sheet(),before=JSON.stringify(doc),intent={...req([path([0,0],[100,100],0),path([100,0],[0,100],0)]),fixedPoint:[20,10] as Point};assert.throws(()=>editMaterialFaces(doc,intent),/间距低于可验证精度/);assert.equal(JSON.stringify(doc),before);
});
test('rebuilding an open earlier group preserves and replays a later closed curve group',()=>{
 const first=editMaterialFaces(sheet(),req()).doc,ellipse:MaterialCurve={kind:'ellipse',center:[50,75],radii:[10,10],rotation:0,assignment:'F'},later=req([ellipse],'component'),two=editMaterialFaces(first,later).doc,checked=inspectMaterialCurveModel(two);assert.ok(checked.ok);const r=editMaterialCurveModel(two,{kind:'material-curve-group-edit',group:checked.model.groups[0].id,recipe:req([path([0,50],[100,50],10)])}),after=inspectMaterialCurveModel(r.doc);assert.ok(after.ok);assert.deepEqual(after.model.groups.map(g=>g.id),checked.model.groups.map(g=>g.id));assert.deepEqual(after.model.groups[1].recipe.curves,later.curves);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
