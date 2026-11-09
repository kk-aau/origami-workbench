import type {RegionTransitionSchedule} from './regionTransitionSchedule';
import {REGION_MAX_WORKERS} from './regionParallelHardware';
export const REGION_CONTROL={generation:0,signal:1,error:2,ready:3,cancelled:4,completed:5,slots:8,stride:4} as const;
export const REGION_UNWRITTEN=-2147483648;
export interface RegionParallelPoolData {id:number;workers:number;batchSize:number;schedule:RegionTransitionSchedule;matrix:Uint32Array;certificate:ArrayBufferLike;control:Int32Array;triangles:Uint32Array}
export type RegionParallelMessage={type:'region-pool-init';pool:RegionParallelPoolData}|{type:'region-pool-dispose';id:number}|{type:'region-parallel-status';status:'enabled'|'fallback';workers:number;reason?:string};
export function notifyRegionPool(control:Int32Array){Atomics.add(control,REGION_CONTROL.signal,1);Atomics.notify(control,REGION_CONTROL.signal);}
export function failRegionPool(control:Int32Array){Atomics.store(control,REGION_CONTROL.error,1);notifyRegionPool(control);}
export function cancelRegionPool(control:Int32Array){Atomics.store(control,REGION_CONTROL.cancelled,1);notifyRegionPool(control);Atomics.notify(control,REGION_CONTROL.generation);}
export function regionPoolOutput(pool:RegionParallelPoolData){const count=pool.schedule.cellCount;return{top:new Int32Array(pool.certificate,0,count),bottom:new Int32Array(pool.certificate,count*4,count),depth:new Uint32Array(pool.certificate,count*8,count)};}
/** Read the wake-up version BEFORE checking terminal state: a failure between
 * those reads must either be observed or make wait return "not-equal". */
export function waitForRegionPool(pool:RegionParallelPoolData,condition:()=>boolean){
 const control=pool.control,C=REGION_CONTROL;
 for(;;){
  const signal=Atomics.load(control,C.signal);
  if(Atomics.load(control,C.error)||Atomics.load(control,C.cancelled))throw Error('并行校验线程不可用，已改用单线程完整检查。');
  if(condition())return;
  Atomics.wait(control,C.signal,signal);
 }
}

/** Main-thread supervision stays responsive while the solver is blocked in
 * Atomics.wait. A failed child therefore always wakes the solver for fallback. */
export class RegionParallelPoolOwner {
 private readonly pools=new Map<number,{pool:RegionParallelPoolData;workers:Worker[]}>();
 constructor(private readonly create:()=>Worker,private readonly onFailure?:(reason:string)=>void){}
 start(pool:RegionParallelPoolData){
  if(this.pools.has(pool.id)){failRegionPool(pool.control);this.dispose(pool.id);this.onFailure?.('并行校验池标识重复。');return;}
  const entry={pool,workers:[] as Worker[]};this.pools.set(pool.id,entry);
  const fail=(reason:string)=>{if(this.pools.get(pool.id)!==entry)return;failRegionPool(pool.control);this.dispose(pool.id);this.onFailure?.(reason);};
  try{
   if(!Number.isInteger(pool.workers)||pool.workers<1||pool.workers>REGION_MAX_WORKERS||pool.control.length!==REGION_CONTROL.slots+pool.workers*REGION_CONTROL.stride)throw Error('并行校验线程参数无效。');
   for(let workerId=0;workerId<pool.workers;workerId++){
    const worker=this.create();entry.workers.push(worker);
    worker.onerror=event=>{event.preventDefault?.();fail(event.message||'并行校验线程异常退出。');};
    worker.onmessageerror=()=>fail('无法读取并行校验线程消息。');
    worker.onmessage=event=>fail(event.data?.type==='region-pool-error'&&typeof event.data.reason==='string'?event.data.reason:'并行校验线程返回了无法识别的协议消息。');
    worker.postMessage({pool,workerId});
   }
  }catch(error){fail(error instanceof Error?error.message:String(error));}
 }
 dispose(id:number){const entry=this.pools.get(id);if(!entry)return;this.pools.delete(id);cancelRegionPool(entry.pool.control);for(const worker of entry.workers)worker.terminate();}
 disposeAll(){for(const id of this.pools.keys())this.dispose(id);}
}
