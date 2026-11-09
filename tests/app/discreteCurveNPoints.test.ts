import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {discreteCurveCPPreset,discreteCurveCPOriginal4093Preset,readDiscreteCurveCPParams,discreteCurveCPGraph,discreteCurveCPInternalEdges,discreteCurveCPLocalAssignmentsValid,discreteCurveCPSourceValid,discreteCurveCPDocument,canAdoptDiscreteCurveCP} from '../../src/app/discreteCurveCP';
import {prepareTessResult,readTessParams,canAdoptTess,canAdoptTessWithTileLayers,tessConstructionKey,needsTessellationLayerCheck} from '../../src/app/tessellation';
import {inspectMaterialTopology} from '../../src/core/materialTopology';import {exportDocument,importDocument} from '../../src/core/formats';import {exportDXF} from '../../src/core/dxf';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/discrete-curve-npoints-20261010.json',import.meta.url),'utf8')).cases;

test('finite source count determines missing U length; explicit wrong count/type never defaults',()=>{
 for(let n=3;n<=16;n++){
  const p=discreteCurveCPPreset(n);assert.deepEqual(readTessParams({family:'discrete-curve-cp',source:p.source}),p);
  assert.equal(p.assignments.length,3*n-5);assert.equal(discreteCurveCPGraph(p).vertices_coords.length,3*n);
 }
 for(const key of ['source','assignments','leftWidth','rightWidth'])for(const value of [null,undefined,false,'1',{}])assert.equal(readDiscreteCurveCPParams({...discreteCurveCPPreset(4),[key]:value}),null);
 assert.equal(readTessParams({...discreteCurveCPPreset(4),assignments:Array(4).fill('U')}),null);
 for(const n of [2,17,NaN,3.5])assert.throws(()=>discreteCurveCPPreset(n));
});
test('literal N corner/index identity, closed incidences and actual CP-only material keep original raw source',()=>{
 for(const row of cases){
  const p=row.params,n=p.source.foldPoints.length,r=prepareTessResult(row.response,p),g=discreteCurveCPGraph(p),doc=discreteCurveCPDocument(r,p);
  assert.equal(discreteCurveCPSourceValid(r,p),true,row.name);assert.equal(inspectMaterialTopology(doc).ok,true,row.name);
  assert.deepEqual(g.vertices_coords.slice(0,n),p.source.foldPoints);assert.deepEqual(r.source.internalEdgeOrder,discreteCurveCPInternalEdges(n));
  assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices.length],[3*n,5*n-3,2*n-2]);assert.equal(3*n-(5*n-3)+(2*n-2),1);
  assert.equal(g.edges_assignment.filter(x=>x==='B').length,2*n+2);
  assert.equal(r.stats.boundaryEdges,2*n+2);assert.equal(r.stats.unassignedEdges,p.assignments.filter((a:string)=>a==='U').length);
  assert.equal((doc.metadata!.discreteCurveCPAdoption as any).flatFoldCertified,false);assert.equal('foldedVertices' in (doc.metadata!.materialTopology as object),false);
  assert.equal(canAdoptDiscreteCurveCP(r,false,tessConstructionKey(p),p),true);
  const bad=structuredClone(r);(bad.doc.metadata!.tessellation as any).parameters.leftWidth+=.01;assert.equal(canAdoptDiscreteCurveCP(bad,false,tessConstructionKey(p),p),false);
 }
});
test('ordinary adoption checks every original interior star and requires final actual layer status',()=>{
 for(const row of cases){const p=row.params,r=prepareTessResult(row.response,p),key=tessConstructionKey(p),explicit=row.name.endsWith('explicit-user');
  assert.equal(needsTessellationLayerCheck(p),true);assert.equal(discreteCurveCPLocalAssignmentsValid(p),explicit);
  assert.equal(canAdoptTess(r,false,key,p),explicit,row.name);
  for(const state of [undefined,'checking','no-solution','unconfirmed','invalid'])assert.equal(canAdoptTessWithTileLayers(r,false,key,p,state),false);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,p,'solved'),explicit);
 }
 const valid=cases.find((r:any)=>r.name==='n4-explicit-user');assert.equal(Math.abs(valid.params.assignments.filter((a:string)=>a==='M').length-valid.params.assignments.filter((a:string)=>a==='V').length),3,'two valid stars cannot use the old whole-array ±2 shortcut');
});
test('authentic In4093 six points use raw original chord result and full sample quotients without fabricated FF',()=>{
 const row=cases.find((r:any)=>r.name==='original-six-unassigned'),p=discreteCurveCPOriginal4093Preset();assert.deepEqual(p,row.params);
 const r=prepareTessResult(row.response,p);assert.equal(r.stats.vertices,18);assert.equal(r.stats.edges,27);assert.equal(r.stats.faces,10);
 assert.deepEqual((r.source.nativeDiscretization as any).query,p.source);assert.equal(Math.hypot(...p.source.leftRulings[0]),1.5);
 assert.deepEqual((r.source.nativeDiscretization as any).sample.kawasaki.map((q:any)=>q.vertex),[2,3,4,5]);
 assert.equal('foldedForm3D' in r.source,false);assert.equal(r.source.continuousCurveEquivalent,false);
 for(const mutate of [(x:any)=>x.fold.file_frames=[{frame_classes:['foldedForm']}],(x:any)=>x.fold.vertices_coords[6][0]+=.1,(x:any)=>x.fold.faces_vertices[0].reverse(),(x:any)=>x.source.nativeDiscretization.sample.multipliers[5]+=.1,(x:any)=>x.doc.paper.width+=1,(x:any)=>x.stats.boundaryEdges=8]){const bad=structuredClone(r);mutate(bad);assert.equal(discreteCurveCPSourceValid(bad,p),false);}
});
test('rotated translated source and unnormalized ruling magnitude keep raw query and mm workspace convention',()=>{
 const row=cases.find((r:any)=>r.name==='n4-transformed-unassigned'),p=row.params,r=prepareTessResult(row.response,p),doc=discreteCurveCPDocument(r,p);
 assert.equal(discreteCurveCPSourceValid(r,p),true);assert.deepEqual((r.source.nativeDiscretization as any).query,p.source);
 assert.ok(Math.abs(Math.hypot(...p.source.leftRulings[0])-1.3)<1e-12);
 assert.ok(Math.abs(doc.paper.height-200)<1e-9);assert.ok(doc.paper.width<200);
});
test('N topology indices and fold angles require exact identity while coordinates tolerate cross-engine rounding',()=>{
 const row=cases.find((r:any)=>r.name==='original-six-unassigned'),p=row.params,r=prepareTessResult(row.response,p);
 for(const key of ['edges_vertices','faces_vertices','faces_edges','edges_faces','faces_faces']){
  const bad=structuredClone(r);(bad.fold as any)[key][0][0]+=1e-12;
  assert.equal(discreteCurveCPSourceValid(bad,p),false,key);
 }
 const explicit=cases.find((r:any)=>r.name==='original-six-explicit-user'),e=prepareTessResult(explicit.response,explicit.params),bad=structuredClone(e);
 (bad.fold as any).edges_foldAngle[0]+=1e-12;assert.equal(discreteCurveCPSourceValid(bad,explicit.params),false);
 const rounded=structuredClone(r);rounded.fold.vertices_coords[0][0]+=2e-16;assert.equal(discreteCurveCPSourceValid(rounded,p),true);
});
test('N public source and both adoption gates reject malformed actual Doc without silently rebuilding it',()=>{
 const row=cases.find((r:any)=>r.name==='n4-explicit-user'),p=row.params,r=prepareTessResult(row.response,p),key=tessConstructionKey(p);
 const mutations=[(d:any)=>d.segments[0].a.push(0),(d:any)=>d.paper.width=String(d.paper.width),(d:any)=>d.paper.height=NaN,
  (d:any)=>{const s=d.segments.find((s:any)=>s.a.some((x:number)=>x===0));s.a[s.a.indexOf(0)]=null;},(d:any)=>d.segments[0].id='renamed'];
 for(const mutate of mutations){const bad=structuredClone(r);mutate(bad.doc);
  assert.equal(discreteCurveCPSourceValid(bad,p),false);assert.equal(canAdoptDiscreteCurveCP(bad,false,key,p),false);
  assert.equal(canAdoptTess(bad,false,key,p),false);assert.equal(canAdoptTessWithTileLayers(bad,false,key,p,'solved'),false);
  assert.throws(()=>discreteCurveCPDocument(bad,p));
 }
 const renamed=structuredClone(r);renamed.doc.name='用户工程名称';assert.equal(discreteCurveCPSourceValid(renamed,p),true);
});
test('saved N material and discrete recipe replay survive real application JSON/FOLD and ordinary LINE DXF',()=>{
 for(const row of cases){const r=prepareTessResult(row.response,row.params),doc=discreteCurveCPDocument(r,row.params);
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(doc,format).text,format).doc;
   assert.equal(inspectMaterialTopology(back).ok,true);assert.deepEqual(back.segments,doc.segments);assert.deepEqual(back.metadata!.materialTopology,doc.metadata!.materialTopology);
   assert.deepEqual(readTessParams((back.metadata!.tessellation as any).parameters),row.params);assert.deepEqual((back.metadata!.tessellation as any).source.nativeDiscretization,r.source.nativeDiscretization);
  }
  assert.equal((exportDXF(doc).text.match(/\r?\nLINE\r?\n/g)||[]).length,5*row.params.source.foldPoints.length-3);
 }
});
test('n4, n5 and original six explicit user cases solve real whole-sheet layers before ordinary adoption',()=>{
 for(const row of cases.filter((r:any)=>['n4-explicit-user','n5-explicit-user','original-six-explicit-user'].includes(r.name))){
  const p=row.params,r=prepareTessResult(row.response,p),input=tessFlatInput(r,r.doc,row.name,true);
  const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
  assert.equal(flat.geometry.status,'ready',row.name);assert.equal(flat.layers.status,'solved',row.name);assert.equal(flat.layers.solutionCountExact,'1',row.name);
  assert.equal(canAdoptTessWithTileLayers(r,false,tessConstructionKey(p),p,flat.layers.status),true,row.name);
 }
});
