import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import ear from 'rabbit-ear';
import earcut from 'earcut';
import {computeFlatGeometry,computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {solveConcaveLayerOrders,countOriginalLayerAssignments,isSimpleLayerPolygon} from '../../src/core/concaveLayers';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {polygonArea} from '../../src/core/geometry';
import {makeQuotientExperiment,solveQuotientExperiment,verifyQuotientLift,
 quotientFaceOrders,type ExperimentGraph} from '../../scripts/experiments/concaveLayerQuotient';
import {tessFlatRoot} from '../../src/app/tessellationFlat';
import {startFlatLayerReanalysis} from '../../src/core/workerClient';
import type {Doc,FoldGraph,Point,FlatFoldResult,FlatWorkerRequest} from '../../src/core/types';

const code=`import json,sys
sys.path.insert(0,'backend')
from tessellation_unit_cyclic_centered import original_cyclic_centered_pair
from tessellation_unit_cyclic_brocard_offset import original_cyclic_brocard_offset_pair
from test_tessellation_archimedean_patch6_lattice import source_patch6,SOURCE_TYPES as S6
from test_tessellation_archimedean_patch8_lattice import source_patch8,SOURCE_TYPES as S8,MONOLITHIC
from tessellation_lattice_patch import twist_patch_options
from tessellation_meshes import polygon_mesh
from tessellation_tile_patch import construct_tile_patch
def patch(f,types,width,angle,options=None):
    p=f();m=polygon_mesh(p);t=twist_patch_options(p,types,width,variant='centered-angle',angle=angle)
    return construct_tile_patch(m,t,m['vertices_coords'],m['faces_vertices'],options)
print(json.dumps({'3042':original_cyclic_centered_pair(False)['fold'],'3045':original_cyclic_centered_pair(True)['fold'],'3048':original_cyclic_brocard_offset_pair()['fold'],'3182':patch(source_patch6,S6,.2,25),'3186':patch(source_patch8,S8,.12,29,MONOLITHIC)}))`;
const loaded=spawnSync('.venv/Scripts/python.exe',['-c',code],{encoding:'utf8',timeout:30_000,maxBuffer:4*1024*1024,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(loaded.status,0,loaded.error?.message??loaded.stderr);
const graphs=JSON.parse(loaded.stdout) as Record<string,FoldGraph>;
const geometry=(name='3042')=>computeFlatGeometry(graphs[name],1e-6);
function workspaceGeometry(name:string){
 const source=graphs[name],points=source.vertices_coords;
 const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
 const width=Math.max(...points.map(p=>p[0]))-minX,height=Math.max(...points.map(p=>p[1]))-minY;
 const scale=200/Math.max(width,height);
 const vertices_coords=points.map(([x,y])=>[(x-minX)*scale,(y-minY)*scale] as Point);
 const faces_vertices=source.faces_vertices!.map(face=>polygonArea(face.map(v=>vertices_coords[v]))<0?
  [...face].reverse():[...face]);
 const graph={...source,vertices_coords,faces_vertices};
 return computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
}
const doc=(g:FoldGraph):Doc=>({name:'saved concave',paper:{width:10,height:10},segments:g.edges_vertices.map(([a,b],i)=>({id:String(i),a:g.vertices_coords[a],b:g.vertices_coords[b],assignment:g.edges_assignment[i],angle:g.edges_assignment[i]==='M'?-180:g.edges_assignment[i]==='V'?180:0}))});
function twoSheets():FoldGraph{
 const vertices_coords:Point[]=[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[.5,2],[3.5,2],[3.5,2.5],[.5,2.5]],faces_vertices=[[0,1,2,3,4,5,6,7],[8,9,10,11]],edges_vertices=faces_vertices.flatMap(f=>f.map((v,i)=>[v,f[(i+1)%f.length]] as [number,number]));
 return {vertices_coords,faces_vertices,edges_vertices,edges_assignment:edges_vertices.map(()=>'B'),edges_foldAngle:edges_vertices.map(()=>0)} as FoldGraph;
}

test('three saved cyclic P03 pairs solve on ORIGINAL faces in both input and reanalysis paths',()=>{
 for(const name of ['3042','3045','3048']){
  const input=geometry(name),before=structuredClone(input),result=recomputeFlatLayers(input);
  assert.equal(input.geometry.status,'ready');assert.equal(result.layers.status,'solved',result.layers.message);assert.equal(result.layers.solutionCountExact,'1');assert.equal(result.layers.solutionCount,1);assert.equal(result.layers.solutionIndex,0);assert.equal(result.layers.faceOrder,undefined);
  assert.deepEqual(input,before);assert.deepEqual(result.geometry,input.geometry);
  const analysis=modelOverlapRegions(result);for(const side of ['front','back'] as const)assert.ok(modelRegionLayers(result,analysis,side).every(r=>r.layers.status==='ordered'));
  assert.ok(result.layers.faceOrders!.every(([a,b])=>a<result.geometry.faces.length&&b<result.geometry.faces.length));
  const original=computeFlatFold(doc(graphs[name]));assert.equal(original.layers.status,'solved',original.layers.message);assert.equal(original.layers.solutionCountExact,'1');
  const beyond=recomputeFlatLayers(input,{solutionIndex:1});assert.equal(beyond.layers.status,'error');assert.equal(beyond.layers.solutionCountExact,'1');assert.equal(beyond.layers.faceOrders,undefined);
 }
});
test('P37 patch6 and patch8 have unique ORIGINAL-face orders and both viewing sides are ordered',()=>{
 for(const [name,faceCount,relationCount] of [['3182',17,64],['3186',35,147]] as const){
  const source=workspaceGeometry(name),before=structuredClone(source),result=recomputeFlatLayers(source);
  assert.equal(source.geometry.status,'ready');assert.equal(result.geometry.faces.length,faceCount);
  assert.equal(result.layers.status,'solved',result.layers.message);
  assert.equal(result.layers.solutionCountExact,'1');assert.equal(result.layers.solutionCount,1);
  assert.equal(result.layers.faceOrders?.length,relationCount);
  assert.deepEqual(source,before);assert.deepEqual(result.geometry,source.geometry);
  assert.ok(result.layers.faceOrders!.every(([a,b])=>a<faceCount&&b<faceCount));
  const regions=modelOverlapRegions(result);
  for(const side of ['front','back'] as const)
   assert.ok(modelRegionLayers(result,regions,side).every(r=>r.layers.status==='ordered'));
  const beyond=recomputeFlatLayers(source,{solutionIndex:1});
  assert.equal(beyond.layers.status,'error');assert.equal(beyond.layers.solutionCountExact,'1');
 }
});
test('P37 original-face solutions do not depend on face start vertices or layer tolerance',()=>{
 for(const name of ['3182','3186']){
  const folded=workspaceGeometry(name).geometry.graph!;
  let reference:string|undefined;
  for(const rotation of [0,1,2,3])for(const epsilon of [1e-6,1e-7,1e-8]){
   const graph={...folded,faces_vertices:folded.faces_vertices!.map(face=>{
    const n=rotation%face.length;return [...face.slice(n),...face.slice(0,n)];
   })};
   const answer=solveConcaveLayerOrders(graph,epsilon);
   assert.equal(answer.status,'complete',`${name} rotation=${rotation}, epsilon=${epsilon}: ${'message' in answer?answer.message:''}`);
   if(answer.status!=='complete')continue;
   assert.equal(answer.count,1n);
   const signature=JSON.stringify(answer.orders);
   if(reference===undefined)reference=signature;
   else assert.equal(signature,reference,`${name} original-face orders vary with triangulation`);
  }
 }
});
test('P37 alternate triangle geometry independently lifts the same original-face assignments',()=>{
 const alternative:typeof earcut=(flat,holes,dimensions=2)=>{
  const ordinary=earcut(flat,holes,dimensions);
  if(holes?.length||dimensions!==2)return ordinary;
  const points=Array.from({length:flat.length/2},(_,i)=>[flat[2*i],flat[2*i+1]] as Point);
  const area=polygonArea(points),sign=Math.sign(area);
  if(!sign||points.some((p,i)=>{
   const q=points[(i+1)%points.length],r=points[(i+2)%points.length];
   return sign*((q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]))< -1e-6;
  }))return ordinary;
  const order=Array.from({length:points.length},(_,i)=>i);
  if(sign<0)order.reverse();
  const triangles=Array.from({length:order.length-2},(_,i)=>[order[0],order[i+1],order[i+2]]);
  const graph={vertices_coords:points,faces_vertices:triangles};
  if(ear.graph.makeFacesPolygon(graph).some(p=>p.length!==3)||
    ear.graph.makeFacesPolygon(graph,1e-6).some(p=>p.length!==3))return ordinary;
  return triangles.flat();
 };
 const signature=(orders:[number,number,number][])=>JSON.stringify([...orders].sort((a,b)=>a[0]-b[0]||a[1]-b[1]));
 for(const name of ['3182','3186']){
  const folded=workspaceGeometry(name).geometry.graph!;
  const production=solveConcaveLayerOrders(folded,1e-6);
  assert.equal(production.status,'complete');if(production.status!=='complete')continue;
  const problem=makeQuotientExperiment(folded as ExperimentGraph,1e-6,0,alternative);
  assert.ok(ear.graph.makeFacesPolygon(problem.tri).every(p=>p.length===3));
  const independent=solveQuotientExperiment(problem,{maxNodes:50_000,maxSolutions:100});
  assert.equal(independent.count,1n);
  verifyQuotientLift(problem,independent.solutions[0]);
  assert.equal(signature(quotientFaceOrders(folded as ExperimentGraph,independent.solutions[0])),
    signature(production.orders!));
 }
});
test('U-face children never gain independent layer variables; mirrored original normals preserve both viewing orders',()=>{
 for(const mirror of [false,true]){
  const g=twoSheets();if(mirror)g.vertices_coords=g.vertices_coords.map(([x,y])=>[-x,y]);
  const normals=g.faces_vertices!.map(f=>Math.sign(polygonArea(f.map(v=>g.vertices_coords[v]))));
  for(const index of [0,1]){
   const result=solveConcaveLayerOrders(g,1e-7,index);assert.equal(result.status,'complete');if(result.status!=='complete')continue;
   assert.equal(result.count,2n);assert.equal(result.orders!.length,1);assert.deepEqual(flatLayerEdges(result.orders!,normals),index===0?[[1,0]]:[[0,1]]);
  }
 }
});
test('exact bigint counts and random access use compressed free leaves, including counts above safe integers',()=>{
 const count=1n<<100n,first=countOriginalLayerAssignments(100,[],0n),last=countOriginalLayerAssignments(100,[],count-1n),outside=countOriginalLayerAssignments(100,[],count);
 for(const result of [first,last,outside]){assert.equal(result.status,'complete');if(result.status==='complete'){assert.equal(result.count,count);assert.equal(result.nodes,1);}}
 if(first.status==='complete'&&last.status==='complete'&&outside.status==='complete'){assert.ok(first.selected!.slice(1).every(v=>v===1));assert.ok(last.selected!.slice(1).every(v=>v===-1));assert.equal(outside.selected,null);}
 const clauses=[[1,2],[-1,3],[-2,-3]],expected=new Set<string>();
 for(let mask=0;mask<64;mask++){const values=Array.from({length:6},(_,i)=>(mask>>i)&1?1:-1);if(clauses.every(c=>c.some(l=>values[Math.abs(l)-1]===(l>0?1:-1))))expected.add(values.join(','));}
 const actual=new Set<string>();for(let i=0;i<expected.size;i++){const result=countOriginalLayerAssignments(6,clauses,BigInt(i));assert.equal(result.status,'complete');if(result.status==='complete'){assert.equal(result.count,BigInt(expected.size));actual.add(Array.from(result.selected!.slice(1)).join(','));}}
 assert.deepEqual(actual,expected);
});
test('explicit search budgets remain unknown and invalid geometry never becomes no-solution',()=>{
 const budget=countOriginalLayerAssignments(2,[[1,2]],0n,1);assert.equal(budget.status,'unknown');assert.ok(!('count'in budget));
 const impossible=countOriginalLayerAssignments(1,[[1],[-1]]);assert.equal(impossible.status,'complete');if(impossible.status==='complete')assert.equal(impossible.count,0n);
 const faces=twoSheets();faces.faces_vertices=Array.from({length:37},()=>[0,1,2]);const tooMany=solveConcaveLayerOrders(faces,1e-7);assert.equal(tooMany.status,'unsupported');
 const constrained=recomputeFlatLayers(geometry(),{constraints:[{face:0,side:'white'}]});assert.equal(constrained.layers.status,'unsupported');assert.match(constrained.layers.message,/可见面约束/);assert.equal(constrained.layers.solutionCountExact,undefined);
});

test('valid concave geometry above the former face and triangle limits is fully solved',()=>{
 const graph:FoldGraph={vertices_coords:[],faces_vertices:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[]};
 for(let f=0;f<42;f++){
  const start=graph.vertices_coords.length,outline:Point[]=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]];
  graph.vertices_coords.push(...outline.map(([x,y])=>[x+f*5,y] as Point));
  const face=outline.map((_,i)=>start+i);graph.faces_vertices!.push(face);
  for(let i=0;i<face.length;i++){graph.edges_vertices.push([face[i],face[(i+1)%face.length]]);graph.edges_assignment.push('B');graph.edges_foldAngle.push(0);}
 }
 const before=structuredClone(graph),answer=solveConcaveLayerOrders(graph,1e-7);
 assert.equal(answer.status,'complete');if(answer.status==='complete'){assert.equal(answer.count,1n);assert.deepEqual(answer.orders,[]);}
 assert.deepEqual(graph,before);
});

test('default search continues beyond 50000 nodes and old variable/clause limits with exact counts',()=>{
 const clauses=Array.from({length:15},(_,i)=>[2*i+1,2*i+2]);
 const result=countOriginalLayerAssignments(30,clauses);
 assert.equal(result.status,'complete');if(result.status==='complete'){assert.ok(result.nodes>50_000);assert.equal(result.count,3n**15n);assert.ok(result.selected!.slice(1).every(v=>v===1));}
 const large=countOriginalLayerAssignments(600,Array.from({length:3300},(_,i)=>[i%600+1]));
 assert.equal(large.status,'complete');if(large.status==='complete')assert.equal(large.count,1n);
 for(const invalid of [0,-1,NaN,-Infinity,1.5])assert.throws(()=>countOriginalLayerAssignments(1,[],0n,invalid),/输入无效/);
});
test('self crossings, self contacts and degeneracy stay unsupported',()=>{
 for(const polygon of [[[0,0],[2,2],[0,2],[2,0]],[[0,0],[3,0],[3,3],[1,0],[0,3]],[[0,0],[1,0],[2,0]]] as Point[][])assert.equal(isSimpleLayerPolygon(polygon,1e-7),false);
 const g=twoSheets();g.vertices_coords[1]=[...g.vertices_coords[0]];
 const result=solveConcaveLayerOrders(g,1e-7);assert.equal(result.status,'unsupported');
});
test('existing Worker dispatch solves concave reanalysis and cancellation/timeout discard its late complete result',async()=>{
 const scope=globalThis as unknown as {onmessage?:(event:{data:FlatWorkerRequest})=>void;postMessage?:(data:{type:string;result:FlatFoldResult})=>void},handler=scope.onmessage,post=scope.postMessage;
 const messages:{type:string;result:FlatFoldResult}[]=[];
 try{scope.postMessage=data=>messages.push(data);await import('../../src/workers/flatFold.worker');scope.onmessage!({data:{kind:'layers',result:geometry()}});assert.equal(messages[0].result.layers.status,'solved');}finally{scope.onmessage=handler;scope.postMessage=post;}
 const Native=globalThis.Worker;let latest:any;
 class MockWorker {onmessage?: (event:{data:unknown})=>void;stopped=false;constructor(){latest=this;}postMessage(){}terminate(){this.stopped=true;}}
 globalThis.Worker=MockWorker as unknown as typeof Worker;
 try{
  for(const mode of ['cancelled','timeout']){
   const input=geometry(),task=startFlatLayerReanalysis(input,{timeoutMs:10}),worker=latest;if(mode==='cancelled')task.cancel();const reply=await task.promise;
   worker.onmessage?.({data:messages[0]});assert.equal(reply.layers.status,mode);assert.equal(reply.layers.faceOrders,undefined);assert.equal(reply.layers.solutionCountExact,undefined);assert.deepEqual(reply.geometry,input.geometry);assert.equal(worker.stopped,true);
  }
 }finally{globalThis.Worker=Native;}
});
