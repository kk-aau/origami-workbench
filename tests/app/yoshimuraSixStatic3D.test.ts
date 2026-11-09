import test from 'node:test';import assert from 'node:assert/strict';
import type {Doc,FoldGraph} from '../../src/core/types';
import {generateYoshimuraSixDocument,yoshimuraSixPreset,yoshimuraSixSourceMatches,type YoshimuraSixRecipe} from '../../src/app/yoshimuraSixCP2507';
import {buildOriginalArrayStatic3D,originalArrayStatic3DMatches,OriginalArrayStatic3DError} from '../../src/app/originalArrayStatic3D';
import {generateMiuraHuffmanDocument,miuraHuffmanPreset} from '../../src/app/miuraHuffmanCP';
import {buildYoshimuraMiuraCP} from '../../src/app/yoshimuraMiuraCP2534';
const dist=(a:number[],b:number[])=>Math.hypot(...a.map((v,k)=>v-b[k]));
for(const seed of ['symmetric','kite','helical'] as const)test('six-degree original '+seed+' full finite spatial closure, actual all-face metric and angles',()=>{
 const doc=generateYoshimuraSixDocument(yoshimuraSixPreset(seed)),before=JSON.stringify(doc),ref=buildOriginalArrayStatic3D(doc),g=(doc.metadata!.materialTopology as {graph:FoldGraph}).graph;
 assert.equal(ref.source.construction,'MakeTYoshimuraOri');assert.deepEqual(ref.source.recipe,yoshimuraSixPreset(seed));assert.equal(JSON.stringify(doc),before);assert.ok(yoshimuraSixSourceMatches(doc));assert.ok(originalArrayStatic3DMatches(doc,ref));
 assert.deepEqual(ref.scene.edges,g.edges_vertices);assert.deepEqual(ref.scene.faces,g.faces_vertices);assert.deepEqual(ref.scene.assignments,g.edges_assignment);assert.equal(ref.scene.vertices.length,g.vertices_coords.length);
 let incidents=0,pairs=0;for(const f of g.faces_vertices!){for(const v of f){assert.ok(ref.scene.vertices[v].every(Number.isFinite));incidents++;}for(let i=0;i<f.length;i++)for(let j=i+1;j<f.length;j++){assert.ok(Math.abs(dist(ref.scene.vertices[f[i]],ref.scene.vertices[f[j]])-dist(g.vertices_coords[f[i]],g.vertices_coords[f[j]]))<=ref.proof.toleranceMm);pairs++;}}
 assert.equal(ref.proof.checkedIncidentImages,incidents);assert.equal(ref.proof.checkedFacePairs,pairs);assert.equal(ref.proof.checkedNeighborPoses,2*ref.proof.checkedInteriorHinges);assert.ok(ref.proof.checkedNeighborPoses>2*(g.faces_vertices!.length-1),'non-tree neighbors also checked');
 assert.ok(ref.proof.maximumIncidentVertexErrorMm<=ref.proof.toleranceMm);assert.ok(ref.proof.maximumFacePoseClosureErrorMm<=ref.proof.toleranceMm);assert.ok(ref.proof.maximumSignedDihedralErrorRad<=ref.proof.toleranceRad);
 assert.equal(ref.scope.continuousMotionCertified,false);assert.equal(ref.scope.selfCollisionCertified,false);assert.equal(ref.scope.layerOrderCertified,false);assert.equal(doc.flatFold,undefined);assert.equal((doc.metadata!.materialTopology as any).foldedVertices,undefined);assert.equal((doc.metadata!.originalYoshimuraSix2507 as any).scope.globalStatic3DChecked,false);
});
test('two original sliders alter actual world shape; the original CP geometry stays fixed',()=>{
 const p={...yoshimuraSixPreset(),columns:3,rows:3},a=generateYoshimuraSixDocument(p),b=generateYoshimuraSixDocument({...p,fold2Deg:35,fold6Deg:55}),ra=buildOriginalArrayStatic3D(a),rb=buildOriginalArrayStatic3D(b),ag=(a.metadata!.materialTopology as any).graph,bg=(b.metadata!.materialTopology as any).graph;
 assert.deepEqual(ag.vertices_coords,bg.vertices_coords);assert.notDeepEqual(ag.edges_foldAngle,bg.edges_foldAngle);assert.ok(ra.scene.vertices.some((v,i)=>dist(v,rb.scene.vertices[i])>1e-3));assert.ok(rb.proof.maximumFacePoseClosureErrorMm<rb.proof.toleranceMm);
 const scale=.005,c=generateYoshimuraSixDocument({...p,firstLengthMm:p.firstLengthMm*scale}),rc=buildOriginalArrayStatic3D(c);ra.scene.vertices.forEach((v,i)=>assert.ok(dist(v.map(x=>x*scale),rc.scene.vertices[i])<=ra.proof.toleranceMm));
 const large=buildOriginalArrayStatic3D(generateYoshimuraSixDocument({...yoshimuraSixPreset('kite'),columns:2,rows:2,firstLengthMm:200,fold2Deg:30,fold6Deg:60}));assert.ok(large.proof.maximumIncidentVertexErrorMm<=large.proof.toleranceMm);
});
test('source or actual angle changes refuse spatial preview without silent reconstruction',()=>{
 const doc=generateYoshimuraSixDocument(yoshimuraSixPreset());
 const mutations=[(d:Doc)=>{d.segments[3].angle=0;},(d:Doc)=>{(d.metadata!.materialTopology as any).graph.edges_foldAngle[3]=0;},(d:Doc)=>{(d.metadata!.originalYoshimuraSix2507 as any).recipe.fold6Deg=55;},(d:Doc)=>{d.segments[0].a.push(0);},(d:Doc)=>{(d.metadata!.materialTopology as any).graph.vertices_coords[2][0]+=.01;}];
 for(const mutate of mutations){const d=structuredClone(doc);mutate(d);const before=JSON.stringify(d);assert.throws(()=>buildOriginalArrayStatic3D(d),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SOURCE_BINDING');assert.equal(JSON.stringify(d),before);}
 assert.ok(yoshimuraSixSourceMatches(doc));
});
test('fixed face stays at its raw CP origin; saved reference mutations refuse and valid named doc keeps source',()=>{
 const doc=generateYoshimuraSixDocument({...yoshimuraSixPreset(),columns:2,rows:2}),r=buildOriginalArrayStatic3D(doc,3),g=(doc.metadata!.materialTopology as any).graph;
 assert.deepEqual(r.facePoses[3],{rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,0]});
 for(const v of g.faces_vertices[3])assert.ok(dist(r.scene.vertices[v],[...g.vertices_coords[v],0])<=r.proof.toleranceMm);
 for(const index of [-1,.5,16])assert.throws(()=>buildOriginalArrayStatic3D(doc,index),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SPATIAL_TOPOLOGY');
 for(const mutate of [(x:typeof r)=>{x.scene.vertices[5][2]+=.001;},(x:typeof r)=>{x.facePoses[3].translation[0]+=.001;},(x:typeof r)=>{x.scope.selfCollisionCertified=true as false;}]){const x=structuredClone(r);mutate(x);assert.equal(originalArrayStatic3DMatches(doc,x),false);}
 const named=structuredClone(doc);named.name='用户六度';assert.equal(originalArrayStatic3DMatches(named,r),true);
});
test('narrow six capability leaves previous source families and their real closure refusal unchanged',()=>{
 const miura=generateMiuraHuffmanDocument(miuraHuffmanPreset());assert.equal(buildOriginalArrayStatic3D(miura).source.construction,'MakeTMiuraMarsOri');
 const bad=buildYoshimuraMiuraCP({mode:'signed-columns',columnAnglesDeg:[120,30],rows:3,horizontalFoldDeg:-50,unitSizeMm:1}),before=JSON.stringify(bad);assert.throws(()=>buildOriginalArrayStatic3D(bad),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SPATIAL_CLOSURE');assert.equal(JSON.stringify(bad),before);
});
