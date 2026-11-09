import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeModelSurface} from '../../src/app/modelSurfaceAnalysis';
import {startModelOverlapAnalysis,type ModelOverlapProgress} from '../../src/app/modelOverlapTask';
import type {FlatFoldResult} from '../../src/core/types';

const thin=(width:number):FlatFoldResult=>({geometry:{status:'ready',message:'',vertices:[[0,0],[width,0],[width,10],[0,10]],faces:[[0,1,2,3]]},layers:{status:'solved',message:'',faceOrders:[]},warnings:[]});
test('surface work uses a complete exact fallback for thin paper and uncertain contours',()=>{
 for(const width of [5e-9,1e-7]){
  const input=thin(width),before=structuredClone(input),progress:ModelOverlapProgress[]=[];
  const reply=computeModelSurface({result:input,side:'front',bothSides:true,shadows:false},p=>progress.push(p));
  assert.equal(reply.status,'complete');assert.ok(progress.some(p=>p.pass>1));
  if(reply.status==='complete'){
   assert.ok(reply.exact);assert.equal(reply.exactAnalysis!.cellCount,1);assert.equal(reply.exactAnalysis!.verifiedCells,1);
   assert.equal(reply.exact.sourceEdgeIds.length,4);assert.equal(reply.exact.side,'front');
   assert.ok(reply.opposite&&'exact' in reply.opposite);assert.equal(reply.opposite.exact.sourceEdgeIds.length,4);assert.equal(reply.opposite.exact.side,'back');
  }
  assert.deepEqual(input,before);
 }
});
test('missing layer relationships end as a truthful error instead of partial success or an endless identical retry',()=>{
 const input=thin(10);input.geometry.faces.push([0,1,2,3]);const before=structuredClone(input),progress:ModelOverlapProgress[]=[];
 const reply=computeModelSurface({result:input,side:'front'},p=>progress.push(p));
 assert.equal(reply.status,'error');if(reply.status==='error')assert.match(reply.message,/层序关系.*未发布不完整纸面/);
 const passes=new Set(progress.filter(p=>p.stage==='coverage').map(p=>p.pass));assert.deepEqual([...passes],[1,2],'one exact verification is permitted; no repeated precision search');
 assert.equal(progress.some(p=>p.stage==='boundaries'),false,'do not compute expensive incomplete contours after a failed layer certificate');
 assert.deepEqual(input,before);
});
test('ordinary complete surfaces retain the legacy lightweight representation',()=>{
 const reply=computeModelSurface({result:thin(10),side:'front',shadows:false});assert.equal(reply.status,'complete');
 if(reply.status==='complete'){assert.equal(reply.exact,undefined);assert.equal(reply.analysis!.omittedThinRegions,0);assert.equal(reply.regions!.length,1);}
});
test('exact fallback supports a concave selected face without running the convex solver',()=>{
 const input=thin(5e-9);input.geometry.vertices=[[0,0],[5e-9,0],[5e-9,4],[2.5e-9,4],[2.5e-9,10],[0,10]];input.geometry.faces=[[0,1,2,3,4,5]];
 const before=structuredClone(input),reply=computeModelSurface({result:input,side:'back',bothSides:true});assert.equal(reply.status,'complete');
 if(reply.status==='complete'){assert.ok(reply.exact);assert.equal(reply.exact.side,'back');assert.equal(reply.exactAnalysis!.verifiedCells,reply.exactAnalysis!.cellCount);}
 assert.deepEqual(input,before);
});
test('strict fallback refuses to supplement missing comparisons of the selected solution',()=>{
 const input=thin(5e-9);input.geometry.faces.push([0,1,2,3],[0,1,2,3]);input.layers.faceOrders=[[0,1,1],[1,2,1]];
 const before=structuredClone(input),reply=computeModelSurface({result:input,side:'front'});assert.equal(reply.status,'error');
 if(reply.status==='error')assert.match(reply.message,/不会自动替换当前选中解/);assert.deepEqual(input,before);
});
test('strict fallback reports a selected local cycle without searching for a replacement',()=>{
 const input=thin(5e-9);input.geometry.faces.push([0,1,2,3],[0,1,2,3]);input.layers.faceOrders=[[0,1,1],[1,2,1],[0,2,-1]];
 const before=structuredClone(input),reply=computeModelSurface({result:input,side:'front'});assert.equal(reply.status,'error');
 if(reply.status==='error')assert.match(reply.message,/局部循环.*不会自动替换当前选中解/);assert.deepEqual(input,before);
});
test('an unresolved layer computation cannot become a completed paper surface',()=>{
 const input=thin(10);input.layers.status='unknown';const reply=computeModelSurface({result:input,side:'front'});assert.equal(reply.status,'error');
});
test('worker progress never settles a surface job and cancellation still terminates it',async()=>{
 const saved=globalThis.Worker;let worker:any;
 globalThis.Worker=class{onmessage:any;stops=0;constructor(){worker=this;}postMessage(){}terminate(){this.stops++;}} as any;
 try{
  const job=startModelOverlapAnalysis(thin(10),Infinity,'front');let settled=false;void job.promise.then(()=>{settled=true;});
  worker.onmessage({data:{type:'progress',progress:{stage:'coverage',pass:2,epsilon:1e-10}}});await Promise.resolve();
  assert.equal(settled,false);assert.equal(worker.stops,0);job.cancel();assert.equal((await job.promise).status,'cancelled');assert.equal(worker.stops,1);
 }finally{globalThis.Worker=saved;}
});
