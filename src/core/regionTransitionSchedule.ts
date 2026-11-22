import {RegionTournament,type RegionCoverage,type RegionTriangle} from './regionTournament';
import {allocateRegion,rethrowRegionAllocation} from './regionAllocation';

export interface RegionTransitionChunk {start:number;end:number;firstVisit:number;cells:number;seed:number[];finish:number[];parts?:RegionTransitionChunk[]}
export interface RegionTransitionSchedule {faceCount:number;cellCount:number;events:Uint32Array;visitOrder:Uint32Array;chunks:RegionTransitionChunk[]}
export interface RegionChunkOutput {top:Int32Array;bottom:Int32Array;depth:Uint32Array}
export interface RegionTriangleRecord {visit:number;triangle:RegionTriangle}
export interface RegionChunkProof {
 indices:ReadonlyMap<RegionTransitionChunk,number>; generations:Uint32Array; writtenAt:Uint32Array; generation:number;
}
const index=(value:number,count:number)=>{if(!Number.isInteger(value)||value<0||value>=count)throw Error('并行区域计划包含无效索引。');};

/** Record the certified DFS stream once. A chunk boundary is after a real cell,
 * never inside a transition; return/backtrack transitions remain in the stream.
 * Face membership and all real cell identities are checked before any sharing. */
export function buildRegionTransitionSchedule(coverage:RegionCoverage,chunkCount=64,partCells=2048):RegionTransitionSchedule{
 const {faceCount,cellCount}=coverage;
 if(!Number.isSafeInteger(faceCount)||faceCount<0||faceCount>0x7fffffff||!Number.isSafeInteger(cellCount)||cellCount<0||cellCount>0x7fffffff||!Number.isSafeInteger(chunkCount)||chunkCount<1||!Number.isSafeInteger(partCells)||partCells<1)throw Error('并行区域计划大小无效。');
 const active=new Set<number>(),visited=allocateRegion(()=>new Uint8Array(cellCount)),visitOrder=allocateRegion(()=>new Uint32Array(cellCount)),words:number[]=[],chunks:RegionTransitionChunk[]=[];
 const target=Math.max(1,Math.ceil(cellCount/chunkCount));let cells=0,start=0,seed:number[]=[],inChunk=0;
 let partStart=0,partVisit=0,partSeed=seed,parts:RegionTransitionChunk[]=[];
 const closePart=(finish:number[])=>{
  try{parts.push({start:partStart,end:words.length,firstVisit:partVisit,cells:cells-partVisit,seed:partSeed,finish});}catch(error){rethrowRegionAllocation(error);}
  partStart=words.length;partVisit=cells;partSeed=finish;
 };
 const closeChunk=(finish:number[])=>{
  if(parts.length)closePart(finish);
  const chunk:RegionTransitionChunk={start,end:words.length,firstVisit:cells-inChunk,cells:inChunk,seed,finish};
  if(parts.length)chunk.parts=parts;
  try{chunks.push(chunk);}catch(error){rethrowRegionAllocation(error);}
  parts=[];start=partStart=words.length;partVisit=cells;seed=partSeed=finish;inChunk=0;
 };
 coverage.walk({onTransition:({removed,added})=>{
  const removedCount=removed.length,addedCount=added.length;if(!removedCount&&!addedCount)return;
  try{words.push(0,removedCount,addedCount);}catch(error){rethrowRegionAllocation(error);}
  for(const face of removed){index(face,faceCount);if(!active.delete(face))throw Error('并行区域计划移除了不存在的纸面。');try{words.push(face);}catch(error){rethrowRegionAllocation(error);}}
  for(const face of added){index(face,faceCount);if(active.has(face))throw Error('并行区域计划重复加入纸面。');active.add(face);try{words.push(face);}catch(error){rethrowRegionAllocation(error);}}
 },onCell:(cell,faces)=>{
  index(cell,cellCount);if(visited[cell])throw Error('并行区域计划重复访问区域。');visited[cell]=1;visitOrder[cell]=cells++;inChunk++;
  if(faces.size!==active.size)throw Error('并行区域计划纸面数不一致。');
  for(const face of faces){index(face,faceCount);if(!active.has(face))throw Error('并行区域计划纸面身份不一致。');}
  try{words.push(1,cell);}catch(error){rethrowRegionAllocation(error);}
  if(inChunk===target&&cells<cellCount)closeChunk(allocateRegion(()=>[...active]));
  else if(cells-partVisit===partCells&&inChunk<target&&cells<cellCount)closePart(allocateRegion(()=>[...active]));
 }});
 if(cells!==cellCount||active.size)throw Error('并行区域计划没有完整返回外部。');
 closeChunk([]);
 return{faceCount,cellCount,events:allocateRegion(()=>new Uint32Array(words)),visitOrder,chunks};
}

export function regionProofParts(schedule:RegionTransitionSchedule){return schedule.chunks.flatMap(chunk=>chunk.parts??[chunk]);}

/** Exact incremental check of independent DFS slices. Output is private to a
 * generation until its owner has checked every worker and every cell marker. */
export function checkRegionTransitionChunks(schedule:RegionTransitionSchedule,chunks:readonly RegionTransitionChunk[],state:RegionTournament,output:RegionChunkOutput,batchSize:number,onProgress?:(cells:number)=>void,proofs?:RegionChunkProof):{cells:number;complete:boolean;triangles:RegionTriangleRecord[]}{
 if(!Number.isSafeInteger(batchSize)||batchSize<1||state.faceCount!==schedule.faceCount||state.active.size)throw Error('并行区域校验参数无效。');
 if(output.top.length!==schedule.cellCount||output.bottom.length!==schedule.cellCount||output.depth.length!==schedule.cellCount||schedule.visitOrder.length!==schedule.cellCount)throw Error('并行区域证书大小不一致。');
 const {events,faceCount,cellCount}=schedule,triangles:RegionTriangleRecord[]=[],seen=new Set<string>(),visited=proofs?undefined:new Uint8Array(cellCount);let cells=0,last:RegionTriangle|undefined;
 for(const parent of chunks){
  // The historical worker owns this entire DFS stream. Never reseed between
  // two freshly replayed parts: a cyclic bucket's witness depends on history.
  let replaying=false;
  for(const chunk of parent.parts??[parent]){
  if(!Number.isSafeInteger(chunk.start)||!Number.isSafeInteger(chunk.end)||chunk.start<0||chunk.end<chunk.start||chunk.end>events.length||!Number.isSafeInteger(chunk.cells)||chunk.cells<0)throw Error('并行区域分片范围无效。');
  const id=proofs?.indices.get(chunk);
  if(proofs&&id===undefined)throw Error('并行区域缺少分片身份。');
  if(proofs&&proofs.generations[id!]){
   // A cached inner part ended at an actual, totally ordered cell. All its
   // occupied degree buckets are singletons. Restoring the next recorded
   // active-set insertion order therefore recreates the exact tournament.
   if(replaying){state.transition([...state.active],[]);replaying=false;}
   cells+=chunk.cells;onProgress?.(cells);continue;
  }
  let cyclic=false;
  if(new Set(chunk.seed).size!==chunk.seed.length||new Set(chunk.finish).size!==chunk.finish.length)throw Error('并行区域分片纸面重复。');
  for(const face of chunk.seed)index(face,faceCount);for(const face of chunk.finish)index(face,faceCount);
  if(!replaying){state.transition([],chunk.seed);replaying=true;}
  let count=0,position=chunk.start;
  while(position<chunk.end){
   const command=events[position++];
   if(command===0){
    if(position+2>chunk.end)throw Error('并行区域变更头不完整。');
    const removed=events[position++],added=events[position++],end=position+removed+added;
    if(end>chunk.end)throw Error('并行区域变更内容不完整。');
    state.transitionRecord(events,position,position+removed,end);position=end;
   }else if(command===1){
    if(position>=chunk.end)throw Error('并行区域记录不完整。');
    const cell=events[position++];index(cell,cellCount);
    const visit=chunk.firstVisit+count;
    if(schedule.visitOrder[cell]!==visit||visited?.[cell])throw Error('并行区域分片访问顺序或区域身份重复。');
    if(visited)visited[cell]=1;
    count++;cells++;
    if(state.ordered){const value=state.extrema();output.top[cell]=value.top;output.bottom[cell]=value.bottom;output.depth[cell]=value.depth;
     if(proofs)proofs.writtenAt[visit]=proofs.generation;
    }
    else{
     cyclic=true;
     const triangle=last?.every(face=>state.active.has(face))?last:state.triangle();last=triangle;const key=triangle.join(',');
     if(!seen.has(key)){seen.add(key);triangles.push({visit:schedule.visitOrder[cell],triangle});if(triangles.length===batchSize)return{cells,complete:false,triangles};}
    }
    if(cells%16384===0)onProgress?.(cells);
   }else throw Error('并行区域计划命令无效。');
  }
  if(position!==chunk.end||count!==chunk.cells||state.active.size!==chunk.finish.length||chunk.finish.some(face=>!state.active.has(face)))throw Error('并行区域分片没有完成计划。');
  if(proofs&&!cyclic)proofs.generations[id!]=proofs.generation;
  }
  if(replaying)state.transition([...state.active],[]);
 }
 onProgress?.(cells);return{cells,complete:true,triangles};
}
