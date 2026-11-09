import {RegionTournament,checkCoverageTournaments,type RegionCoverage,type RegionTournamentCheck,type RegionTriangle} from './regionTournament';
import {buildRegionTransitionSchedule,type RegionTriangleRecord,type RegionTransitionSchedule} from './regionTransitionSchedule';
import {REGION_CONTROL,REGION_UNWRITTEN,regionPoolOutput,waitForRegionPool,type RegionParallelMessage,type RegionParallelPoolData} from './regionParallelProtocol';
import {regionParallelWorkerCount} from './regionParallelHardware';
import {allocateRegion,RegionAllocationError} from './regionAllocation';
import type {RegionCoverageChecker} from './regionCoverageChecker';
const C=REGION_CONTROL;
function shared(array:Readonly<Uint32Array>):Uint32Array{const result=allocateRegion(()=>new Uint32Array(new SharedArrayBuffer(array.byteLength)));result.set(array);return result;}

/** UI owns all checker workers and reports their errors through shared control.
 * No arbitrary computation timeout is needed, even while the solver waits.
 * A failed/cancelled pool and all its shared arrays are permanently abandoned. */
export function createWorkerRegionCoverageChecker(post:(message:RegionParallelMessage)=>void,options:{enabled?:boolean;workers?:number;minimumCells?:number}={}):RegionCoverageChecker{
 const enabled=typeof SharedArrayBuffer==='function'&&(options.enabled??(globalThis.crossOriginIsolated===true&&typeof document==='undefined'));
 let reported:unknown=options.workers;
 if(reported===undefined)try{reported=typeof navigator==='undefined'?undefined:navigator.hardwareConcurrency;}catch{reported=undefined;}
 const concurrency=regionParallelWorkerCount(reported);
 let pool:RegionParallelPoolData|undefined,source:RegionCoverage|undefined,id=0,generation=0,disabled=!enabled,forcePaged=false;
 const dispose=()=>{if(pool)post({type:'region-pool-dispose',id:pool.id});pool=undefined;source=undefined;generation=0;};
 return(coverage,pairs,values,onProgress,batchSize=10_000):RegionTournamentCheck=>{
  const sequential=()=>checkCoverageTournaments(coverage,pairs,values,onProgress,batchSize,forcePaged?{forcePaged:true}:undefined);
  if(disabled||concurrency<2||coverage.cellCount<(options.minimumCells??65_536))return sequential();
  const fallback=(error:unknown,paged:boolean)=>{
   disabled=true;forcePaged ||=paged;dispose();post({type:'region-parallel-status',status:'fallback',workers:0,reason:error instanceof Error?error.message:String(error)});
   // Permanently discard failed shared arrays. In particular, an allocation
   // failure must not retry the same large dense matrix in the CPU fallback.
   return sequential();
  };
  // Validate all canonical comparisons before sharing, retaining the original
  // missing/duplicate/invalid-value semantics. Sparse matrices use CPU fallback.
  if(!Number.isSafeInteger(batchSize)||batchSize<1)throw Error('区域反例批次大小无效。');
  let packed:Readonly<Uint32Array>|undefined,prepared:RegionTransitionSchedule|undefined;
  try{
   packed=new RegionTournament(coverage.faceCount,pairs,values).packedComparisons;
   if(packed)prepared=source!==coverage||pool?.batchSize!==batchSize?buildRegionTransitionSchedule(coverage):undefined;
  }catch(error){
   // Only allocation sites attach this tag. Topology/identity checks, malformed
   // pairs and even a RangeError thrown by coverage.walk propagate unchanged.
   if(!(error instanceof RegionAllocationError))throw error;
   return fallback(error,true);
  }
  if(!packed)return fallback(new Error('当前图形采用分页关系表，继续执行完整 CPU 检查。'),true);
  let answer:RegionTournamentCheck,checkedCells=0;
  try{
   if(prepared){
    dispose();const schedule=prepared;
    const workers=regionParallelWorkerCount(concurrency,schedule.chunks.length),control=allocateRegion(()=>new Int32Array(new SharedArrayBuffer((C.slots+workers*C.stride)*4)));
    pool={id:++id,workers,batchSize,schedule:{...schedule,events:shared(schedule.events),visitOrder:shared(schedule.visitOrder)},matrix:shared(packed),certificate:allocateRegion(()=>new SharedArrayBuffer(coverage.cellCount*12)),control,triangles:allocateRegion(()=>new Uint32Array(new SharedArrayBuffer(workers*batchSize*16)))};source=coverage;
    post({type:'region-pool-init',pool});waitForRegionPool(pool,()=>Atomics.load(pool!.control,C.ready)===workers);post({type:'region-parallel-status',status:'enabled',workers});
   }
   const current=pool!,control=current.control,output=regionPoolOutput(current);
   // The previous generation has crossed its full completion barrier. Replace
   // every matrix word (including zeros), never OR a new candidate over old data.
   current.matrix.set(packed);output.top.fill(REGION_UNWRITTEN);output.bottom.fill(REGION_UNWRITTEN);output.depth.fill(0xffffffff);
   for(let worker=0;worker<current.workers;worker++){const slot=C.slots+worker*C.stride;for(let i=0;i<C.stride;i++)Atomics.store(control,slot+i,0);}
   Atomics.store(control,C.completed,0);Atomics.store(control,C.generation,++generation);Atomics.notify(control,C.generation);
   waitForRegionPool(current,()=>Atomics.load(control,C.completed)===current.workers);
   let cells=0,complete=true;const records:RegionTriangleRecord[]=[];
   for(let worker=0;worker<current.workers;worker++){
    const slot=C.slots+worker*C.stride,count=Atomics.load(control,slot+1),triangles=Atomics.load(control,slot+2),finished=Atomics.load(control,slot+3),expected=current.schedule.chunks.filter((_,index)=>index%current.workers===worker).reduce((sum,chunk)=>sum+chunk.cells,0);
    if(Atomics.load(control,slot)!==generation||count<0||count>expected||triangles<0||triangles>batchSize||(finished!==0&&finished!==1)||finished&&count!==expected||!finished&&triangles!==batchSize)throw Error('并行区域校验没有完成当前代次。');
    cells+=count;complete&&=Boolean(finished);const base=worker*batchSize*4;
    for(let i=0;i<triangles;i++){const at=base+i*4,visit=current.triangles[at],triangle=[current.triangles[at+1],current.triangles[at+2],current.triangles[at+3]] as RegionTriangle;if(visit>=coverage.cellCount||triangle[0]>=triangle[1]||triangle[1]>=triangle[2]||triangle[2]>=coverage.faceCount)throw Error('并行区域三环见证无效。');const words=Math.ceil(coverage.faceCount/16),relation=(a:number,b:number)=>(packed[a*words+(b>>>4)]>>>((b&15)*2))&3,[a,b,c]=triangle,ab=relation(a,b),bc=relation(b,c),ac=relation(a,c);if((ab!==1&&ab!==2)||bc!==ab||ac!==3-ab)throw Error('并行区域见证不构成真实三环。');records.push({visit,triangle});}
   }
   records.sort((a,b)=>a.visit-b.visit);const seen=new Set<string>(),triangles:RegionTriangle[]=[];
   for(const record of records){const key=record.triangle.join(',');if(!seen.has(key)){seen.add(key);triangles.push(record.triangle);if(triangles.length===batchSize)break;}}
   checkedCells=cells;
   if(triangles.length)answer={complete:complete&&cells===coverage.cellCount,triangles};
   else{
    if(!complete||cells!==coverage.cellCount)throw Error('并行区域校验遗漏了真实区域。');
    for(let cell=0;cell<coverage.cellCount;cell++){
    const top=output.top[cell],bottom=output.bottom[cell],depth=output.depth[cell];
    if(depth>coverage.faceCount||depth===0&&(top!==-1||bottom!==-1)||depth>0&&(top<0||bottom<0||top>=coverage.faceCount||bottom>=coverage.faceCount))throw Error('并行区域证书包含未写入或无效区域。');
    }
    answer={complete:true,triangles:[],certificate:{top:allocateRegion(()=>output.top.slice()),bottom:allocateRegion(()=>output.bottom.slice()),depth:allocateRegion(()=>output.depth.slice()),verifiedCells:cells}};
   }
  }catch(error){
   return fallback(error,error instanceof RegionAllocationError);
  }
  // A consumer cancellation/exception must propagate, never restart CPU work.
  onProgress?.('coverage-check',{cells:checkedCells,total:coverage.cellCount,conflicts:answer.triangles.length});return answer;
 };
}
