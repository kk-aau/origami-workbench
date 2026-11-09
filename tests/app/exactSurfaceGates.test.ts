import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult} from '../../src/core/types';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';
import {completeExactSurface} from '../../src/app/completeExactSurface';
import {flatExactProof,rememberFlatExactProof,type FlatExactProof} from '../../src/app/flatExactProof';
import {exactSurfaceIssue} from '../../src/app/modelExactSurfaceData';
import {hasCompleteModelSurface} from '../../src/app/modelRenderMode';
import {acquireModelSurface,copyCompletedModelSurface,rememberCompletedModelSurface,startModelOverlapAnalysis,type ModelOverlapReply,type ModelOverlapRequest} from '../../src/app/modelOverlapTask';

function fixture(){
 const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices:[[0,0],[10,0],[10,10],[0,10],[2,2],[8,2],[8,8],[2,8]],faces:[[0,1,2,3],[4,5,6,7]]},layers:{status:'solved',message:'',faceOrders:[[0,1,1]],faceOrder:[1,0],solutionIndex:0},warnings:[]};
 const topology=buildExactModelTopology(result),top=new Int32Array(topology.cellCount),bottom=top.slice(),depth=new Uint32Array(topology.cellCount);
 walkExactCoverage(topology,{onCell(cell,faces){const ids=[...faces].sort((a,b)=>a-b);top[cell]=ids[0]??-1;bottom[cell]=ids.at(-1)??-1;depth[cell]=ids.length;}});
 const proof:FlatExactProof={topology,certificate:{top,bottom,depth,verifiedCells:topology.cellCount}};
 return {result,proof,reply:completeExactSurface(result,proof,{bothSides:true})};
}
class FakeWorker{
 static workers:FakeWorker[]=[];request?:ModelOverlapRequest;stops=0;onmessage?: (event:{data:ModelOverlapReply})=>void;
 constructor(){FakeWorker.workers.push(this);}postMessage(request:ModelOverlapRequest){this.request=structuredClone(request);}terminate(){this.stops++;}
}
async function workers(run:()=>Promise<void>){const previous=globalThis.Worker;FakeWorker.workers=[];globalThis.Worker=FakeWorker as unknown as typeof Worker;try{await run();}finally{globalThis.Worker=previous;}}

test('proof cache invalidates value edits, status changes and changed selected-solution metadata',()=>{
 const edits:((result:FlatFoldResult)=>void)[]=[r=>{r.layers.faceOrders![0][2]=-1;},r=>{r.layers.solutionIndex=1;},r=>{r.layers.status='no-solution';},r=>{r.layers.faceOrder!.reverse();},r=>{r.geometry.vertices[0][0]=.1;},r=>{r.layers.constraints=[];}];
 for(const edit of edits){const {result,proof}=fixture();rememberFlatExactProof(result,proof);assert.ok(flatExactProof(result));edit(result);assert.equal(flatExactProof(result),undefined);}
 const {result,proof}=fixture();assert.throws(()=>rememberFlatExactProof(result,{...proof,certificate:{...proof.certificate,verifiedCells:0}}),/不一致/);
});
test('exact completeness rejects fabricated contours, impossible depth and invalid shadows',()=>{
 const {result,reply}=fixture();assert.equal(exactSurfaceIssue(reply,result),null);
 const depth=structuredClone(reply);depth.exactAnalysis.maxDepth=0;assert.match(exactSurfaceIssue(depth,result)!,/认证/);
 const ring=structuredClone(reply);ring.exact.ringVertices[1]=ring.exact.ringVertices[3];assert.match(exactSurfaceIssue(ring,result)!,/边|轮廓/);
 const edge=structuredClone(reply);edge.exact.boundaryVertices[1]=edge.exact.boundaryVertices[0];assert.match(exactSurfaceIssue(edge,result)!,/边界/);
 const provenance=structuredClone(reply);provenance.exact.sourceLineIds=new Uint32Array(0);assert.match(exactSurfaceIssue(provenance,result)!,/数量/);
 const shadow=structuredClone(reply.opposite!);shadow.exact.shadows!.strips[0].inward=[NaN,0];assert.match(exactSurfaceIssue(shadow,result)!,/阴影/);
 assert.equal(hasCompleteModelSurface({...reply,status:'error'}),false);
});
test('worker validates requested exact side, opposite side and shared certificate statistics',()=>workers(async()=>{
 for(const side of ['front','back'] as const){const {result,proof}=fixture(),task=startModelOverlapAnalysis(result,Infinity,side,{bothSides:true});FakeWorker.workers.at(-1)!.onmessage!({data:completeExactSurface(result,proof,{side:side==='front'?'back':'front',bothSides:true})});assert.equal((await task.promise).status,'error');}
 for(const mutate of [(reply:ReturnType<typeof fixture>['reply'])=>{reply.opposite!.exact.side='front';},(reply:ReturnType<typeof fixture>['reply'])=>{reply.opposite!.exactAnalysis={...reply.opposite!.exactAnalysis,maxDepth:1};},(reply:ReturnType<typeof fixture>['reply'])=>{delete reply.opposite!.exact.shadows;}]){
  const {result,reply}=fixture();mutate(reply);const task=startModelOverlapAnalysis(result,Infinity,'front',{bothSides:true});FakeWorker.workers.at(-1)!.onmessage!({data:reply});assert.equal((await task.promise).status,'error');
 }
}));
test('completed cache normalizes a back-first reply and returns the requested side',()=>workers(async()=>{
 const {result,proof}=fixture(),before=structuredClone(result);rememberCompletedModelSurface(result,completeExactSurface(result,proof,{side:'back',bothSides:true}));
 for(const side of ['front','back'] as const){const reply=await acquireModelSurface(result,side,true).promise;assert.equal(reply.status,'complete');if(reply.status==='complete')assert.equal(reply.exact!.side,side);}
 assert.equal(FakeWorker.workers.length,0);assert.deepEqual(result,before);
}));
test('history clone reuses only an equal completed snapshot without persisting surface data',()=>workers(async()=>{
 const {result,reply}=fixture();rememberCompletedModelSurface(result,reply);const clone=structuredClone(result);copyCompletedModelSurface(result,clone);
 assert.equal((await acquireModelSurface(clone,'back',true).promise).status,'complete');assert.equal(FakeWorker.workers.length,0);assert.deepEqual(clone,result);
 result.layers.faceOrders![0][2]=-1;assert.equal((await acquireModelSurface(clone,'front',true).promise).status,'complete');assert.equal(FakeWorker.workers.length,0);
 const changed=acquireModelSurface(result,'front',true);assert.equal(FakeWorker.workers.length,1);changed.cancel();assert.equal((await changed.promise).status,'cancelled');
 const mismatch=structuredClone(clone);mismatch.layers.solutionIndex=1;copyCompletedModelSurface(clone,mismatch);const task=acquireModelSurface(mismatch,'front',true);assert.equal(FakeWorker.workers.length,2);task.cancel();assert.equal((await task.promise).status,'cancelled');
}));
test('a selected-relation edit during a worker calculation cannot publish the old surface',()=>workers(async()=>{
 const {result,reply}=fixture(),task=startModelOverlapAnalysis(result,Infinity,'front',{bothSides:true});result.layers.faceOrders![0][2]=-1;
 FakeWorker.workers.at(-1)!.onmessage!({data:reply});const rejected=await task.promise;assert.equal(rejected.status,'error');if(rejected.status==='error')assert.match(rejected.message,/选中层序.*改变/);assert.equal(result.layers.faceOrders![0][2],-1);
}));
