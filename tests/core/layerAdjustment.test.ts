import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {selectAdjustedLayerSolution} from '../../src/core/layerAdjustment';
import type {LayerNode} from '../../src/core/layerSolutions';
import type {FlatLayerAdjustment,FlatFoldResult,FlatWorkerRequest,Point} from '../../src/core/types';
import {startFlatLayerReanalysis} from '../../src/core/workerClient';

function fixture(mark=false){
  const doc=blankDoc('四种合法层序',100,100);
  for(let x=20;x<100;x+=20)doc.segments.push({id:`fold-${x}`,a:[x,0],b:[x,100],assignment:'V',angle:180});
  if(mark)doc.segments.push({id:'finite-mark',a:[2,10],b:[10,10],assignment:'F',angle:0});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.layers.status,'solved',result.layers.message);assert.equal(result.layers.solutionCountExact,'4');
  return {doc,result};
}
const position=(result:FlatFoldResult,face:number,side:'front'|'back')=>{
  const index=result.layers.faceOrder!.indexOf(face);return side==='front'?index:result.geometry.faces.length-1-index;
};
const adjust=(result:FlatFoldResult,face:number,direction:FlatLayerAdjustment['direction'],side:FlatLayerAdjustment['side']='front')=>recomputeFlatLayers(result,{solutionIndex:result.layers.solutionIndex,layerAdjustment:{face,direction,side}});

test('up and down select the nearest reachable peer rank from every real candidate on either viewing side',()=>{
  const {result}=fixture(),all=Array.from({length:4},(_,solutionIndex)=>recomputeFlatLayers(result,{solutionIndex}));
  for(const side of ['front','back'] as const)for(const base of all)for(let face=0;face<5;face++)for(const direction of ['up','down'] as const){
    const before=structuredClone(base),current=position(base,face,side),candidates=all.map(candidate=>position(candidate,face,side));
    const better=candidates.filter(rank=>direction==='up'?rank>current:rank<current),expected=better.length?(direction==='up'?Math.min(...better):Math.max(...better)):current;
    const changed=adjust(base,face,direction,side);
    assert.equal(changed.layers.status,'solved',changed.layers.message);assert.equal(position(changed,face,side),expected);
    assert.deepEqual(changed.geometry.vertices,base.geometry.vertices);assert.deepEqual(changed.geometry.faces,base.geometry.faces);assert.deepEqual(base,before);
    const canonical=recomputeFlatLayers(base,{solutionIndex:changed.layers.solutionIndex});
    assert.deepEqual(changed.layers.faceOrders,canonical.layers.faceOrders,'selected order is an actual deterministic engine candidate');
  }
});

test('top and bottom reach legal extremes and report an already reached extreme without inventing a new order',()=>{
  const {result}=fixture(),all=Array.from({length:4},(_,solutionIndex)=>recomputeFlatLayers(result,{solutionIndex}));
  for(const side of ['front','back'] as const)for(let face=0;face<5;face++)for(const direction of ['top','bottom'] as const){
    const ranks=all.map(candidate=>position(candidate,face,side)),changed=adjust(result,face,direction,side);
    assert.equal(changed.layers.status,'solved');assert.equal(position(changed,face,side),direction==='top'?Math.max(...ranks):Math.min(...ranks));
    const again=adjust(changed,face,direction,side);
    assert.equal(again.layers.solutionIndex,changed.layers.solutionIndex);assert.deepEqual(again.layers.faceOrders,changed.layers.faceOrders);
    assert.match(again.layers.message,/已在有效解可达的最[上下]层/);
  }
  const imported=structuredClone(result);imported.geometry.modified=true;
  const limit=adjust(adjust(imported,0,'top'),0,'top');
  assert.match(limit.layers.message,/已在有效解可达的最上层/,'snapshot modified flag must not replace limit feedback with a generic model warning');
});

test('visible-colour filtering retains its filtered candidate numbering when a paper face is adjusted',()=>{
  const {result}=fixture(),constraints=[{face:1,side:'color' as const}],constrained=recomputeFlatLayers(result,{constraints});
  assert.equal(constrained.layers.solutionCountExact,'2');
  const changed=recomputeFlatLayers(constrained,{solutionIndex:0,constraints,layerAdjustment:{face:4,direction:'top',side:'front'}});
  assert.equal(changed.layers.status,'solved');assert.equal(changed.layers.solutionIndex,1);assert.equal(changed.layers.solutionCountExact,'2');
  assert.deepEqual(changed.layers.constraints,constraints);
  assert.deepEqual(changed.layers.faceOrders,recomputeFlatLayers(result,{constraints,solutionIndex:1}).layers.faceOrders);
});

test('finite F marks preserve public material identity while the corresponding original paper face moves among legal layers',()=>{
  const {result}=fixture(true),before=structuredClone(result),changed=adjust(result,4,'top');
  assert.equal(changed.layers.status,'solved',changed.layers.message);assert.notEqual(changed.layers.solutionIndex,0);
  assert.deepEqual(changed.geometry.vertices,result.geometry.vertices);assert.deepEqual(changed.geometry.faces,result.geometry.faces);
  assert.deepEqual(changed.geometry.graph!.edges_vertices,result.geometry.graph!.edges_vertices);
  assert.ok(changed.geometry.graph!.edges_assignment.includes('F'));assert.deepEqual(result,before);
  assert.deepEqual(changed.layers.faceOrders,recomputeFlatLayers(result,{solutionIndex:changed.layers.solutionIndex}).layers.faceOrders);
});

test('invalid requests, impossible colour constraints and unsupported concave faces never return a fabricated solved move',()=>{
  const {result}=fixture();
  for(const request of [{face:-1,direction:'up',side:'front'},{face:99,direction:'up',side:'front'},{face:0,direction:'sideways',side:'front'},{face:0,direction:'up',side:'left'},{face:.5,direction:'up',side:'front'}]){
    const answer=recomputeFlatLayers(result,{layerAdjustment:request as FlatLayerAdjustment});assert.equal(answer.layers.status,'error');assert.equal(answer.layers.faceOrders,undefined);
  }
  const impossible=recomputeFlatLayers(result,{constraints:[{face:0,side:'white'}],layerAdjustment:{face:0,direction:'up',side:'front'}});
  assert.equal(impossible.layers.status,'no-solution');assert.equal(impossible.layers.faceOrders,undefined);
  const points:Point[]=[[0,0],[100,0],[100,50],[50,50],[50,100],[0,100]],face=points.map((_,index)=>index);
  const concave:FlatFoldResult={geometry:{status:'ready',message:'',vertices:points,faces:[face],graph:{vertices_coords:points,faces_vertices:[face],edges_vertices:face.map((v,index)=>[v,face[(index+1)%face.length]]),edges_assignment:face.map(()=>'B'),edges_foldAngle:face.map(()=>0)}},layers:{status:'unknown',message:''},warnings:[]};
  const unsupported=recomputeFlatLayers(concave,{layerAdjustment:{face:0,direction:'up',side:'front'}});
  assert.equal(unsupported.layers.status,'unsupported');assert.match(unsupported.layers.message,/凹面/);assert.equal(unsupported.layers.faceOrders,undefined);
});

test('non-overlapping paper faces never pretend to move through an arbitrary global ordering',()=>{
  const points:Point[]=[[0,0],[10,0],[10,10],[0,10],[20,0],[30,0],[30,10],[20,10]],faces=[[0,1,2,3],[4,5,6,7]];
  const choice=selectAdjustedLayerSolution({orders:[],branches:[[{orders:[]},{orders:[]}]]},{vertices:points,faces,epsilon:1e-6,request:{face:0,direction:'top',side:'front'},solutionIndex:0,candidateLimit:1});
  assert.equal(choice.status,'solved');assert.equal(choice.solutionIndex,0);assert.match(choice.message,/没有面积重叠/);
});

test('bounded searches refuse unproven extremes or no-op claims, but can certify a truly adjacent peer move',()=>{
  const {result}=fixture(),tree=ear.layer(result.geometry.graph!) as unknown as LayerNode;
  const search={vertices:result.geometry.vertices,faces:result.geometry.faces,epsilon:1e-6,request:{face:0,direction:'bottom' as const,side:'front' as const},solutionIndex:0};
  const incomplete=selectAdjustedLayerSolution(tree,{...search,candidateLimit:1});
  assert.equal(incomplete.status,'unsupported');assert.equal(incomplete.orders,undefined);assert.match(incomplete.message,/尚未证实/);
  const incompleteTop=selectAdjustedLayerSolution(tree,{...search,solutionIndex:2,request:{...search.request,direction:'top'},candidateLimit:1});
  assert.equal(incompleteTop.status,'unsupported');assert.equal(incompleteTop.orders,undefined);
  const adjacent=selectAdjustedLayerSolution(tree,{...search,request:{...search.request,direction:'down'},candidateLimit:2});
  assert.equal(adjacent.status,'solved');assert.equal(adjacent.solutionIndex,1,'the known next peer rank proves a nearest move even with unvisited branches');
});

test('a real geometric extreme can be certified before a huge remaining solution tree is expanded',()=>{
  const vertices:Point[]=[[0,0],[10,0],[10,10],[0,10]],faces=[[0,1,2,3],[0,1,2,3]],tree:LayerNode={orders:[],branches:[[{orders:[[0,1,-1]]},{orders:[[0,1,1]]},{orders:[[0,1,1]]}]]};
  const answer=selectAdjustedLayerSolution(tree,{vertices,faces,epsilon:1e-6,request:{face:0,direction:'top',side:'front'},solutionIndex:0,candidateLimit:2});
  assert.equal(answer.status,'solved');assert.equal(answer.solutionIndex,1);assert.equal(answer.count,3n);
  const filtered=selectAdjustedLayerSolution(tree,{vertices,faces,epsilon:1e-6,request:{face:0,direction:'top',side:'front'},solutionIndex:0,candidateLimit:2,matches:()=>true});
  assert.equal(filtered.status,'solved');assert.equal(filtered.solutionIndex,1);assert.equal(filtered.count,undefined,'an unvisited constrained suffix cannot claim an exact filtered count');
});

test('manual adjustment searches beyond 100000 candidates without truncating ordinary or filtered ranks',()=>{
  const vertices:Point[]=[[0,0],[10,0],[10,10],[0,10]],faces=[[0,1,2,3],[0,1,2,3]],empty:LayerNode={orders:[]};
  const low:LayerNode={orders:[[0,1,-1]],branches:Array.from({length:17},()=>[empty,empty])};
  const tree:LayerNode={orders:[],branches:[[low,{orders:[[0,1,1]]}]]};
  const search={vertices,faces,epsilon:1e-6,request:{face:0,direction:'top' as const,side:'front' as const},solutionIndex:0};
  for(const matches of [undefined,()=>true]){
    const answer=selectAdjustedLayerSolution(tree,{...search,matches});
    assert.equal(answer.status,'solved',answer.message);assert.equal(answer.solutionIndex,131072);assert.equal(answer.count,131073n);assert.deepEqual(answer.orders,[[0,1,1]]);
  }
  for(const candidateLimit of [0,-1,NaN,-Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(selectAdjustedLayerSolution(tree,{...search,candidateLimit}).status,'error');
});

test('worker requests carry the face adjustment, candidate number and active constraints and remain cancellable',async()=>{
  class MockWorker {
    static latest:MockWorker;request?:FlatWorkerRequest;terminated=false;
    constructor(){MockWorker.latest=this;}
    postMessage(request:FlatWorkerRequest){this.request=request;}
    terminate(){this.terminated=true;}
  }
  const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{
    const {result}=fixture(),request={face:4,direction:'up',side:'back'} as const,constraints=[{face:1,side:'color' as const}];
    const task=startFlatLayerReanalysis(result,{solutionIndex:1,layerAdjustment:request,constraints}),worker=MockWorker.latest;
    assert.ok(worker.request&&'kind' in worker.request);assert.deepEqual(worker.request.options,{solutionIndex:1,layerAdjustment:request,constraints});
    task.cancel();assert.equal((await task.promise).layers.status,'cancelled');assert.equal(worker.terminated,true);
  }finally{globalThis.Worker=prior;}
});
