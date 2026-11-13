import type {Point} from '../core/types';
import type {CreaseGpuScene} from './creaseGpuRenderer';
import {creaseLineStyle} from '../app/creaseLineStyle';

export const CREASE_GPU_STRIDE=23;
export const CREASE_GPU_ASYNC_THRESHOLD=20_000;
export interface CreaseGpuLines {lines:Float32Array<ArrayBuffer>;count:number}
export interface PackedCreaseGpuScene extends CreaseGpuLines {points:Float32Array<ArrayBuffer>}
export interface CreaseGpuPreparationOptions {signal?:AbortSignal;onProgress?:(fraction:number)=>void;onBatch?:(milliseconds:number)=>void}
const BATCH_ITEMS=4096,BATCH_MS=4;
const abort=()=>new DOMException('折痕显示准备已取消。','AbortError');
export const creaseGpuRgba=(hex:string):number[]=>{
 if(!/^#[\da-f]{6}$/i.test(hex))throw new Error('Unsupported GPU stroke color');
 return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,1];
};

/** Exactly the inputs that affect packed strokes and their draw uniforms.
 * Vertex discovery may complete later without invalidating a million lines. */
export function sameCreaseGpuLines(a:CreaseGpuScene,b:CreaseGpuScene):boolean{
 return a.segments===b.segments&&a.selected===b.selected&&a.diagnostic===b.diagnostic&&a.hiddenId===b.hiddenId&&a.main===b.main&&a.auxiliary===b.auxiliary
  &&a.solidCreases===b.solidCreases&&a.segmentPresentation===b.segmentPresentation
  &&a.display.lineStyle===b.display.lineStyle&&a.display.auxLineStyle===b.display.auxLineStyle&&a.display.lineWidth===b.display.lineWidth&&a.display.auxLineWidth===b.display.auxLineWidth
  &&a.display.roundedEnds===b.display.roundedEnds&&a.display.antiAlias===b.display.antiAlias;
}

/** One outstanding macrotask gives painting/input a chance between batches.
 * MessageChannel avoids nested-timer clamping during a large scene. */
export function runCreaseGpuBatches<T>(step:()=>T|undefined,options:CreaseGpuPreparationOptions={}):Promise<T>{
 return new Promise((resolve,reject)=>{
  let finished=false,timer:ReturnType<typeof setTimeout>|undefined,channel:MessageChannel|undefined,yieldedAt=performance.now();
  const cleanup=()=>{options.signal?.removeEventListener('abort',cancel);if(timer!==undefined)clearTimeout(timer);channel?.port1.close();channel?.port2.close();};
  const fail=(error:unknown)=>{if(finished)return;finished=true;cleanup();reject(error instanceof Error?error:new Error(String(error)));};
  const cancel=()=>fail(abort());
  // Some event loops drain self-posted port messages before timers. Force a
  // timer turn regularly as well, so input/painting is not starved by the port.
  const schedule=()=>{if(channel&&performance.now()-yieldedAt<8)channel.port2.postMessage(0);else timer=setTimeout(()=>{yieldedAt=performance.now();turn();},0);};
  const turn=()=>{
   if(finished)return;if(options.signal?.aborted){cancel();return;}
   try{const start=performance.now(),result=step();options.onBatch?.(performance.now()-start);if(finished)return;
    if(result!==undefined){finished=true;cleanup();resolve(result);}else schedule();
   }catch(error){fail(error);}
  };
  if(options.signal?.aborted){cancel();return;}
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(typeof MessageChannel!=='undefined'){channel=new MessageChannel();channel.port1.onmessage=turn;}
  schedule();
 });
}

function linePacker(scene:CreaseGpuScene){
 const data=new Float32Array(scene.segments.length*CREASE_GPU_STRIDE);let index=0,count=0;
 const appearances=new Map<string,{color:Float32Array;dash:Float32Array}>();
 return {get progress(){return scene.segments.length?index/scene.segments.length:1;},step(maximum=Infinity,deadline=Infinity):CreaseGpuLines|undefined{
  let processed=0;
  while(index<scene.segments.length){
   const segment=scene.segments[index++];
   if(segment.id!==scene.hiddenId&&(segment.assignment==='A'?scene.auxiliary:scene.main)){
    const key=segment.assignment==='A'&&segment.displayColor!==undefined?`A:${segment.displayColor}`:segment.assignment;
    let appearance=appearances.get(key);
    if(!appearance){
     const base=creaseLineStyle(segment,scene.display.lineStyle,1,scene.display.auxLineStyle,scene.solidCreases),dash=base.dash?.split(' ').map(Number)??[];
     if(dash.length>6)throw new Error('Unsupported GPU dash pattern');
     appearance={color:new Float32Array(creaseGpuRgba(base.color)),dash:new Float32Array(dash)};
     // This is only a bounded memo: evicted colors are packed normally again.
     if(appearances.size===32)appearances.delete(appearances.keys().next().value!);appearances.set(key,appearance);
    }
    const offset=count*CREASE_GPU_STRIDE;
    for(let axis=0;axis<4;axis++){
     const coordinate=axis<2?segment.a[axis]:segment.b[axis-2];if(!Number.isFinite(coordinate))throw new Error('Invalid GPU coordinate');
     const high=Math.fround(coordinate);if(!Number.isFinite(high))throw new Error('GPU coordinate outside representable range');data[offset+axis]=high;data[offset+4+axis]=coordinate-high;
    }
    data.set(appearance.color,offset+8);data.set(appearance.dash,offset+12);
    data[offset+18]=(segment.assignment==='A'?scene.display.auxLineWidth:scene.display.lineWidth)*(scene.segmentPresentation?.get(segment.id)?.emphasis?1.3:1);
    data[offset+19]=scene.selected.has(segment.id)?1:0;data[offset+20]=scene.diagnostic?.has(segment.id)?1:0;data[offset+21]=appearance.dash.length;count++;
   }
   if(++processed>=maximum||deadline!==Infinity&&(processed&63)===0&&performance.now()>=deadline)return undefined;
  }
  return {lines:data.subarray(0,count*CREASE_GPU_STRIDE),count};
 }};
}
function pointPacker(vertices:readonly Point[]){
 const points=new Float32Array(vertices.length*4);let index=0;
 return {get progress(){return vertices.length?index/vertices.length:1;},step(maximum=Infinity,deadline=Infinity):Float32Array<ArrayBuffer>|undefined{
  let processed=0;
  while(index<vertices.length){
   const point=vertices[index];for(let axis=0;axis<2;axis++){const high=Math.fround(point[axis]);points[index*4+axis]=high;points[index*4+2+axis]=point[axis]-high;}index++;
   if(++processed>=maximum||deadline!==Infinity&&(processed&63)===0&&performance.now()>=deadline)return undefined;
  }
  return points;
 }};
}

/** Same exact packing rules for the original small synchronous path. */
export function packCreaseGpuScene(scene:CreaseGpuScene):PackedCreaseGpuScene{
 return {...linePacker(scene).step()!,points:pointPacker(scene.vertices).step()!};
}
export function prepareCreaseGpuLines(scene:CreaseGpuScene,options:CreaseGpuPreparationOptions={}):Promise<CreaseGpuLines>{
 let packer:ReturnType<typeof linePacker>|undefined;
 return runCreaseGpuBatches(()=>{packer??=linePacker(scene);const result=packer.step(BATCH_ITEMS,performance.now()+BATCH_MS);options.onProgress?.(packer.progress);return result;},options);
}
export function prepareCreaseGpuPoints(vertices:readonly Point[],options:CreaseGpuPreparationOptions={}):Promise<Float32Array<ArrayBuffer>>{
 let packer:ReturnType<typeof pointPacker>|undefined;
 return runCreaseGpuBatches(()=>{packer??=pointPacker(vertices);const result=packer.step(BATCH_ITEMS,performance.now()+BATCH_MS);options.onProgress?.(packer.progress);return result;},options);
}
export async function prepareCreaseGpuScene(scene:CreaseGpuScene,options:CreaseGpuPreparationOptions={}):Promise<PackedCreaseGpuScene>{
 const lines=await prepareCreaseGpuLines(scene,{...options,onProgress:fraction=>options.onProgress?.(fraction*.8)});
 const points=await prepareCreaseGpuPoints(scene.vertices,{...options,onProgress:fraction=>options.onProgress?.(.8+fraction*.2)});return {...lines,points};
}
