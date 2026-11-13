import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCreaseGpuScene,prepareCreaseGpuLines,prepareCreaseGpuPoints,sameCreaseGpuLines} from '../../src/components/creaseGpuScenePreparation';
import {packCreaseGpuScene,type CreaseGpuScene} from '../../src/components/creaseGpuRenderer';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {LINE_STYLES,creaseLineStyle} from '../../src/app/creaseLineStyle';
import type {Segment} from '../../src/core/types';

function fixture(count=12500):CreaseGpuScene{
 const types=['A','M','V','B','U','F'] as const;
 const segments:Segment[]=Array.from({length:count},(_,index)=>({id:`line-${index}`,assignment:types[index%6],a:[1e8+index/10,-1e8+index/100],b:[1e8+index/10+.001,-1e8+index/100+.0001],angle:index%6===1?-180:index%6===2?180:0,...(index%13===0?{displayColor:'#123456'}:{})}));
 return {segments,selected:new Set(segments.filter((_,index)=>index%7===0).map(segment=>segment.id)),diagnostic:new Set(segments.filter((_,index)=>index%11===0).map(segment=>segment.id)),hiddenId:'line-7',main:true,auxiliary:true,display:defaultCreaseDisplay(),vertices:segments.map(segment=>segment.a),segmentPresentation:new Map([['line-15',{emphasis:true,title:'保留作者说明'}]])};
}

test('bounded preparation produces exactly the full synchronous line/point arrays for every style',async()=>{
 const source=fixture(),before=structuredClone(source);
 for(const lineStyle of Object.keys(LINE_STYLES) as (keyof typeof LINE_STYLES)[]){
  const scene={...source,display:{...source.display,lineStyle,auxLineStyle:'dashed' as const}};
  const expected=packCreaseGpuScene(scene),batches:number[]=[],progress:number[]=[];
  const result=await prepareCreaseGpuScene(scene,{onBatch:ms=>batches.push(ms),onProgress:value=>progress.push(value)});
  assert.deepEqual(result,expected);assert.ok(batches.length>4,'line and point work must yield between bounded batches');assert.equal(progress.at(-1),1);assert.ok(progress.every((value,index)=>index===0||value>=progress[index-1]));
 }
 assert.deepEqual(source,before);
});

test('filtering and empty point banks preserve all authored paint order and flags',async()=>{
 const source=fixture();
 for(const [main,auxiliary]of [[true,false],[false,true],[false,false]]){const scene={...source,main,auxiliary,vertices:[]};assert.deepEqual(await prepareCreaseGpuScene(scene),packCreaseGpuScene(scene));}
 const empty={...source,segments:[],vertices:[]};assert.deepEqual(await prepareCreaseGpuScene(empty),packCreaseGpuScene(empty));
});

test('cancel before the first turn does not touch or clone the scene and cancellation during packing publishes nothing',async()=>{
 const source=fixture(),unread=Object.defineProperty({...source},'segments',{get(){throw Error('Scene was synchronously touched');}}) as CreaseGpuScene;
 const initial=new AbortController(),first=prepareCreaseGpuScene(unread,{signal:initial.signal}),rejected=assert.rejects(first,{name:'AbortError'});initial.abort();await rejected;
 for(const stage of ['lines','points']){
  const controller=new AbortController();let batches=0;
  const promise=stage==='lines'?prepareCreaseGpuLines(source,{signal:controller.signal,onBatch(){batches++;controller.abort();}}):prepareCreaseGpuPoints(source.vertices,{signal:controller.signal,onBatch(){batches++;controller.abort();}});
  await assert.rejects(promise,{name:'AbortError'});assert.equal(batches,1);
 }
});

test('late invalid geometry rejects the whole pack and never returns a partial array',async()=>{
 const source=fixture(),segments=[...source.segments];segments[segments.length-1]={...segments.at(-1)!,a:[Infinity,0]};
 await assert.rejects(prepareCreaseGpuScene({...source,segments}),/Invalid GPU coordinate/);
});

test('late vertices and marker settings reuse the same complete line bank while line input changes invalidate it',async()=>{
 const source=fixture(),lineBank=await prepareCreaseGpuLines(source),next={...source,vertices:[...source.vertices,[12,34] as [number,number]],display:{...source.display,pointSize:4,pointStyle:'square' as const}};
 assert.equal(sameCreaseGpuLines(source,next),true);assert.deepEqual({...lineBank,points:await prepareCreaseGpuPoints(next.vertices)},packCreaseGpuScene(next));
 for(const changed of [{...next,segments:[...next.segments]},{...next,selected:new Set<string>()},{...next,diagnostic:new Set<string>()},{...next,hiddenId:'other'},{...next,main:false},{...next,display:{...next.display,lineWidth:3}},{...next,display:{...next.display,roundedEnds:!next.display.roundedEnds}},{...next,segmentPresentation:new Map()}])assert.equal(sameCreaseGpuLines(source,changed),false);
});

test('a continuous large pack yields to ordinary timer/input callbacks instead of draining the port queue',async()=>{
 const source=fixture(200000);let ticks=0;const timer=setInterval(()=>ticks++,0);
 try{await prepareCreaseGpuScene(source);assert.ok(ticks>2,'ordinary event-loop callbacks must run throughout preparation');}finally{clearInterval(timer);}
});

test('bounded appearance memo never limits unique authored auxiliary colors or removes any stroke',async()=>{
 const source=fixture(1200),segments=source.segments.map((segment,index)=>({...segment,assignment:'A' as const,angle:0,displayColor:'#'+(index%257).toString(16).padStart(6,'0')})),scene={...source,segments,hiddenId:null};
 const result=await prepareCreaseGpuScene(scene);assert.equal(result.count,segments.length);
 for(let index=0;index<segments.length;index++){const expected=creaseLineStyle(segments[index],scene.display.lineStyle,1,scene.display.auxLineStyle);for(let axis=0;axis<3;axis++)assert.ok(Math.abs(result.lines[index*23+8+axis]-parseInt(expected.color.slice(1+axis*2,3+axis*2),16)/255)<1e-7);}
});
