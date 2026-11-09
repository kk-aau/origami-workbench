import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleMaterialCurves,materialCurvePaths,readMaterialCurves,type MaterialCurve,type MaterialCurveIntent} from '../../src/core/materialCurves';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {materialDoc,materialCutFixture} from '../fixtures/materialModel';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {importDocument,exportDocument} from '../../src/core/formats';
import type {Point} from '../../src/core/types';
const ellipse=(center:Point=[50,50],radii:Point=[15,10],rotation=25):MaterialCurve=>({kind:'ellipse',center,radii,rotation,assignment:'F'});
const bezier:MaterialCurve={kind:'bezier-loop',assignment:'F',nodes:[{point:[25,50],incoming:[25,65],outgoing:[25,35]},{point:[75,50],incoming:[75,35],outgoing:[75,65]}]};
const sheet=(hole=false)=>{const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[45,45],[55,45],[55,55],[45,55]] as Point[]:[])],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];return materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>null),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);};
const request=(curves:MaterialCurve[]):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves,deviation:1,fixedPoint:[10,10],cpOnly:false});
const distance=(p:Point,a:Point,b:Point)=>{const d:Point=[b[0]-a[0],b[1]-a[1]],t=Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(d[0]**2+d[1]**2)));return Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]);};
test('analytic rotated ellipse samples have a conservative millimeter chord error, preserve source and close without bridge',()=>{
 for(const [center,radii,angle]of [[[50,50],[15,10],25],[[100000,-100000],[100,20],-60]] as [Point,Point,number][]){const curve=ellipse(center,radii,angle),before=JSON.stringify(curve),s=sampleMaterialCurves([curve],.2);assert.equal(JSON.stringify(curve),before);assert.ok(s.maximumError<=.2);assert.equal(s.graph.vertices.length,s.graph.edges.length);assert.deepEqual(s.graph.edges.at(-1),[s.graph.vertices.length-1,0]);
  for(let i=0;i<4096;i++){const t=Math.PI*2*i/4096,a=angle*Math.PI/180,x=radii[0]*Math.cos(t),y=radii[1]*Math.sin(t),p:Point=[center[0]+Math.cos(a)*x-Math.sin(a)*y,center[1]+Math.sin(a)*x+Math.cos(a)*y],error=Math.min(...s.graph.edges.map(([v,w])=>distance(p,s.graph.vertices[v],s.graph.vertices[w])));assert.ok(error<=s.maximumError+1e-10);}
  assert.match(materialCurvePaths([curve])[0],/ A /);
 }
});
test('closed cubic Bezier adaptive subdivision bounds curved and overshooting controls without altering endpoints',()=>{
 const source=structuredClone(bezier),s=sampleMaterialCurves([source],.2);assert.deepEqual(source,bezier);assert.ok(s.maximumError<=.2);if(source.kind!=='bezier-loop')throw Error('Wrong source');
 for(let n=0;n<source.nodes.length;n++){const a=source.nodes[n],b=source.nodes[(n+1)%source.nodes.length];assert.ok(s.graph.vertices.some(p=>p[0]===a.point[0]&&p[1]===a.point[1]));for(let i=0;i<=1000;i++){const t=i/1000,u=1-t,p=a.point.map((v,j)=>u**3*v+3*u*u*t*a.outgoing[j]+3*u*t*t*b.incoming[j]+t**3*b.point[j]) as Point,error=Math.min(...s.graph.edges.map(([v,w])=>distance(p,s.graph.vertices[v],s.graph.vertices[w])));assert.ok(error<=s.maximumError+1e-10);}}
 assert.match(materialCurvePaths([source])[0],/ C /);
});
test('ellipse geometry replay is independent of runtime native trigonometry and whole-turn rotations',()=>{
 const curve=ellipse([50,50],[25,25],0),expected=sampleMaterialCurves([curve],1),sin=Math.sin,cos=Math.cos;
 try{Math.sin=()=>{throw Error('native sine must not determine CP');};Math.cos=()=>{throw Error('native cosine must not determine CP');};assert.deepEqual(sampleMaterialCurves([curve],1),expected);assert.deepEqual(sampleMaterialCurves([ellipse([50,50],[25,25],36000)],1),expected);}finally{Math.sin=sin;Math.cos=cos;}
});
test('multiple intersecting/nested curve groups form real material faces and preserve old coordinates, FF, provenance and original units',()=>{
 for(const curves of [[ellipse()],[bezier],[ellipse([42,50],[18,12],0),ellipse([58,50],[18,12],0)],[ellipse([50,50],[30,30],0),ellipse([50,50],[15,15],0)]]){
  const doc=sheet(),before=JSON.stringify(doc),intent=request(curves),result=editMaterialFaces(doc,intent),m=inspectMaterialTopology(result.doc);assert.ok(m.ok,m.ok?'':m.reason);assert.equal(JSON.stringify(doc),before);assert.equal(result.placement,'preserved');assert.deepEqual(m.graph.vertices_coords.slice(0,4),[[0,0],[100,0],[100,100],[0,100]]);assert.deepEqual(m.foldedVertices!.slice(0,4),m.graph.vertices_coords.slice(0,4));assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);assert.ok(result.facesAfter>=2);assert.ok(result.curves!.maximumError<=intent.deviation);assert.equal(computeFlatFold(result.doc).layers.status,'solved');
  assert.deepEqual(prepareEditorCommit(doc,result.doc,intent).doc,result.doc);for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(result.doc,format).text,format).doc;const r=inspectMaterialTopology(back);assert.ok(r.ok);assert.deepEqual(r.graph,m.graph);assert.equal(computeFlatFold(back).layers.status,'solved');}
  assert.deepEqual((result.doc.metadata!.materialCurveConstruction as any).intent,intent);const forged=structuredClone(result.doc);forged.segments.at(-1)!.a[0]+=.01;assert.throws(()=>prepareEditorCommit(doc,forged,intent));
 }
});
test('a curve surrounding an existing paper hole retains the void without new boundary or blank-space creases',()=>{
 const r=editMaterialFaces(sheet(true),request([ellipse([50,50],[25,25],0)])),m=inspectMaterialTopology(r.doc);assert.ok(m.ok);assert.equal(m.components[0].boundaryLoops.length,2);assert.equal(m.graph.edges_assignment.filter(a=>a==='B').length,8);assert.equal(r.facesAfter,2);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('invalid/duplicate/too-fine/outside/hole-crossing inputs reject atomically and never loosen requested precision',()=>{
 const doc=sheet(true),before=JSON.stringify(doc);for(const intent of [request([ellipse([50,50],[3,3],0)]),request([ellipse([50,50],[8,3],0)]),request([ellipse([95,95],[10,10],0)]),request([ellipse(),ellipse()]),{...request([ellipse()]),deviation:1e-10},{...request([ellipse()]),deviation:NaN},{...request([ellipse()]),fixedPoint:[50,50] as Point}])assert.throws(()=>editMaterialFaces(doc,intent));assert.equal(JSON.stringify(doc),before);
 for(const v of [[{...ellipse(),rotation:Infinity}],[{...ellipse(),radii:[0,10]}],[{...ellipse(),extra:1}],[],[null],Array(17).fill(ellipse())])assert.equal(readMaterialCurves(v),null);
 const bad=structuredClone(bezier);if(bad.kind==='bezier-loop')bad.nodes[0].outgoing[0]=NaN;assert.equal(readMaterialCurves([bad]),null);
});
test('incompatible curved M/V folds do not keep stale FF; explicit CP-only preserves the actual source shape',()=>{
 const req=request([{...ellipse(),assignment:'M'}]);assert.throws(()=>editMaterialFaces(sheet(),req));const r=editMaterialFaces(sheet(),{...req,cpOnly:true}),m=inspectMaterialTopology(r.doc);assert.ok(m.ok);assert.equal(r.placement,'unavailable');assert.equal(m.foldedVertices,undefined);assert.ok(r.insertedIds!.every(id=>r.doc.segments.find(s=>s.id===id)?.assignment==='M'));
});
test('curve construction on real Origamica material keeps every existing indexed CP/FF point and material identity',()=>{
 const {source}=materialCutFixture(),old=inspectMaterialTopology(source);assert.ok(old.ok);let checked=false;
 for(let face=0;face<old.graph.faces_vertices!.length&&!checked;face++){
  const ps=old.graph.faces_vertices![face].map(v=>old.graph.vertices_coords[v]),center:Point=[ps.reduce((s,p)=>s+p[0],0)/ps.length,ps.reduce((s,p)=>s+p[1],0)/ps.length];
  for(const radius of [.01,.001])try{const r=editMaterialFaces(source,{...request([ellipse(center,[radius,radius],25)]),face,deviation:radius/10,fixedPoint:[center[0]+radius*2,center[1]]}),m=inspectMaterialTopology(r.doc);assert.ok(m.ok);assert.equal(r.placement,'preserved');assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,old.graph.vertices_coords.length),old.foldedVertices);assert.equal(m.components.length,old.components.length);assert.ok(r.curves!.maximumError<=radius/10);checked=true;break;}catch(e){if(e instanceof assert.AssertionError)throw e;}
 }
 assert.ok(checked,'actual original material face accepts a bounded-error closed curve');
});
