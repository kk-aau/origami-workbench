import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult} from '../../src/core/types';
import {startModelComparisonExport} from '../../src/app/modelComparisonExportTask';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelShadowBoundaries} from '../../src/app/modelShadowBoundaries';
import {foldedModelComparisonSVG} from '../../src/app/foldedModelComparisonSVG';
import type {ModelShadowReply} from '../../src/app/modelShadowTask';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import {flatFoldPublication} from '../../src/app/flatFoldPublication';
import {flatExactProof,rememberFlatExactProof} from '../../src/app/flatExactProof';
import {rememberCompletedModelSurface} from '../../src/app/modelOverlapTask';
function model():FlatFoldResult{return {geometry:{status:'ready',message:'',vertices:[[0,0],[100,0],[100,100],[0,100],[50,0],[150,0],[150,100],[50,100]],faces:[[0,1,2,3],[4,5,6,7]]},layers:{status:'solved',message:'ok',faceOrder:[0,1],faceOrders:[[0,1,1]]},warnings:[]};}

test('exact front/back comparison export reuses certified cache and freezes input before caller edits',async()=>{
 const doc=blankDoc('缓存导出',16,16);for(let i=1;i<16;i++)doc.segments.push({id:`x${i}`,a:[i,0],b:[i,16],assignment:'F',angle:0},{id:`y${i}`,a:[0,i],b:[16,i],assignment:'F',angle:0});
 const input=computeFlatFold(doc),proof=flatExactProof(input)!;delete input.layers.faceOrder;rememberFlatExactProof(input,proof);
 const publication=flatFoldPublication(input);assert.ok(publication.surface?.status==='complete'&&publication.surface.exact);rememberCompletedModelSurface(input,publication.surface);
 const Native=globalThis.Worker;let made=0;globalThis.Worker=class{constructor(){made++;throw Error('cached export must not start another worker');}} as unknown as typeof Worker;
 try{
  const task=startModelComparisonExport(input,'冻结缓存',{...defaultModelView(),layout:'four',shadows:true},1000);
  input.geometry.vertices[0][0]+=99;input.layers.faceOrders!.push([0,1,1]);
  const reply=await task.promise;assert.equal(reply.status,'complete',reply.status==='complete'?'':reply.message);assert.equal(made,0);
  if(reply.status==='complete'){assert.match(reply.svg,/data-pane="front-solid"/);assert.match(reply.svg,/data-pane="back-solid"/);}
 }finally{globalThis.Worker=Native;}
});

test('explicit export deadline cancels a shared surface worker without publishing partial panes',async()=>{
 const Native=globalThis.Worker;let stopped=0;globalThis.Worker=class{postMessage(){}terminate(){stopped++;}} as unknown as typeof Worker;
 try{const input=model();delete input.layers.faceOrder;const reply=await startModelComparisonExport(input,'有限导出',{...defaultModelView(),layout:'both'},15).promise;assert.equal(reply.status,'timeout');assert.equal(stopped,1);assert.ok(!('svg' in reply));}finally{globalThis.Worker=Native;}
});
test('comparison export snapshots geometry, layout, angle, palette and shadows before worker runs',async()=>{
 const input=model(),before=structuredClone(input),view={...defaultModelView(),layout:'four' as const,rotation:22.5,shadows:true,colors:{front:'#112233',back:'#445566',line:'#778899'}},saved=structuredClone(view),sides:string[]=[];
 const job=startModelComparisonExport(input,'组合',view,1200,(result,side,rotation,budget)=>{
  assert.deepEqual(result,before);assert.equal(rotation,22.5);assert.equal(budget,1200);sides.push(side);
  return {promise:Promise.resolve({status:'complete',analysis:modelShadowBoundaries(result,side,rotation)}),cancel(){}};
 });
 input.geometry.vertices[0][0]=999;view.rotation=180;view.shadows=false;view.colors.front='#ffffff';
 const reply=await job.promise;assert.deepEqual(sides,['front','back']);assert.equal(reply.status,'complete');
 if(reply.status==='complete')assert.equal(reply.svg,foldedModelComparisonSVG(before,'组合',saved,{'front-solid':modelShadowBoundaries(before,'front',22.5),'back-solid':modelShadowBoundaries(before,'back',22.5)}));
});
test('comparison immediate cancellation starts no worker; transparency skips unnecessary analysis',async()=>{
 let calls=0;const fail=()=>{calls++;throw Error('unexpected worker');},view={...defaultModelView(),layout:'both' as const,shadows:true};
 const job=startModelComparisonExport(model(),'取消',view,1000,fail);job.cancel();assert.equal((await job.promise).status,'cancelled');assert.equal(calls,0);
 const output=await startModelComparisonExport(model(),'X光',{...view,xray:true},1000,fail).promise;
 assert.equal(output.status,'complete');assert.equal(calls,0);
});
test('comparison cancellation terminates active shadow work and rejects late success',async()=>{
 let entered!:()=>void,resolve!:(reply:ModelShadowReply)=>void,stopped=0,calls=0;
 const waiting=new Promise<void>(r=>entered=r),job=startModelComparisonExport(model(),'取消',{...defaultModelView(),layout:'four',shadows:true},1000,(result,side,rotation)=>{
  calls++;entered();return {promise:new Promise<ModelShadowReply>(r=>resolve=r),cancel(){stopped++;resolve({status:'complete',analysis:modelShadowBoundaries(result,side,rotation)});}};
 });
 await waiting;job.cancel();assert.equal((await job.promise).status,'cancelled');assert.equal(calls,1);assert.equal(stopped,1);
});
test('comparison shadow errors never return partial SVG and validate budgets before work',async()=>{
 const input=model(),view={...defaultModelView(),layout:'four' as const,shadows:true};
 for(const status of ['timeout','error'] as const){let calls=0;const reply=await startModelComparisonExport(input,'失败',view,1000,(result,side,rotation)=>({promise:Promise.resolve(++calls===1?{status:'complete',analysis:modelShadowBoundaries(result,side,rotation)}:{status,message:'测试失败'}),cancel(){}})).promise;
  assert.equal(reply.status,status);assert.ok(!('svg' in reply));assert.equal(calls,2);
 }
 for(const budget of [NaN,0,-1,-Infinity])assert.throws(()=>startModelComparisonExport(input,'时限',view,budget),/时限/);
});
