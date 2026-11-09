import {RegionTournament,type RegionCoverage,type RegionTriangle} from './regionTournament';
import {allocateRegion,rethrowRegionAllocation} from './regionAllocation';

export interface RegionTransitionChunk {start:number;end:number;cells:number;seed:number[];finish:number[]}
export interface RegionTransitionSchedule {faceCount:number;cellCount:number;events:Uint32Array;visitOrder:Uint32Array;chunks:RegionTransitionChunk[]}
export interface RegionChunkOutput {top:Int32Array;bottom:Int32Array;depth:Uint32Array}
export interface RegionTriangleRecord {visit:number;triangle:RegionTriangle}
const index=(value:number,count:number)=>{if(!Number.isInteger(value)||value<0||value>=count)throw Error('并行区域计划包含无效索引。');};

/** Record the certified DFS stream once. A chunk boundary is after a real cell,
 * never inside a transition; return/backtrack transitions remain in the stream.
 * Face membership and all real cell identities are checked before any sharing. */
export function buildRegionTransitionSchedule(coverage:RegionCoverage,chunkCount=64):RegionTransitionSchedule{
 const {faceCount,cellCount}=coverage;
 if(!Number.isSafeInteger(faceCount)||faceCount<0||faceCount>0x7fffffff||!Number.isSafeInteger(cellCount)||cellCount<0||cellCount>0x7fffffff||!Number.isSafeInteger(chunkCount)||chunkCount<1)throw Error('并行区域计划大小无效。');
 const active=new Set<number>(),visited=allocateRegion(()=>new Uint8Array(cellCount)),visitOrder=allocateRegion(()=>new Uint32Array(cellCount)),words:number[]=[],chunks:RegionTransitionChunk[]=[];
 const target=Math.max(1,Math.ceil(cellCount/chunkCount));let cells=0,start=0,seed:number[]=[],inChunk=0;
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
  if(inChunk===target&&cells<cellCount){const finish=allocateRegion(()=>[...active]);try{chunks.push({start,end:words.length,cells:inChunk,seed,finish});}catch(error){rethrowRegionAllocation(error);}start=words.length;seed=finish;inChunk=0;}
 }});
 if(cells!==cellCount||active.size)throw Error('并行区域计划没有完整返回外部。');
 try{chunks.push({start,end:words.length,cells:inChunk,seed,finish:[]});}catch(error){rethrowRegionAllocation(error);}
 return{faceCount,cellCount,events:allocateRegion(()=>new Uint32Array(words)),visitOrder,chunks};
}

/** Exact incremental check of independent DFS slices. Output is private to a
 * generation until its owner has checked every worker and every cell marker. */
export function checkRegionTransitionChunks(schedule:RegionTransitionSchedule,chunks:readonly RegionTransitionChunk[],state:RegionTournament,output:RegionChunkOutput,batchSize:number,onProgress?:(cells:number)=>void):{cells:number;complete:boolean;triangles:RegionTriangleRecord[]}{
 if(!Number.isSafeInteger(batchSize)||batchSize<1||state.faceCount!==schedule.faceCount||state.active.size)throw Error('并行区域校验参数无效。');
 if(output.top.length!==schedule.cellCount||output.bottom.length!==schedule.cellCount||output.depth.length!==schedule.cellCount||schedule.visitOrder.length!==schedule.cellCount)throw Error('并行区域证书大小不一致。');
 const {events,faceCount,cellCount}=schedule,triangles:RegionTriangleRecord[]=[],seen=new Set<string>(),visited=new Uint8Array(cellCount);let cells=0,last:RegionTriangle|undefined;
 for(const chunk of chunks){
  if(!Number.isSafeInteger(chunk.start)||!Number.isSafeInteger(chunk.end)||chunk.start<0||chunk.end<chunk.start||chunk.end>events.length||!Number.isSafeInteger(chunk.cells)||chunk.cells<0)throw Error('并行区域分片范围无效。');
  if(new Set(chunk.seed).size!==chunk.seed.length||new Set(chunk.finish).size!==chunk.finish.length)throw Error('并行区域分片纸面重复。');
  for(const face of chunk.seed)index(face,faceCount);for(const face of chunk.finish)index(face,faceCount);
  state.transition([],chunk.seed);let count=0,position=chunk.start;
  while(position<chunk.end){
   const command=events[position++];
   if(command===0){
    if(position+2>chunk.end)throw Error('并行区域变更头不完整。');
    const removed=events[position++],added=events[position++],end=position+removed+added;
    if(end>chunk.end)throw Error('并行区域变更内容不完整。');
    state.transition(events.subarray(position,position+removed) as unknown as number[],events.subarray(position+removed,end) as unknown as number[]);position=end;
   }else if(command===1){
    if(position>=chunk.end)throw Error('并行区域记录不完整。');
    const cell=events[position++];index(cell,cellCount);if(visited[cell])throw Error('并行区域分片重复认证区域。');visited[cell]=1;count++;cells++;
    if(state.ordered){const value=state.extrema();output.top[cell]=value.top;output.bottom[cell]=value.bottom;output.depth[cell]=value.depth;}
    else{
     const triangle=last?.every(face=>state.active.has(face))?last:state.triangle();last=triangle;const key=triangle.join(',');
     if(!seen.has(key)){seen.add(key);triangles.push({visit:schedule.visitOrder[cell],triangle});if(triangles.length===batchSize)return{cells,complete:false,triangles};}
    }
    if(cells%16384===0)onProgress?.(cells);
   }else throw Error('并行区域计划命令无效。');
  }
  if(position!==chunk.end||count!==chunk.cells||state.active.size!==chunk.finish.length||chunk.finish.some(face=>!state.active.has(face)))throw Error('并行区域分片没有完成计划。');
  state.transition([...state.active],[]);
 }
 onProgress?.(cells);return{cells,complete:true,triangles};
}
