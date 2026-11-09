/** Diagnostic only: keep each Archimedean source face intact as one layer ID. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ear from 'rabbit-ear';
import earcut from 'earcut';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {solveConcaveLayerOrders} from '../../src/core/concaveLayers';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {polygonArea} from '../../src/core/geometry';
import type {FoldGraph} from '../../src/core/types';
import {makeQuotientExperiment,type ExperimentGraph} from './concaveLayerQuotient';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const h=Math.sqrt(3)/2;
const cases={
  '3182':{
    vertices:[[0,0],[1,0],[.5,h],[1.5,h],[1.5,1+h],[.5,1+h]],
    faces:[[0,1,2],[1,3,2],[2,3,4,5]],
    tileTwists:[['M','M','M'],['V','V','V'],['M','M','M','M']].map(centralTypes=>({
      width:.2,offset:0,tilt:Math.atan2(Math.sin(25*Math.PI/180),.2*Math.cos(25*Math.PI/180))*180/Math.PI,
      centralTypes})),
    monolithicOptions:undefined,
  },
  '3186':{
    vertices:[[0,0],[1,0],[1,1],[0,1],[.5,-h],[.5+h,-h-.5],[1+h,-.5],
      [1.5+h,-h-.5],[1.5+2*h,-h],[1+2*h,0],[1+2*h,1],[1+h,1.5]],
    faces:[[0,1,2,3],[4,1,0],[4,5,6,1],[5,7,6],[7,8,9,6],[1,6,9,10,11,2]],
    tileTwists:[['M','M','M','M'],['V','V','V'],['M','M','M','M'],
      ['V','V','V'],['M','M','M','M'],['V','V','V','V','V','V']].map(centralTypes=>({
      width:.12,offset:0,angleMode:'twist',twistAngle:29,centralTypes})),
    monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
      collinearCleanup:true,collinearTolerance:1e-8},
  },
} as const;
const choice=process.argv[2] as keyof typeof cases;
if(!cases[choice])throw Error('Usage: tsx scripts/experiments/p37ConcaveLayerAudit.ts 3182|3186');
const item=cases[choice],preset=tessPreset('custom');
const params=readTessParams({...preset,...item,repeatX:1,repeatY:1,customOutput:'tile-twists'});
assert.ok(params&&params.family==='custom');
const run=spawnSync(python,[path.join(root,'backend/tessellate.py')],{cwd:root,input:JSON.stringify(params),
  encoding:'utf8',timeout:30000,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(run.status,0,run.stderr||String(run.error));
const response=JSON.parse(run.stdout) as TessResponse,prepared=prepareTessResult(response,params);
const graph=process.argv.includes('--raw')?response.fold as FoldGraph:
  tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const folded=geometry.geometry.graph!;
const {result:tri,changes}=ear.graph.triangulate(folded,earcut);
const parents:number[]=[];
changes.faces!.map.forEach((children,face)=>children.forEach(child=>parents[child]=face));
const polygons=ear.graph.makeFacesPolygon(tri),polygonsAtEps=ear.graph.makeFacesPolygon(tri,1e-6);
const bad=tri.faces_vertices!.flatMap((face,index)=>{
  const points=face.map(vertex=>tri.vertices_coords[vertex]);
  const area=Math.abs(polygonArea(points)),maxEdge=Math.max(...points.map((p,i)=>
    Math.hypot(p[0]-points[(i+1)%3][0],p[1]-points[(i+1)%3][1])));
  return polygons[index].length!==3||polygonsAtEps[index].length!==3?
    [{triangle:index,parent:parents[index],vertices:face,area,relativeHeight:2*area/maxEdge,
      defaultLength:polygons[index].length,epsilonLength:polygonsAtEps[index].length}]:[];
});
console.log(JSON.stringify({example:choice,faces:folded.faces_vertices!.length,
  triangles:tri.faces_vertices!.length,edges:folded.edges_vertices.length,
  artificialEdges:changes.edges!.new.length,thin:bad}));
if(choice==='3182'){
  const face=folded.faces_vertices![8],points=face.map(v=>folded.vertices_coords[v]);
  const fans=face.map((anchor,r)=>{
    const order=[...face.slice(r),...face.slice(0,r)];
    const areas=Array.from({length:face.length-2},(_,i)=>
      Math.abs(polygonArea([order[0],order[i+1],order[i+2]].map(v=>folded.vertices_coords[v]))));
    return {anchor,minArea:Math.min(...areas),areas};
  });
  console.log(JSON.stringify({face8:face,points,area:polygonArea(points),fans}));
}
if(choice==='3186'&&process.argv.includes('--stats')){
  const problem=makeQuotientExperiment(folded as ExperimentGraph,1e-6);
  console.log(JSON.stringify({example:choice,variableCount:problem.variables.length,
    clauseCount:problem.clauses.length,types:problem.counts,maxAreaError:problem.maxAreaError}));
}
if(process.argv.includes('--rotations')){
  for(let rotation=0;rotation<10;rotation++){
    const rotated={...folded,faces_vertices:folded.faces_vertices!.map(face=>{
      const n=rotation%face.length;return [...face.slice(n),...face.slice(0,n)];
    })};
    const {result:next,changes:nextChanges}=ear.graph.triangulate(rotated,earcut);
    const defaultPoly=ear.graph.makeFacesPolygon(next),epsPoly=ear.graph.makeFacesPolygon(next,1e-6);
    const missing=next.faces_vertices!.flatMap((face,i)=>
      defaultPoly[i].length!==3||epsPoly[i].length!==3?[i]:[]);
    const edgeSet=new Set(next.faces_vertices!.flatMap(face=>face.map((a,i)=>{
      const b=face[(i+1)%face.length];return a<b?`${a} ${b}`:`${b} ${a}`;
    })));
    const lost=folded.edges_vertices.flatMap(([a,b],i)=>edgeSet.has(a<b?`${a} ${b}`:`${b} ${a}`)?[]:[i]);
    console.log(JSON.stringify({example:choice,rotation,triangles:next.faces_vertices!.length,
      missing,lostOriginalEdges:lost,newEdges:nextChanges.edges!.new.length}));
  }
}
if(process.argv.includes('--solve')){
  for(const eps of [1e-6,1e-7,1e-8,1e-9]){
    const candidate=process.argv.includes('--rotate-one')?{
      ...folded,faces_vertices:folded.faces_vertices!.map(face=>[...face.slice(1),face[0]]),
    }:folded;
    const start=performance.now(),answer=solveConcaveLayerOrders(candidate,eps);
    console.log(JSON.stringify({example:choice,eps,elapsedMs:Math.round(performance.now()-start),
      status:answer.status,message:'message' in answer?answer.message:undefined,
      count:'count' in answer?String(answer.count):undefined,nodes:'nodes' in answer?answer.nodes:undefined,
      originalRelations:'orders' in answer?answer.orders?.length:undefined}));
  }
}
