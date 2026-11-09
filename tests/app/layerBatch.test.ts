import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startLayerBatch} from '../../src/app/layerBatch';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import type {FlatFoldResult} from '../../src/core/types';
import {modelShadowBoundaries} from '../../src/app/modelShadowBoundaries';
import type {ModelShadowReply} from '../../src/app/modelShadowTask';

function model(){const doc=blankDoc('批量',100,100);for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});return computeFlatFold(doc);}
const real=(input:FlatFoldResult,options:{solutionIndex:number})=>({promise:Promise.resolve(recomputeFlatLayers(input,options)),cancel:()=>{}});

test('wire batch freezes style and skips shadow workers while keeping original assignments',async()=>{
 const options={name:'线框批次',side:'front' as const,startIndex:0,count:1,shadows:true,displayStyle:'wire' as 'paper'|'wire'};
 const task=startLayerBatch(model(),options,real,()=>{throw Error('unexpected shadow worker');});options.displayStyle='paper';
 const output=await task.promise;assert.equal(output.items.length,1);assert.ok(output.items[0].svg.includes('<line '));assert.ok(output.items[0].svg.includes('data-assignment="V"'));assert.ok(!output.items[0].svg.includes('<polygon'));assert.ok(!output.items[0].svg.includes('linearGradient'));
 assert.throws(()=>startLayerBatch(model(),{...options,displayStyle:'invalid' as 'wire'},real),/样式/);
});

test('batch freezes palette and rotation at start for every candidate',async()=>{
 const input=model(),before=structuredClone(input),colors={front:'#112233',back:'#445566',line:'#778899'},options={name:'配色批次',side:'back' as const,rotation:22.5,colors,startIndex:0,count:2};
 const task=startLayerBatch(input,options,real);
 options.rotation=90;colors.front='#ffffff';colors.line='#000000';
 const result=await task.promise;assert.equal(result.items.length,2);
 for(const item of result.items){
   const expected=foldedModelSVG(recomputeFlatLayers(input,{solutionIndex:item.index}),{name:'配色批次',side:'back',rotation:22.5,colors:{front:'#112233',back:'#445566',line:'#778899'}});
   assert.equal(item.svg,expected);
 }
 assert.deepEqual(input,before);
});
test('invalid batch appearance rejects before worker launch',()=>{
 let calls=0;const solve=()=>{calls++;throw Error('must not launch');};
 assert.throws(()=>startLayerBatch(model(),{name:'x',side:'front',rotation:NaN},solve),/角度/);
 assert.throws(()=>startLayerBatch(model(),{name:'x',side:'front',colors:{front:'red',back:'#ffffff',line:'#000000'}},solve),/RGB/);
 assert.equal(calls,0);
});

test('batch begins after current candidate and stops at real engine exhaustion',async()=>{
  const input=model(),before=structuredClone(input),progress:number[]=[];
  const result=await startLayerBatch(input,{name:'批量',side:'front',onProgress:p=>progress.push(p.completed)},real).promise;
  assert.equal(result.status,'exhausted');assert.deepEqual(result.items.map(i=>i.index),[1,2,3]);assert.deepEqual(progress,[1,2,3]);
  assert.equal(new Set(result.items.map(i=>i.svg)).size,3);assert.deepEqual(input,before);
});
test('explicit range can include first candidate and requested completion differs from exhaustion',async()=>{
  const result=await startLayerBatch(model(),{name:'前两解',side:'back',startIndex:0,count:2},real).promise;
  assert.equal(result.status,'completed');assert.deepEqual(result.items.map(i=>i.index),[0,1]);assert.ok(result.items[0].svg.includes('背面'));
});
test('immediate cancellation starts no worker',async()=>{
  let calls=0;const task=startLayerBatch(model(),{name:'取消',side:'front'},()=>{calls++;throw Error('unexpected');});task.cancel();
  assert.equal((await task.promise).status,'cancelled');assert.equal(calls,0);
});
test('cancel interrupts active task and keeps earlier completed images only',async()=>{
  let calls=0,stopped=0,signal!:()=>void;const waiting=new Promise<void>(r=>signal=r);
  const input=model(),task=startLayerBatch(input,{name:'部分',side:'front',startIndex:0},(source,options)=>{
    calls++;if(calls===1)return real(source,options);
    let resolve!:(r:FlatFoldResult)=>void;const promise=new Promise<FlatFoldResult>(r=>resolve=r);signal();
    return {promise,cancel:()=>{stopped++;resolve({...source,layers:{status:'cancelled',message:'停止'}});}};
  });
  await waiting;task.cancel();const result=await task.promise;assert.equal(result.status,'cancelled');assert.equal(stopped,1);assert.equal(calls,2);assert.deepEqual(result.items.map(i=>i.index),[0]);
});
test('timeout and solver failure retain partial results without pretending batch completion',async()=>{
  for(const status of ['timeout','error'] as const){let calls=0;const result=await startLayerBatch(model(),{name:'失败',side:'front',startIndex:0},(input,options)=>++calls===1?real(input,options):{promise:Promise.resolve({...input,layers:{status,message:'测试停止'}}),cancel:()=>{}}).promise;
    assert.equal(result.status,status);assert.equal(result.items.length,1);assert.equal(calls,2);
  }
});
test('batch isolates input and rejects invalid ranges before starting work',async()=>{
  const input=model(),options={name:'快照',side:'front' as const,startIndex:0,count:1};const task=startLayerBatch(input,options,real);input.geometry.vertices[0][0]=999;options.name='已改变';
  const result=await task.promise;assert.equal(result.status,'completed');assert.ok(result.items[0].svg.includes('快照'));assert.ok(!result.items[0].svg.includes('已改变'));
  for(const count of [0,101,1.5])assert.throws(()=>startLayerBatch(model(),{name:'x',side:'front',count},real),/范围/);
  assert.throws(()=>startLayerBatch(model(),{name:'x',side:'front',startIndex:Number.MAX_SAFE_INTEGER,count:1},real),/范围/);
});

test('batch recomputes shadows for each candidate with frozen direction and rotation',async()=>{
 const input=model(),seen:number[]=[],options={name:'阴影批次',side:'back' as const,rotation:22.5,shadows:true,startIndex:0,count:2,timeoutMs:500};
 const task=startLayerBatch(input,options,real,(result,side,rotation,budget)=>{
  seen.push(result.layers.solutionIndex!);assert.equal(side,'back');assert.equal(rotation,22.5);assert.equal(budget,500);
  return {promise:Promise.resolve({status:'complete',analysis:modelShadowBoundaries(result,side,rotation)}),cancel(){}};
 });
 options.shadows=false;options.rotation=90;
 const output=await task.promise;assert.deepEqual(seen,[0,1]);assert.equal(output.items.length,2);
 for(const item of output.items){const result=recomputeFlatLayers(input,{solutionIndex:item.index});assert.equal(item.svg,foldedModelSVG(result,{name:'阴影批次',side:'back',rotation:22.5,shadows:modelShadowBoundaries(result,'back',22.5)}));}
});

test('batch X ray and disabled shadows do not start shadow worker',async()=>{
 for(const options of [{shadows:false},{shadows:true,xray:true}]){
  const output=await startLayerBatch(model(),{name:'透明',side:'front',startIndex:0,count:1,...options},real,()=>{throw Error('unexpected worker');}).promise;
  assert.equal(output.items.length,1);assert.ok(!output.items[0].svg.includes('linearGradient'));
 }
 assert.throws(()=>startLayerBatch(model(),{name:'非法',side:'front',shadows:'true' as unknown as boolean},real),/阴影/);
});

test('batch defaults to unlimited solving and shadows; explicit deadlines and invalid inputs remain distinct',async()=>{
 for(const timeoutMs of [undefined,Infinity,500]){
  const expected=timeoutMs??Infinity;
  const output=await startLayerBatch(model(),{name:'完整批量',side:'front',shadows:true,startIndex:0,count:1,timeoutMs},(input,options)=>{
   assert.equal(options.timeoutMs,expected);return real(input,options);
  },(result,side,rotation,budget)=>{
   assert.equal(budget,expected);return {promise:Promise.resolve({status:'complete',analysis:modelShadowBoundaries(result,side,rotation)}),cancel(){}};
  }).promise;
  assert.equal(output.status,'completed');assert.equal(output.items.length,1);
 }
 for(const timeoutMs of [0,-1,NaN,-Infinity])assert.throws(()=>startLayerBatch(model(),{name:'非法时限',side:'front',timeoutMs},()=>{throw Error('must not start');}),/时限/);
});

test('batch shadow errors and unknown orders preserve only completed candidates',async()=>{
 for(const reply of [{status:'timeout',message:'时限'},{status:'error',message:'失败'},{status:'complete',analysis:{status:'unconfirmed',boundaries:[],ambiguousEdges:0}}] as ModelShadowReply[]){
  let calls=0;const output=await startLayerBatch(model(),{name:'中断',side:'front',shadows:true,startIndex:0,count:3},real,(result,side,rotation)=>({promise:Promise.resolve(++calls===1?{status:'complete',analysis:modelShadowBoundaries(result,side,rotation)}:reply),cancel(){}})).promise;
  assert.equal(output.status,reply.status==='timeout'?'timeout':'error');assert.deepEqual(output.items.map(i=>i.index),[0]);assert.equal(calls,2);
 }
});

test('cancelling batch interrupts in-flight shadow worker and discards its late success',async()=>{
 let entered!:()=>void,resolve!:(reply:ModelShadowReply)=>void,stops=0;
 const waiting=new Promise<void>(r=>entered=r);
 const task=startLayerBatch(model(),{name:'停止阴影',side:'front',shadows:true,startIndex:0,count:2},real,(result,side,rotation)=>{
  const analysis=modelShadowBoundaries(result,side,rotation);entered();
  return {promise:new Promise<ModelShadowReply>(r=>resolve=r),cancel(){stops++;resolve({status:'complete',analysis});}};
 });
 await waiting;task.cancel();const output=await task.promise;
 assert.equal(output.status,'cancelled');assert.equal(stops,1);assert.equal(output.items.length,0);
});
