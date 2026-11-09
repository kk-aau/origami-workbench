import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startLayerBatch} from '../../src/app/layerBatch';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import type {FlatFoldResult} from '../../src/core/types';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import type {ModelOverlapReply} from '../../src/app/modelOverlapTask';
function model(){const doc=blankDoc('批量局部',100,100);for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});return computeFlatFold(doc);}
function solve(source:FlatFoldResult,options:{solutionIndex:number}){const result=recomputeFlatLayers(source,options);delete result.layers.faceOrder;return {promise:Promise.resolve(result),cancel(){}};}
function surface(result:FlatFoldResult,side:'front'|'back'){
 const analysis=modelOverlapRegions(result),regions=modelRegionLayers(result,analysis,side);
 return {analysis,regions,boundaries:modelRegionBoundaries(result,regions)};
}
test('batch computes each candidate local surface with frozen side, rotation and palette',async()=>{
 const input=model(),before=structuredClone(input),seen:number[]=[],options={name:'批次',side:'back' as const,rotation:22.5,colors:{front:'#112233',back:'#445566',line:'#778899'},shadows:true,startIndex:0,count:2,timeoutMs:700},saved=structuredClone(options);
 const task=startLayerBatch(input,options,solve,()=>{throw Error('no global shadows for local order');},(result,budget,side)=>{assert.equal(budget,700);assert.equal(side,'back');seen.push(result.layers.solutionIndex!);return {promise:Promise.resolve({status:'complete',...surface(result,side!),shadows:{strips:[],ambiguousEdges:0}}),cancel(){}};});
 options.side='front' as 'back';options.rotation=90;options.colors.front='#ffffff';const output=await task.promise;assert.equal(output.status,'completed');assert.deepEqual(seen,[0,1]);assert.deepEqual(input,before);
 for(const item of output.items){const r=await solve(input,{solutionIndex:item.index}).promise,{analysis,regions,boundaries}=surface(r,'back');assert.equal(item.svg,foldedModelSVG(r,{...saved,shadows:undefined,regions:{regions,boundaries,omittedThinRegions:analysis.omittedThinRegions,shadows:{strips:[],ambiguousEdges:0}}}));assert.match(item.svg,/data-model-region-surface/);assert.match(item.svg,/data-region-boundary/);assert.match(item.svg,/局部阴影 0 处/);}
});
test('local batch skips opaque analysis for X-ray and wire, and preserves completed items on region failure',async()=>{
 for(const style of [{xray:true},{displayStyle:'wire' as const}]){const reply=await startLayerBatch(model(),{name:'跳过',side:'front',startIndex:0,count:1,...style},solve,undefined,()=>{throw Error('unexpected worker');}).promise;assert.equal(reply.status,'completed');assert.doesNotMatch(reply.items[0].svg,/data-model-region-surface/);}
 for(const failure of ['timeout','error','incomplete','missing-edges'] as const){let calls=0;const reply=await startLayerBatch(model(),{name:'失败',side:'front',startIndex:0,count:3},solve,undefined,(r,_budget,side)=>{const analysis=modelOverlapRegions(r);calls++;const response:ModelOverlapReply=calls===1?{status:'complete',...surface(r,side!)}:failure==='incomplete'?{status:'complete',analysis}:failure==='missing-edges'?{status:'complete',analysis,regions:modelRegionLayers(r,analysis,side!)}:{status:failure,message:'test'};return {promise:Promise.resolve(response),cancel(){}};}).promise;assert.equal(reply.status,failure==='timeout'?'timeout':'error');assert.deepEqual(reply.items.map(i=>i.index),[0]);assert.equal(calls,2);}
});
test('missing visible boundaries cannot produce or report a completed solid batch item',async()=>{
 for(const side of ['front','back'] as const){
  let progress=0;
  const reply=await startLayerBatch(model(),{name:'缺失边线',side,startIndex:0,count:2,onProgress:()=>progress++},solve,undefined,(result,_budget,direction)=>{
   const analysis=modelOverlapRegions(result),regions=modelRegionLayers(result,analysis,direction!);
   return {promise:Promise.resolve({status:'complete',analysis,regions}),cancel(){}};
  }).promise;
  assert.equal(reply.status,'error');assert.match(reply.message,/可见边线/);assert.deepEqual(reply.items,[]);assert.equal(progress,0);
 }
});
test('local batch cancellation terminates active work and ignores its late complete response',async()=>{
 let enter!:()=>void,resolve!:(r:ModelOverlapReply)=>void,stops=0;const entered=new Promise<void>(r=>enter=r);
 const task=startLayerBatch(model(),{name:'取消',side:'front',startIndex:0,count:2},solve,undefined,(r,_budget,side)=>{const reply:ModelOverlapReply={status:'complete',...surface(r,side!)};enter();return {promise:new Promise<ModelOverlapReply>(r=>resolve=r),cancel(){stops++;resolve(reply);}};});
 await entered;task.cancel();const reply=await task.promise;assert.equal(stops,1);assert.equal(reply.status,'cancelled');assert.equal(reply.items.length,0);
});

test('batch local surfaces inherit unlimited defaults and preserve an explicitly chosen finite deadline',async()=>{
 for(const timeoutMs of [undefined,Infinity,250]){
  const output=await startLayerBatch(model(),{name:'完整遮挡',side:'front',startIndex:0,count:1,timeoutMs},solve,undefined,(result,budget,side)=>{
   assert.equal(budget,timeoutMs??Infinity);return {promise:Promise.resolve({status:'complete',...surface(result,side!)}),cancel(){}};
  }).promise;
  assert.equal(output.status,'completed');assert.equal(output.items.length,1);
 }
});
