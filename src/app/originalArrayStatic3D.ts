/** Original FoldEmbedding / FoldGraph3D signed-hinge construction, checked on the actual CP.
 * A static reference only: no motion, collision, layer-order or Wolfram-coordinate certificate. */
import {validateDoc,type Doc,type FoldGraph} from '../core/types';
import type {MiuraHuffmanRecipe} from './miuraHuffmanCP';
import type {YoshimuraMiuraRecipe} from './yoshimuraMiuraCP2534';
import type {YoshimuraSixRecipe} from './yoshimuraSixCP2507';
import {originalArraySourceMatches,readOriginalArraySource} from './originalArraySource';
import type {RigidQuadScene} from './rigidQuadView';

type Vec3=[number,number,number];
/** Row-major 3x3 followed by translation; all coordinates remain millimetres. */
export type OriginalArrayFacePose={rotation:number[];translation:Vec3};
export type OriginalArrayStatic3D={
 schema:'original-array-checked-static-spatial-v1';
 source:{notebookSHA256:string;construction:'MakeTMiuraMarsOri'|'MakeTHuffmanGrid'|'MakeYoshimuraMiuraOri'|'MakeTYoshimuraOri';
  recipe:MiuraHuffmanRecipe|YoshimuraMiuraRecipe|YoshimuraSixRecipe;foldEmbeddingCell:'In[1336]';foldGraph3DCell:'In[1458]';
  stationaryFaceZeroBased:number;coordinateUnit:'mm';coordinatesScaledAgain:false;originalSignedAnglesRetained:true};
 scene:RigidQuadScene;facePoses:OriginalArrayFacePose[];
 proof:{model:'binary64-engineering-check-not-interval-or-Wolfram-oracle';
  toleranceMm:number;toleranceRad:number;maximumIncidentVertexErrorMm:number;maximumFacePoseClosureErrorMm:number;
  maximumFaceDistanceErrorMm:number;maximumPlanarityErrorMm:number;maximumSignedDihedralErrorRad:number;
  checkedIncidentImages:number;checkedNeighborPoses:number;checkedFacePairs:number;checkedInteriorHinges:number;
  allIncidentVerticesChecked:true;allNeighborFacePosesChecked:true;allFacePairsChecked:true;allFacePlanesChecked:true;
  coordinateWelding:false;foldAnglesReplaced:false;cpModified:false};
 scope:{staticSpatialConstruction:true;continuousMotionCertified:false;selfCollisionCertified:false;
  layerOrderCertified:false;flatFoldCertificateAdded:false;wolframNumericalOutputReproduced:false};
};
export class OriginalArrayStatic3DError extends Error{
 constructor(public readonly code:'SOURCE_BINDING'|'SOURCE_CAPABILITY'|'SPATIAL_BUDGET'|'SPATIAL_TOPOLOGY'|'SPATIAL_CLOSURE'|'SPATIAL_METRIC'|'SPATIAL_ANGLE',message:string){super(message);this.name='OriginalArrayStatic3DError';}
}
const fail=(code:OriginalArrayStatic3DError['code'],message:string):never=>{throw new OriginalArrayStatic3DError(code,message);};
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
 cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=(a:Vec3)=>Math.hypot(...a),distance=(a:Vec3,b:Vec3)=>length(sub(a,b)),
 unit=(a:Vec3):Vec3=>{const n=length(a);if(!Number.isFinite(n)||n===0)return fail('SPATIAL_TOPOLOGY','原面或共享边退化，未移动或吸附顶点。');return a.map(x=>x/n) as Vec3;},
 identity=():OriginalArrayFacePose=>({rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,0]}),
 vector=(p:OriginalArrayFacePose,v:Vec3):Vec3=>[0,1,2].map(i=>p.rotation[3*i]*v[0]+p.rotation[3*i+1]*v[1]+p.rotation[3*i+2]*v[2]) as Vec3,
 image=(p:OriginalArrayFacePose,v:Vec3):Vec3=>vector(p,v).map((x,k)=>x+p.translation[k]) as Vec3;
function compose(a:OriginalArrayFacePose,b:OriginalArrayFacePose):OriginalArrayFacePose{
 const rotation=Array.from({length:9},(_,i)=>{const row=Math.floor(i/3),col=i%3;return [0,1,2].reduce((s,k)=>s+a.rotation[3*row+k]*b.rotation[3*k+col],0);});
 return {rotation,translation:image(a,b.translation)};
}
/** Original q + RotationMatrix3Du[phi, Normalize[child shared edge]].(x-q). */
function hinge(q:Vec3,end:Vec3,angleRad:number):OriginalArrayFacePose{
 const [x,y,z]=unit(sub(end,q)),c=Math.cos(angleRad),s=Math.sin(angleRad),t=1-c,
  rotation=[t*x*x+c,t*x*y-s*z,t*x*z+s*y,t*x*y+s*z,t*y*y+c,t*y*z-s*x,t*x*z-s*y,t*y*z+s*x,t*z*z+c],
  out={rotation,translation:[0,0,0] as Vec3},rotated=vector(out,q);
 out.translation=q.map((v,k)=>v-rotated[k]) as Vec3;return out;
}
function sourceGraph(doc:Doc){
 try{validateDoc(doc);}catch{return fail('SOURCE_BINDING','工程格式无效，未重建或掩盖原图变化。');}
 const source=readOriginalArraySource(doc);
 if(!source||!originalArraySourceMatches(doc))return fail('SOURCE_BINDING','当前原参数、赋型、目标角和实际 CP 不一致；请明确重建来源。');
 if(source.kind!=='wave-grid'&&source.kind!=='yoshimura-miura'&&source.kind!=='yoshimura-six')return fail('SOURCE_CAPABILITY','此来源没有接入本静态折角构形；保留其现有二维 CP 门禁与专属预览。');
 const wave=source.kind==='wave-grid',recipe=source.recipe,
  graph=(doc.metadata!.materialTopology as {graph:FoldGraph}).graph,faces=graph.faces_vertices!;
 // A separate local spatial budget. Exceeding it never invalidates the existing CP constructor.
 if(faces.length>600||graph.vertices_coords.length>8192||faces.some(f=>f.length>64))return fail('SPATIAL_BUDGET','当前静态 3D 预算为 600 面；二维 CP 仍按原门禁处理。');
 const construction=wave?(recipe as MiuraHuffmanRecipe).model==='huffman'?'MakeTHuffmanGrid':'MakeTMiuraMarsOri':source.kind==='yoshimura-six'?'MakeTYoshimuraOri':'MakeYoshimuraMiuraOri';
 return {graph,faces,recipe,construction} as const;
}
function topology(g:FoldGraph){
 const faces=g.faces_vertices!,lookup=new Map<string,number>(),owners=g.edges_vertices.map(()=>[] as number[]),
  key=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
 g.edges_vertices.forEach(([a,b],e)=>{if(lookup.has(key(a,b)))fail('SPATIAL_TOPOLOGY','源边身份重复。');lookup.set(key(a,b),e);});
 const faceEdges=faces.map((f,fi)=>f.map((a,i)=>{const e=lookup.get(key(a,f[(i+1)%f.length]));if(e===undefined)return fail('SPATIAL_TOPOLOGY','源面的共享边缺失。');owners[e].push(fi);return e;}));
 const adjacency=faces.map(()=>[] as {face:number;edge:number}[]);
 owners.forEach((fs,e)=>{
  if(fs.length===(g.edges_assignment[e]==='B'?1:2)){}else fail('SPATIAL_TOPOLOGY','纸边和内部边的材料身份不一致。');
  const angle=g.edges_foldAngle[e];if(typeof angle!=='number'||!Number.isFinite(angle)||fs.length===2&&g.edges_assignment[e]==='U')fail('SPATIAL_ANGLE','静态构形须保留明确原目标角；不会用 U 自动替换为 180°。');
  if(fs.length===2){const [a,b]=fs;adjacency[a].push({face:b,edge:e});adjacency[b].push({face:a,edge:e});}
 });
 const directed=(face:number,edge:number):[number,number]=>{const f=faces[face],i=faceEdges[face].indexOf(edge);return [f[i],f[(i+1)%f.length]];};
 return {owners,adjacency,directed};
}
function faceNormal(points:Vec3[],face:number[]):Vec3{
 // Translate first, avoiding cancellation caused solely by a distant CP origin.
 const o=points[face[0]];let n:Vec3=[0,0,0];
 for(let i=1;i+1<face.length;i++){const p=cross(sub(points[face[i]],o),sub(points[face[i+1]],o));n=n.map((x,k)=>x+p[k]) as Vec3;}
 return unit(n);
}
const angleError=(actual:number,expected:number)=>Math.abs(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)));
function check(g:FoldGraph,poses:OriginalArrayFacePose[],rootFace:number){
 const faces=g.faces_vertices!,flat=g.vertices_coords.map(([x,y])=>[x,y,0] as Vec3),top=topology(g),xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1]),
  span=Math.max(1,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))),
  toleranceMm=256*Number.EPSILON*span*Math.max(1,faces.length),toleranceRad=4096*Number.EPSILON*Math.max(1,faces.length),
  images=faces.map((f,i)=>f.map(v=>image(poses[i],flat[v]))),vertices=flat.map(()=>null as Vec3|null);
 let maximumIncidentVertexErrorMm=0,maximumFacePoseClosureErrorMm=0,maximumFaceDistanceErrorMm=0,maximumPlanarityErrorMm=0,maximumSignedDihedralErrorRad=0,
  checkedIncidentImages=0,checkedNeighborPoses=0,checkedFacePairs=0,checkedInteriorHinges=0;
 images.forEach((ps,f)=>ps.forEach((p,i)=>{if(!p.every(Number.isFinite))fail('SPATIAL_METRIC','原空间计算产生非有限值。');const v=faces[f][i];if(vertices[v])maximumIncidentVertexErrorMm=Math.max(maximumIncidentVertexErrorMm,distance(vertices[v]!,p));else vertices[v]=p;checkedIncidentImages++;}));
 if(vertices.some(p=>!p))fail('SPATIAL_TOPOLOGY','存在不属于任何材料面的顶点。');
 if(maximumIncidentVertexErrorMm>toleranceMm)fail('SPATIAL_CLOSURE',`共享顶点空间闭环未通过（${maximumIncidentVertexErrorMm.toExponential(2)} mm）；保留二维 CP。`);
 const world=vertices as Vec3[];
 // Every neighboring hinge, including non-tree links, predicts the whole neighbor face pose.
 top.owners.forEach((fs,e)=>{if(fs.length!==2)return;checkedInteriorHinges++;for(const [parent,child] of [[fs[0],fs[1]],[fs[1],fs[0]]]){
  const [a,b]=top.directed(child,e),expected=compose(poses[parent],hinge(flat[a],flat[b],g.edges_foldAngle[e]!*Math.PI/180));
  for(const v of faces[child])maximumFacePoseClosureErrorMm=Math.max(maximumFacePoseClosureErrorMm,distance(image(expected,flat[v]),image(poses[child],flat[v])));
  checkedNeighborPoses++;
 }});
 if(maximumFacePoseClosureErrorMm>toleranceMm)fail('SPATIAL_CLOSURE',`整面空间闭环未通过（${maximumFacePoseClosureErrorMm.toExponential(2)} mm）；不吸附或平均原顶点。`);
 const normals=faces.map(f=>faceNormal(world,f));
 faces.forEach((face,f)=>{
  for(const v of face)maximumPlanarityErrorMm=Math.max(maximumPlanarityErrorMm,Math.abs(dot(sub(world[v],world[face[0]]),normals[f])));
  for(let i=0;i<face.length;i++)for(let j=i+1;j<face.length;j++){
   maximumFaceDistanceErrorMm=Math.max(maximumFaceDistanceErrorMm,Math.abs(distance(world[face[i]],world[face[j]])-distance(flat[face[i]],flat[face[j]])));checkedFacePairs++;
  }
 });
 top.owners.forEach((fs,e)=>{if(fs.length!==2)return;const [parent,child]=fs,[a,b]=top.directed(child,e),axis=unit(sub(world[b],world[a])),
  actual=Math.atan2(dot(axis,cross(normals[parent],normals[child])),dot(normals[parent],normals[child]));
  maximumSignedDihedralErrorRad=Math.max(maximumSignedDihedralErrorRad,angleError(actual,g.edges_foldAngle[e]!*Math.PI/180));
 });
 if(maximumFaceDistanceErrorMm>toleranceMm||maximumPlanarityErrorMm>toleranceMm)fail('SPATIAL_METRIC','当前逐面等距或平面性检查未通过；二维 CP 未改变。');
 if(maximumSignedDihedralErrorRad>toleranceRad)fail('SPATIAL_ANGLE','当前原正负折角与空间面法向不一致；没有替换目标角。');
 const minimumSpatialEdgeLength=Math.min(...g.edges_vertices.map(([a,b])=>distance(world[a],world[b])));if(!Number.isFinite(minimumSpatialEdgeLength)||minimumSpatialEdgeLength<=0)fail('SPATIAL_METRIC','空间边退化。');
 if(JSON.stringify(poses[rootFace])!==JSON.stringify(identity()))fail('SPATIAL_TOPOLOGY','固定面不再是原位恒等姿态。');
 return {scene:{vertices:world,edges:structuredClone(g.edges_vertices),faces:structuredClone(faces),assignments:structuredClone(g.edges_assignment) as RigidQuadScene['assignments'],
  maximumFaceDistanceError:maximumFaceDistanceErrorMm,maximumGridClosureError:Math.max(maximumIncidentVertexErrorMm,maximumFacePoseClosureErrorMm),maximumFoldAngleErrorRad:maximumSignedDihedralErrorRad,minimumSpatialEdgeLength},
  proof:{model:'binary64-engineering-check-not-interval-or-Wolfram-oracle' as const,toleranceMm,toleranceRad,maximumIncidentVertexErrorMm,maximumFacePoseClosureErrorMm,maximumFaceDistanceErrorMm,maximumPlanarityErrorMm,maximumSignedDihedralErrorRad,
   checkedIncidentImages,checkedNeighborPoses,checkedFacePairs,checkedInteriorHinges,allIncidentVerticesChecked:true as const,allNeighborFacePosesChecked:true as const,allFacePairsChecked:true as const,allFacePlanesChecked:true as const,coordinateWelding:false as const,foldAnglesReplaced:false as const,cpModified:false as const}};
}
/** Uncached public construction. Only the actual, strict current source CP supplies angles and identity. */
export function buildOriginalArrayStatic3D(doc:Doc,stationaryFaceZeroBased=0):OriginalArrayStatic3D{
 const {graph:g,faces,recipe,construction}=sourceGraph(doc);
 if(!Number.isSafeInteger(stationaryFaceZeroBased)||stationaryFaceZeroBased<0||stationaryFaceZeroBased>=faces.length)fail('SPATIAL_TOPOLOGY','固定面索引无效，未自动夹取。');
 const {adjacency,directed}=topology(g),flat=g.vertices_coords.map(([x,y])=>[x,y,0] as Vec3),poses=faces.map(()=>null as OriginalArrayFacePose|null),queue=[stationaryFaceZeroBased];poses[stationaryFaceZeroBased]=identity();
 for(let i=0;i<queue.length;i++)for(const {face:child,edge} of adjacency[queue[i]])if(!poses[child]){
  const [a,b]=directed(child,edge);poses[child]=compose(poses[queue[i]]!,hinge(flat[a],flat[b],g.edges_foldAngle[edge]!*Math.PI/180));queue.push(child);
 }
 if(poses.some(p=>!p))fail('SPATIAL_TOPOLOGY','原材料面图不连通，未连成不存在的一张纸。');
 const facePoses=poses as OriginalArrayFacePose[],checked=check(g,facePoses,stationaryFaceZeroBased);
 return {schema:'original-array-checked-static-spatial-v1',source:{notebookSHA256:'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',construction,recipe:structuredClone(recipe),foldEmbeddingCell:'In[1336]',foldGraph3DCell:'In[1458]',stationaryFaceZeroBased,coordinateUnit:'mm',coordinatesScaledAgain:false,originalSignedAnglesRetained:true},...checked,facePoses,
  scope:{staticSpatialConstruction:true,continuousMotionCertified:false,selfCollisionCertified:false,layerOrderCertified:false,flatFoldCertificateAdded:false,wolframNumericalOutputReproduced:false}};
}
/** Re-open or untrusted reference guard: replay full source and all checks, without object caches. */
export function originalArrayStatic3DMatches(doc:Doc,reference:unknown):reference is OriginalArrayStatic3D{
 try{if(!reference||typeof reference!=='object')return false;const r=reference as OriginalArrayStatic3D;
  const expected=buildOriginalArrayStatic3D(doc,r.source?.stationaryFaceZeroBased);return JSON.stringify(reference)===JSON.stringify(expected);
 }catch{return false;}
}
