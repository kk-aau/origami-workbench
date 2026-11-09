import {RegionTournament} from '../core/regionTournament';
import {checkRegionTransitionChunks} from '../core/regionTransitionSchedule';
import {REGION_CONTROL,failRegionPool,notifyRegionPool,regionPoolOutput,type RegionParallelPoolData} from '../core/regionParallelProtocol';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<{pool:RegionParallelPoolData;workerId:number}>)=>void)|null;postMessage(data:unknown):void};
scope.onmessage=event=>{
 const {pool,workerId}=event.data,control=pool.control,C=REGION_CONTROL,slot=C.slots+workerId*C.stride;
 try{
  if(!Number.isInteger(workerId)||workerId<0||workerId>=pool.workers||control.length!==C.slots+pool.workers*C.stride||!(control.buffer instanceof SharedArrayBuffer)||!(pool.matrix.buffer instanceof SharedArrayBuffer))throw Error('并行校验共享协议无效。');
  const chunks=pool.schedule.chunks.filter((_,index)=>index%pool.workers===workerId),output=regionPoolOutput(pool),base=workerId*pool.batchSize*4;
  if(pool.triangles.length!==pool.workers*pool.batchSize*4)throw Error('并行校验三环缓冲区无效。');
  let generation=0;Atomics.add(control,C.ready,1);notifyRegionPool(control);
  while(!Atomics.load(control,C.cancelled)){
   while(Atomics.load(control,C.generation)===generation&&!Atomics.load(control,C.cancelled))Atomics.wait(control,C.generation,generation);
   if(Atomics.load(control,C.cancelled))return;
   generation=Atomics.load(control,C.generation);if(generation<=0)throw Error('并行校验代次无效。');
   const tournament=RegionTournament.fromPackedComparisons(pool.schedule.faceCount,pool.matrix);
   const checked=checkRegionTransitionChunks(pool.schedule,chunks,tournament,output,pool.batchSize,cells=>{if(Atomics.load(control,C.cancelled))throw Error('并行校验已取消。');Atomics.store(control,slot+1,cells);});
   if(Atomics.load(control,C.cancelled))return;if(Atomics.load(control,C.generation)!==generation)throw Error('并行校验期间层序代次发生变化。');
   for(let i=0;i<checked.triangles.length;i++){const item=checked.triangles[i],position=base+i*4;pool.triangles[position]=item.visit;pool.triangles[position+1]=item.triangle[0];pool.triangles[position+2]=item.triangle[1];pool.triangles[position+3]=item.triangle[2];}
   Atomics.store(control,slot+1,checked.cells);Atomics.store(control,slot+2,checked.triangles.length);Atomics.store(control,slot+3,Number(checked.complete));Atomics.store(control,slot,generation);Atomics.add(control,C.completed,1);notifyRegionPool(control);
  }
 }catch(error){failRegionPool(control);scope.postMessage({type:'region-pool-error',reason:error instanceof Error?error.message:String(error)});}
};
