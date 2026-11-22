import {RegionTournament} from '../core/regionTournament';
import {checkRegionTransitionChunks,regionProofParts} from '../core/regionTransitionSchedule';
import {REGION_CONTROL,failRegionPool,notifyRegionPool,regionPoolOutput,waitForRegionPool,type RegionParallelPoolData} from '../core/regionParallelProtocol';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<{pool:RegionParallelPoolData;workerId:number}>)=>void)|null;postMessage(data:unknown):void};
scope.onmessage=event=>{
 const {pool,workerId}=event.data,control=pool.control,C=REGION_CONTROL,slot=C.slots+workerId*C.stride;
 try{
  if(!Number.isInteger(workerId)||workerId<0||workerId>=pool.workers||control.length!==C.slots+pool.workers*C.stride||!(control.buffer instanceof SharedArrayBuffer)||!(pool.matrix.buffer instanceof SharedArrayBuffer))throw Error('并行校验共享协议无效。');
  // Preserve the established witness traversal within each worker. An equally
  // valid witness from a different lane can steer later search to another answer.
  const chunks=pool.schedule.chunks.filter((_,i)=>i%pool.workers===workerId),output=regionPoolOutput(pool),base=workerId*pool.batchSize*4;
  const parts=regionProofParts(pool.schedule);
  if(pool.precheckJobs.length!==parts.length||!(pool.precheckJobs.buffer instanceof SharedArrayBuffer))throw Error('并行区域预检任务无效。');
  if(pool.dirtyChunks.length!==Math.ceil(parts.length/32)||!(pool.dirtyChunks.buffer instanceof SharedArrayBuffer))throw Error('并行区域分片状态无效。');
  if(pool.chunkGenerations.length!==parts.length||pool.writtenAt.length!==pool.schedule.cellCount||!(pool.chunkGenerations.buffer instanceof SharedArrayBuffer)||!(pool.writtenAt.buffer instanceof SharedArrayBuffer))throw Error('并行区域证书代次无效。');
  const indices=new Map(parts.map((chunk,i)=>[chunk,i]));
  if(pool.triangles.length!==pool.workers*pool.batchSize*4)throw Error('并行校验三环缓冲区无效。');
  let generation=0;Atomics.add(control,C.ready,1);notifyRegionPool(control);
  while(!Atomics.load(control,C.cancelled)){
   while(Atomics.load(control,C.generation)===generation&&!Atomics.load(control,C.cancelled))Atomics.wait(control,C.generation,generation);
   if(Atomics.load(control,C.cancelled))return;
   generation=Atomics.load(control,C.generation);if(generation<=0)throw Error('并行校验代次无效。');
   const tournament=RegionTournament.fromPackedComparisons(pool.schedule.faceCount,pool.matrix,{workerId,workers:pool.workers,barrier(){
     if(Atomics.add(control,C.validated,1)+1===pool.workers)notifyRegionPool(control);
     waitForRegionPool(pool,()=>Atomics.load(control,C.validated)===pool.workers);
   }});
   const proof={indices,generations:pool.chunkGenerations,writtenAt:pool.writtenAt,generation},jobs=Atomics.load(control,C.precheckCount);
   if(jobs){
    if(jobs<0||jobs>parts.length)throw Error('并行区域预检任务数量无效。');
    for(let job=Atomics.add(control,C.precheckCursor,1);job<jobs;job=Atomics.add(control,C.precheckCursor,1)){
     if(Atomics.load(control,C.cancelled)||Atomics.load(control,C.error))throw Error('并行区域预检已停止。');
     const part=parts[pool.precheckJobs[job]];
     if(!part)throw Error('并行区域预检任务编号无效。');
     const precheck=checkRegionTransitionChunks(pool.schedule,[part],tournament,output,1,undefined,proof);
     // A cycle found in a speculative physical lane must never enter the
     // solver. Its original owner replays the part with the correct witness.
     if(!precheck.complete)tournament.transition([...tournament.active],[]);
    }
    if(Atomics.add(control,C.prechecked,1)+1===pool.workers)notifyRegionPool(control);
    waitForRegionPool(pool,()=>Atomics.load(control,C.prechecked)===pool.workers);
   }
   const checked=checkRegionTransitionChunks(pool.schedule,chunks,tournament,output,pool.batchSize,cells=>{if(Atomics.load(control,C.cancelled))throw Error('并行校验已取消。');Atomics.store(control,slot+1,cells);},proof);
   if(Atomics.load(control,C.cancelled))return;if(Atomics.load(control,C.generation)!==generation)throw Error('并行校验期间层序代次发生变化。');
   for(let i=0;i<checked.triangles.length;i++){const item=checked.triangles[i],position=base+i*4;pool.triangles[position]=item.visit;pool.triangles[position+1]=item.triangle[0];pool.triangles[position+2]=item.triangle[1];pool.triangles[position+3]=item.triangle[2];}
   Atomics.store(control,slot+1,checked.cells);Atomics.store(control,slot+2,checked.triangles.length);Atomics.store(control,slot+3,Number(checked.complete));Atomics.store(control,slot,generation);Atomics.add(control,C.completed,1);notifyRegionPool(control);
  }
 }catch(error){failRegionPool(control);scope.postMessage({type:'region-pool-error',reason:error instanceof Error?error.message:String(error)});}
};
