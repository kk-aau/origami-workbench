import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WATERBOMB_TESSELLATION_2604_EXAMPLE,waterbombTessellation2604Document,waterbombTessellation2604SourceMatches,readWaterbombTessellation2604Recipe,validateWaterbombTessellation2604Recipe,prepareWaterbombTessellation2604Preview} from '../../src/app/waterbombTessellation2604';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import {exampleDoc} from '../../src/app/state';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {buildFold,epsilonFor} from '../../src/core/geometry';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/waterbomb-tessellation-2604-20261011.json',import.meta.url),'utf8')),
 r=WATERBOMB_TESSELLATION_2604_EXAMPLE,own=(d:any)=>d.metadata.originalWaterbombTessellation2604,clone=<T>(v:T):T=>structuredClone(v);
for(const c of fixture.cases)test(`literal original ${c.recipe.nx}×${c.recipe.ny} / t=${c.recipe.t} matches independent MP80`,()=>{
 const d=waterbombTessellation2604Document(c.recipe),material=inspectMaterialTopology(d);assert.ok(material.ok);if(!material.ok)return;
 const g=material.graph,s=c.sourceGraph,unit=c.recipe.unitSizeMm;
 assert.deepEqual(g.vertices_coords,s.vertices_coords.map((p:number[])=>p.map(x=>x*unit)));
 for(const key of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices'] as const)assert.deepEqual(g[key],s[key]);
 own(d).spatialVerticesMm.forEach((p:number[],i:number)=>p.forEach((x,k)=>assert.ok(Math.abs(x-s.vertices_coords3d[i][k]*unit)<1e-11,`sourceFF ${i}/${k}`)));
 assert.equal(g.vertices_coords.length,s.counts.vertices);assert.equal(g.edges_vertices.length,s.counts.edges);assert.equal(g.faces_vertices!.length,6*c.recipe.nx*c.recipe.ny);
 assert.equal(material.components.length,1);assert.equal(material.components[0].boundaryLoops.length,1);assert.equal(material.foldedVertices,undefined);
 assert.equal(own(d).staticSpatialProof.pairChecks,s.pairChecks);assert.ok(own(d).staticSpatialProof.minimumSpatialTriangleCrossSquaredMm4>0);
 assert.ok(waterbombTessellation2604SourceMatches(d));assert.deepEqual(readWaterbombTessellation2604Recipe(d),c.recipe);
 assert.deepEqual(own(d).spatialVerticesMm[0],[0,0,0]);assert.deepEqual(own(d).sourcePlanarCoordinates[0],[0,0]);
 assert.equal(own(d).source.viewRotationXPiOverTwoAppliedToWorld,false);assert.equal(own(d).source.cpIndependentOfT,true);
 for(const k of ['flatFoldCertified','layerOrderCertified','continuousMotionCertified','collisionFreeCertified'])assert.equal(own(d).evidence[k],false);
});
test('In2604 array is 38 indexed source vertices / 91 edges / 54 true faces, not the single-base example',()=>{
 const d=waterbombTessellation2604Document(r),g=(d.metadata!.materialTopology as any).graph;
 assert.equal(g.vertices_coords.length,38);assert.equal(d.segments.length,91);assert.equal(g.faces_vertices.length,54);
 assert.equal(d.segments.filter(s=>s.assignment==='B').length,20);assert.equal(d.segments.filter(s=>s.assignment==='M').length,35);assert.equal(d.segments.filter(s=>s.assignment==='V').length,36);
 assert.notDeepEqual(d.segments,exampleDoc('waterbomb').segments);assert.deepEqual(d.paper,{width:150,height:150});
});
test('t changes only original spatial shape, not any CP point, edge, face, assignment or target angle',()=>{
 const ds=[0,.25,.5,.999,1].map(t=>waterbombTessellation2604Document({...r,t}));
 ds.slice(1).forEach(d=>{assert.deepEqual(d.segments,ds[0].segments);assert.deepEqual(d.metadata!.materialTopology,ds[0].metadata!.materialTopology);assert.notDeepEqual(own(d).spatialVerticesMm,own(ds[0]).spatialVerticesMm);});
 assert.equal(new Set(own(ds[4]).spatialVerticesMm.map((p:number[])=>JSON.stringify(p))).size<38,true);
 assert.equal((ds[4].metadata!.materialTopology as any).graph.vertices_coords.length,38);
});
test('small t evaluates the original analytic limit without an overflowing offset or moving source points',()=>{
 const zero=waterbombTessellation2604Document({...r,t:0});
 for(const t of [Number.MIN_VALUE,1e-300,1e-20,1e-8]){
  const d=waterbombTessellation2604Document({...r,t});assert.ok(waterbombTessellation2604SourceMatches(d));
  own(d).spatialVerticesMm.forEach((p:number[],i:number)=>p.forEach((x,k)=>assert.ok(Math.abs(x-own(zero).spatialVerticesMm[i][k])<1e-4)));
 }
});
test('finite resource limit and invalid raw input are rejected without clamping or defaults',()=>{
 for(const v of [null,{}, {...r,nx:0},{...r,nx:11},{...r,ny:1.5},{...r,t:-Number.MIN_VALUE},{...r,t:1.01},{...r,unitSizeMm:0},{...r,unitSizeMm:1001},{...r,nx:'3'},{...r,t:NaN},{...r,extra:1}])assert.throws(()=>validateWaterbombTessellation2604Recipe(v));
 for(const k of Object.keys(r)){const v:any={...r};delete v[k];assert.throws(()=>validateWaterbombTessellation2604Recipe(v));}
 const maximum=waterbombTessellation2604Document({...r,nx:10,ny:10,t:.75,unitSizeMm:1});assert.equal(own(maximum).topology.faces,600);assert.ok(waterbombTessellation2604SourceMatches(maximum));
});
test('mm scaling occurs once, equally in original CP and spatial coordinates, with no 200-span normalization',()=>{
 const a=waterbombTessellation2604Document({...r,unitSizeMm:1}),b=waterbombTessellation2604Document({...r,unitSizeMm:80});
 a.segments.forEach((s,i)=>{assert.deepEqual(b.segments[i].a,s.a.map(x=>x*80));assert.deepEqual(b.segments[i].b,s.b.map(x=>x*80));});
 own(a).spatialVerticesMm.forEach((p:number[],i:number)=>assert.deepEqual(own(b).spatialVerticesMm[i],p.map(x=>x*80)));assert.deepEqual(b.paper,{width:240,height:240});
});
test('source / actual CP / topology / proof mutations refuse without reconstructing or changing the supplied Doc',()=>{
 const d=waterbombTessellation2604Document(r),mutations=[(x:any)=>own(x).recipe.nx=4,(x:any)=>own(x).recipe.t=.5,(x:any)=>own(x).source.originalParameters.t=.5,
  (x:any)=>own(x).source.vertexSources[1].point='p1',(x:any)=>own(x).sourcePlanarCoordinates[1][0]+=Number.MIN_VALUE,
  (x:any)=>own(x).spatialVerticesMm[0][1]=Number.MIN_VALUE,(x:any)=>own(x).spatialVerticesMm[3][2]+=.001,
  (x:any)=>own(x).staticSpatialProof.maximumSquaredDistanceErrorMm2+=Number.EPSILON,
  (x:any)=>own(x).staticSpatialProof.minimumSpatialTriangleCrossSquaredMm4=0,(x:any)=>own(x).staticSpatialProof.pairChecks++,
  (x:any)=>own(x).numericalPolicy.spatialCoordinateReplayAbsoluteBudgetMm*=2,(x:any)=>own(x).evidence.layerOrderCertified=true,
  (x:any)=>x.paper.width+=Number.EPSILON*150,(x:any)=>x.paper.width='150',(x:any)=>x.segments[0].a=[0,0,0],
  (x:any)=>x.segments[0].a[0]=Number.MIN_VALUE,(x:any)=>x.segments[2].assignment='M',(x:any)=>x.segments[2].angle=90,
  (x:any)=>x.metadata.materialTopology.graph.faces_vertices[0].reverse(),(x:any)=>x.metadata.materialTopology.edgeSegmentIds.reverse(),
  (x:any)=>x.flatFold={startingFace:0},(x:any)=>own(x).schema='different'];
 for(const mutate of mutations){const bad=clone(d);mutate(bad);const bytes=JSON.stringify(bad);assert.equal(waterbombTessellation2604SourceMatches(bad),false);assert.equal(JSON.stringify(bad),bytes);}
 const named=clone(d);named.name='用户命名';named.metadata!.note='合法备注';assert.ok(waterbombTessellation2604SourceMatches(named));
});
test('endpoint spatial literal identities are exact and signed zero is wire-equivalent',()=>{
 for(const t of [0,1]){const d=waterbombTessellation2604Document({...r,t});
  const bad=clone(d);own(bad).spatialVerticesMm[3][1]=Number.MIN_VALUE;assert.equal(waterbombTessellation2604SourceMatches(bad),false);
  const zero=clone(d);own(zero).spatialVerticesMm[0]=[-0,0,-0];assert.ok(waterbombTessellation2604SourceMatches(zero));
 }
});
test('actual JSON/FOLD roundtrip and ordinary/optimized LINE exports retain all original CP geometry',()=>{
 const d=waterbombTessellation2604Document(r),bytes=JSON.stringify(d);
 for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;assert.ok(waterbombTessellation2604SourceMatches(reopened));assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(own(reopened),own(d));}
 const out=exportDXF(d);assert.ok(out.text.includes('AC1009'));
 const tokens=out.text.replace(/\r/g,'').split('\n').map(x=>x.trim()),lines:{a:number[];b:number[]}[]=[];
 for(let i=0;i+1<tokens.length;i+=2)if(tokens[i]==='0'&&tokens[i+1]==='LINE'){
  const fields=new Map<string,string>();for(let j=i+2;j+1<tokens.length&&tokens[j]!=='0';j+=2)fields.set(tokens[j],tokens[j+1]);
  lines.push({a:[Number(fields.get('10')),Number(fields.get('20'))],b:[Number(fields.get('11')),Number(fields.get('21'))]});
 }
 assert.equal(lines.length,d.segments.length);lines.forEach((s,i)=>{assert.equal(JSON.stringify(s.a),JSON.stringify([d.segments[i].a[0],-d.segments[i].a[1]]));assert.equal(JSON.stringify(s.b),JSON.stringify([d.segments[i].b[0],-d.segments[i].b[1]]));});
 const plan=optimizeCPPaths(d),processed=exportCPProcessingDXF(d,plan);assert.equal(verifyCPProcessingExport(processed.text,'dxf',d,plan).verified,true);assert.equal(JSON.stringify(d),bytes);
});
test('normal flat-fold geometry is independently computed from CP, not copied from the current t spatial preview',()=>{
 const d=waterbombTessellation2604Document({...r,nx:1,ny:1});const result=computeFlatGeometry(buildFold(d).graph,epsilonFor(d));assert.equal(result.geometry.status,'ready');
 assert.notDeepEqual(result.geometry.vertices,own(d).spatialVerticesMm.map((p:number[])=>p.slice(0,2)));assert.equal(own(d).evidence.flatFoldCertified,false);
});
test('t-only preview shares an immutable validated CP, while adoption is an editable whole clone with full source guard',()=>{
 const build=prepareWaterbombTessellation2604Preview(r),a=build(r),b=build({...r,t:.75});
 assert.equal(a.segments,b.segments);assert.ok(Object.isFrozen(a.segments));assert.ok(Object.isFrozen((a.metadata!.materialTopology as any).graph.vertices_coords[0]));
 assert.deepEqual(b,waterbombTessellation2604Document({...r,t:.75}));assert.ok(waterbombTessellation2604SourceMatches(b));
 assert.throws(()=>build({...r,nx:4}));assert.throws(()=>build({...r,unitSizeMm:51}));
 const adopted=clone(b);assert.equal(Object.isFrozen(adopted.segments),false);adopted.segments[2].angle=90;assert.equal(waterbombTessellation2604SourceMatches(adopted),false);assert.ok(waterbombTessellation2604SourceMatches(b));
});
