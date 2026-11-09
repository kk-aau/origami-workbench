import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {buildOriginalArrayStatic3D,originalArrayStatic3DMatches,OriginalArrayStatic3DError} from '../../src/app/originalArrayStatic3D';
import {generateMiuraHuffmanDocument,miuraHuffmanPreset,miuraHuffmanSourceMatches} from '../../src/app/miuraHuffmanCP';
import {buildYoshimuraMiuraCP,YOSHIMURA_MIURA_MIXED_EXAMPLE,YOSHIMURA_MIURA_RUNS_EXAMPLE,YOSHIMURA_MIURA_DOUBLE_SPIRAL_EXAMPLE,yoshimuraMiuraSourceMatches} from '../../src/app/yoshimuraMiuraCP2534';
import {waterbombTessellation2604Document,WATERBOMB_TESSELLATION_2604_EXAMPLE} from '../../src/app/waterbombTessellation2604';
import type {Doc,FoldGraph} from '../../src/core/types';

const representatives=()=>[...(['miura','mars','huffman'] as const).map(model=>({name:model,doc:generateMiuraHuffmanDocument(miuraHuffmanPreset(model))})),
 {name:'yosh-signed',doc:buildYoshimuraMiuraCP(YOSHIMURA_MIURA_MIXED_EXAMPLE)},
 {name:'yosh-runs',doc:buildYoshimuraMiuraCP(YOSHIMURA_MIURA_RUNS_EXAMPLE)},
 {name:'double-spiral',doc:buildYoshimuraMiuraCP(YOSHIMURA_MIURA_DOUBLE_SPIRAL_EXAMPLE)}];
const dist=(a:number[],b:number[])=>Math.hypot(...a.map((v,k)=>v-b[k]));
// Independent installed-library matrix implementation; not a Wolfram coordinate oracle.
function earImages(g:FoldGraph,root:number){
 const faces=g.faces_vertices!,owners=g.edges_faces!,adjacency=faces.map((_,f)=>owners.flatMap(fs=>fs.length===2&&fs.includes(f)?[fs.find(x=>x!==f)!]:[])),
  matrices=ear.graph.makeFacesMatrix({...g,faces_faces:adjacency},[root]) as number[][];
 return faces.map((face,f)=>face.map(v=>{const p=g.vertices_coords[v],m=matrices[f];return [m[0]*p[0]+m[3]*p[1]+m[9],m[1]*p[0]+m[4]*p[1]+m[10],m[2]*p[0]+m[5]*p[1]+m[11]];}));
}
for(const {name,doc} of representatives())test(`${name}: original signed hinges, every incident image and face metric; CP immutable`,()=>{
 const before=JSON.stringify(doc),r=buildOriginalArrayStatic3D(doc),g=(doc.metadata!.materialTopology as {graph:FoldGraph}).graph,independent=earImages(g,0);
 assert.equal(JSON.stringify(doc),before);assert.ok(originalArrayStatic3DMatches(doc,r));
 assert.deepEqual(r.scene.edges,g.edges_vertices);assert.deepEqual(r.scene.faces,g.faces_vertices);assert.deepEqual(r.scene.assignments,g.edges_assignment);
 assert.deepEqual(r.facePoses[0],{rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,0]});
 let max=0,pairs=0,images=0;g.faces_vertices!.forEach((face,f)=>{
  face.forEach((v,i)=>{max=Math.max(max,dist(independent[f][i],r.scene.vertices[v]));images++;});
  for(let i=0;i<face.length;i++)for(let j=i+1;j<face.length;j++){assert.ok(Math.abs(dist(g.vertices_coords[face[i]],g.vertices_coords[face[j]])-dist(r.scene.vertices[face[i]],r.scene.vertices[face[j]]))<=r.proof.toleranceMm);pairs++;}
 });
 assert.ok(max<=r.proof.toleranceMm);assert.equal(r.proof.checkedIncidentImages,images);assert.equal(r.proof.checkedFacePairs,pairs);
 assert.equal(r.proof.checkedNeighborPoses,r.proof.checkedInteriorHinges*2);assert.ok(r.proof.maximumPlanarityErrorMm<=r.proof.toleranceMm);assert.ok(r.proof.maximumSignedDihedralErrorRad<=r.proof.toleranceRad);
 assert.deepEqual(r.scope,{staticSpatialConstruction:true,continuousMotionCertified:false,selfCollisionCertified:false,layerOrderCertified:false,flatFoldCertificateAdded:false,wolframNumericalOutputReproduced:false});
 assert.equal(doc.metadata!.originalArrayStatic3D,undefined);assert.equal((doc.metadata!.materialTopology as any).foldedVertices,undefined);
});
test('Miura/Huffman positive and negative original Gamma produce mirrored world z, keeping CP coordinates',()=>{
 for(const model of ['miura','mars','huffman'] as const){const p=miuraHuffmanPreset(model),a=generateMiuraHuffmanDocument({...p,minorFoldAngleDeg:40}),b=generateMiuraHuffmanDocument({...p,minorFoldAngleDeg:-40}),one=buildOriginalArrayStatic3D(a),two=buildOriginalArrayStatic3D(b);
  assert.deepEqual((a.metadata!.materialTopology as any).graph.vertices_coords,(b.metadata!.materialTopology as any).graph.vertices_coords);
  one.scene.vertices.forEach((v,i)=>assert.ok(dist(v,[two.scene.vertices[i][0],two.scene.vertices[i][1],-two.scene.vertices[i][2]])<=one.proof.toleranceMm));
 }
});
test('negative Yosh Gamma and changed acute columns retain literal angle direction and close',()=>{
 const doc=buildYoshimuraMiuraCP({mode:'signed-columns',columnAnglesDeg:[30,-40,50],rows:3,horizontalFoldDeg:-50,unitSizeMm:7}),before=JSON.stringify(doc),r=buildOriginalArrayStatic3D(doc),g=(doc.metadata!.materialTopology as any).graph;
 assert.equal(JSON.stringify(doc),before);assert.ok(g.edges_foldAngle.some((v:number)=>v<0));assert.ok(g.edges_foldAngle.some((v:number)=>v>0));assert.ok(r.proof.maximumSignedDihedralErrorRad<r.proof.toleranceRad);
});
test('actual CP outside acute instructions can stay valid while original spatial closure is rejected',()=>{
 const doc=buildYoshimuraMiuraCP({mode:'signed-columns',columnAnglesDeg:[120,30],rows:3,horizontalFoldDeg:-50,unitSizeMm:1}),before=JSON.stringify(doc);
 assert.ok(yoshimuraMiuraSourceMatches(doc));assert.throws(()=>buildOriginalArrayStatic3D(doc),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SPATIAL_CLOSURE');
 assert.equal(JSON.stringify(doc),before);assert.ok(yoshimuraMiuraSourceMatches(doc));
});
test('source, raw graph, endpoint dimension and assignment mutation rejected without reconstruction',()=>{
 const doc=generateMiuraHuffmanDocument(miuraHuffmanPreset());
 const mutations=[(d:Doc)=>{d.segments[0].a.push(0);},(d:Doc)=>{d.segments[4].angle=0;},(d:Doc)=>{(d.metadata!.originalMiuraHuffman as any).recipe.minorFoldAngleDeg=55;},(d:Doc)=>{(d.metadata!.materialTopology as any).graph.vertices_coords[6][0]+=.001;},(d:Doc)=>{(d.metadata!.materialTopology as any).graph.faces_vertices[0].reverse();}];
 for(const mutate of mutations){const d=structuredClone(doc);mutate(d);const before=JSON.stringify(d);assert.throws(()=>buildOriginalArrayStatic3D(d),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SOURCE_BINDING');assert.equal(JSON.stringify(d),before);}
 assert.ok(miuraHuffmanSourceMatches(doc));
});
test('reference world/proof/source/face-pose tampering cannot pass uncached guard',()=>{
 const doc=generateMiuraHuffmanDocument(miuraHuffmanPreset()),r=buildOriginalArrayStatic3D(doc);
 const mutations=[(x:typeof r)=>{x.scene.vertices[6][2]+=.001;},(x:typeof r)=>{x.facePoses[2].translation[0]+=.001;},(x:typeof r)=>{x.proof.maximumIncidentVertexErrorMm=0;},(x:typeof r)=>{x.source.recipe={...(x.source.recipe as any),minorFoldAngleDeg:60};},(x:typeof r)=>{x.scope.selfCollisionCertified=true as false;}];
 for(const mutate of mutations){const x=structuredClone(r);mutate(x);assert.equal(originalArrayStatic3DMatches(doc,x),false);}assert.equal(originalArrayStatic3DMatches(doc,r),true);
 const named=structuredClone(doc);named.name='用户新名称';assert.equal(originalArrayStatic3DMatches(named,r),true);
});
test('stationary face is explicit, stays in original CP position; illegal indices never clamp',()=>{
 const doc=generateMiuraHuffmanDocument({...miuraHuffmanPreset(),columns:2,rows:2}),r=buildOriginalArrayStatic3D(doc,3),g=(doc.metadata!.materialTopology as any).graph;
 for(const v of g.faces_vertices[3])assert.deepEqual(r.scene.vertices[v],[...g.vertices_coords[v],0]);
 for(const index of [-1,1.5,4,NaN])assert.throws(()=>buildOriginalArrayStatic3D(doc,index),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SPATIAL_TOPOLOGY');
});
test('separate spatial resource budget and another original family preserve their CP',()=>{
 const doc=buildYoshimuraMiuraCP({mode:'uniform-runs',angleDeg:30,runs:[31],rows:20,horizontalFoldDeg:45,unitSizeMm:1}),before=JSON.stringify(doc);
 assert.ok(yoshimuraMiuraSourceMatches(doc));assert.throws(()=>buildOriginalArrayStatic3D(doc),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SPATIAL_BUDGET');assert.equal(JSON.stringify(doc),before);
 const water=waterbombTessellation2604Document(WATERBOMB_TESSELLATION_2604_EXAMPLE),waterBefore=JSON.stringify(water);
 assert.throws(()=>buildOriginalArrayStatic3D(water),(e:unknown)=>e instanceof OriginalArrayStatic3DError&&e.code==='SOURCE_CAPABILITY');assert.equal(JSON.stringify(water),waterBefore);
});
