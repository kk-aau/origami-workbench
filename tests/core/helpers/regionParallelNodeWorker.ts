import {parentPort,workerData} from 'node:worker_threads';
if(workerData.kind==='checker'){
 if(workerData.failure==='crash')throw Error('injected checker hard crash');
 if(workerData.failure==='protocol'){parentPort!.postMessage({ready:true});}
 else if(workerData.failure==='pending'){parentPort!.on('message',()=>{});}
 else{
  const scope=globalThis as any;scope.postMessage=(data:unknown)=>parentPort!.postMessage(data);
  await import('../../../src/workers/regionTournament.worker');
  parentPort!.on('message',data=>{
   if(workerData.failure==='invalid-matrix'&&data.workerId===0){
    const last=data.pool.schedule.faceCount-1,words=Math.ceil((last+1)/16);
    data.pool.matrix[last*words+(last>>>4)]|=3<<((last&15)*2);
   }
   if(workerData.failure==='stale-slot'&&data.workerId===0){
    const control=data.pool.control,add=Atomics.add;
    Atomics.add=((array:Int32Array,index:number,value:number)=>{
     if(array===control&&index===5&&Atomics.load(control,0)===2)data.pool.writtenAt[0]=0;
     return add(array,index,value);
    }) as typeof Atomics.add;
   }
   scope.onmessage({data});
  });
 }
}else{
 const {createWorkerRegionCoverageChecker}=await import('../../../src/core/regionParallelChecker');
 const {checkCoverageTournaments}=await import('../../../src/core/regionTournament');
 const groups=workerData.groups as number[][],faceCount=workerData.faceCount;
 const coverage={faceCount,cellCount:groups.length,walk(visitor:any){const active=new Set<number>();groups.forEach((ids,cell)=>{const wanted=new Set(ids),removed=[...active].filter(f=>!wanted.has(f)),added=ids.filter(f=>!active.has(f));for(const f of removed)active.delete(f);for(const f of added)active.add(f);visitor.onTransition?.({removed,added});visitor.onCell?.(cell,active);});const removed=[...active];active.clear();visitor.onTransition?.({removed,added:[]});}};
 const pairs: [number,number][]=[];for(let a=0;a<faceCount;a++)for(let b=a+1;b<faceCount;b++)pairs.push([a,b]);
 const checker=createWorkerRegionCoverageChecker(message=>parentPort!.postMessage(message),{enabled:workerData.enabled??true,workers:workerData.workers??3,minimumCells:0});
 const answers=[];
 for(const values of workerData.values){const result=checker(coverage,pairs,values,undefined,workerData.batchSize??10000);answers.push({result,reference:checkCoverageTournaments(coverage,pairs,values)});}
 parentPort!.postMessage({type:'answers',answers});
}
