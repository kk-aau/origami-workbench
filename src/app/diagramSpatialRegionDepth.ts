import {regionParallelWorkerCount} from '../core/regionParallelHardware';
import {spatialCellDepths,type SpatialDepthCell,type SpatialDepthPlanes,type SpatialDepthPlane} from './diagramSpatialDepthKernel';
export {refineSeparatedSpatialDepth,spatialCellDepths,SpatialDepth,type SpatialDepthPlane} from './diagramSpatialDepthKernel';

interface WeightedCell {index:number;pairs:number;cost:number}

/** Start companion workers only when each lane amortizes its startup and
 * transfer overhead. An empty map leaves all cells to the inline merge loop. */
export async function planSpatialRegionDepths(cells:readonly SpatialDepthCell[],planes:SpatialDepthPlanes,roundoff:number,maxWorkers=globalThis.navigator?.hardwareConcurrency):Promise<ReadonlyMap<number,Int8Array>>{
  const signs=new Map<number,Int8Array>();
  if(typeof Worker!=='function'||regionParallelWorkerCount(maxWorkers,cells.length)<2)return signs;
  const tasks:WeightedCell[]=[];
  let work=0;
  for(let i=0;i<cells.length;i++){
    const cell=cells[i],pairs=cell.faces.length*(cell.faces.length-1)/2;
    if(!pairs)continue;
    const cost=pairs*cell.polygon.length;
    tasks.push({index:i,pairs,cost});work+=cost;
  }
  const count=regionParallelWorkerCount(maxWorkers,Math.min(tasks.length,Math.floor(work/10_000_000)));
  if(count<2)return signs;
  const batches=Array.from({length:count},()=>({cost:0,tasks:[] as WeightedCell[]}));
  tasks.sort((a,b)=>b.cost-a.cost);
  for(const task of tasks){
    const batch=batches.reduce((lightest,next)=>next.cost<lightest.cost?next:lightest);
    batch.cost+=task.cost;batch.tasks.push(task);
  }

  const workers:Worker[]=[];
  const runWorker=(batch:WeightedCell[])=>{
    let worker:Worker;
    try{worker=new Worker(new URL('../workers/diagramSpatialRegionDepth.worker.ts',import.meta.url),{type:'module'});}
    catch{return Promise.resolve();}
    workers.push(worker);
    return new Promise<void>((resolve,reject)=>{
      // A host without nested-worker support computes this lane on demand.
      worker.onerror=event=>{event.preventDefault();resolve();};
      worker.onmessageerror=()=>resolve();
      worker.onmessage=({data})=>{
        if(typeof data?.error==='string'){reject(new Error(data.error));return;}
        const rows:unknown=data?.signs;
        if(!Array.isArray(rows)||rows.length!==batch.length||!rows.every((row,i)=>row instanceof Int8Array&&row.length===batch[i].pairs)){
          reject(new Error('区域深度计算返回的数据与纸面对不匹配。'));return;
        }
        batch.forEach((task,i)=>signs.set(task.index,rows[i]));resolve();
      };
      // Send only the material planes used in this lane. Face identifiers are
      // local indices for depth lookup; all returned signs use original order.
      const localPlanes:(SpatialDepthPlane|null)[]=[],ids=new Map<number,number>();
      const localCells=batch.map(({index})=>{
        const {polygon,faces}=cells[index];
        return {polygon,faces:faces.map(face=>{
          let id=ids.get(face);
          if(id===undefined){id=localPlanes.length;ids.set(face,id);localPlanes.push(planes[face]);}
          return id;
        })};
      });
      try{worker.postMessage({cells:localCells,planes:localPlanes,roundoff});}
      catch{resolve();}
    });
  };
  try{
    await Promise.all([...batches.slice(1).map(batch=>runWorker(batch.tasks)),Promise.resolve().then(()=>{
      for(const task of batches[0].tasks)signs.set(task.index,spatialCellDepths(cells[task.index],planes,roundoff));
    })]);
    return signs;
  }finally{for(const worker of workers)worker.terminate();}
}
