import {allocateRegion} from './regionAllocation';
import type {RegionPair} from './regionTournament';
import {regionProofParts,type RegionTransitionChunk,type RegionTransitionSchedule} from './regionTransitionSchedule';

/** Only transitions and their initial stack can introduce a face into a chunk.
 * Membership is an over-approximation: disjoint faces in the same chunk may
 * cause extra rechecks, but every region containing both faces is included. */
export function regionChunkMembership(schedule:RegionTransitionSchedule){
 const parts=regionProofParts(schedule),words=Math.ceil(parts.length/32),membership=allocateRegion(()=>new Uint32Array(schedule.faceCount*words));
 parts.forEach((chunk,index)=>{
  const slot=index>>>5,mask=1<<(index&31),add=(face:number)=>{membership[face*words+slot]|=mask;};
  for(const face of chunk.seed)add(face);
  let at=chunk.start;
  while(at<chunk.end){
   if(schedule.events[at++]===1){at++;continue;}
   const removed=schedule.events[at++],added=schedule.events[at++];at+=removed;
   const end=at+added;while(at<end)add(schedule.events[at++]);
  }
 });
 return membership;
}

/** Try stealing only regions which passed last time and have changed since.
 * A stable dirty region that failed previously stays with its original lane.
 * A first generation and a balanced/equally cyclic workload run one pass. */
export function selectRegionPrechecks(parts:readonly RegionTransitionChunk[],owners:Uint8Array,workers:number,dirty:Uint32Array,generations:Uint32Array,jobs:Uint32Array):number{
 const original=new Float64Array(workers),remaining=new Float64Array(workers);
 let count=0,queuedWork=0;
 for(let i=0;i<parts.length;i++){
  const stale=Boolean(dirty[i>>>5]&(1<<(i&31)));
  if(!stale&&generations[i])continue;
  const part=parts[i],owner=owners[i],work=part.cells*(1+(part.seed.length+part.finish.length)/2);
  original[owner]+=work;
  if(stale&&generations[i]){jobs[count++]=i;queuedWork+=work;}
  else remaining[owner]+=work;
 }
 const parallelCost=queuedWork/workers+Math.max(...remaining);
 return count>=workers&&parallelCost*1.2<Math.max(...original)?count:0;
}

/** Snapshot already certified canonical identities. Callers may legally reuse
 * and mutate both input arrays; comparing their JS identity is insufficient. */
export class RegionCandidateSnapshot {
 private readonly faces:Uint32Array;
 private readonly values:Uint8Array;
 constructor(pairs:readonly RegionPair[],values:ArrayLike<number>){
  this.faces=allocateRegion(()=>new Uint32Array(pairs.length*2));
  this.values=allocateRegion(()=>Uint8Array.from(values));
  for(let i=0;i<pairs.length;i++){this.faces[i*2]=pairs[i][0];this.faces[i*2+1]=pairs[i][1];}
 }
 update(pairs:readonly RegionPair[],values:ArrayLike<number>,matrix:Uint32Array,faceCount:number,membership:Uint32Array,dirty:Uint32Array):boolean{
  if(pairs.length!==this.values.length||values.length!==pairs.length)return false;
  // Validate the whole input before altering the shared matrix or cache state.
  for(let i=0;i<pairs.length;i++){
   if(pairs[i][0]!==this.faces[i*2]||pairs[i][1]!==this.faces[i*2+1])return false;
   if(values[i]!==1&&values[i]!==2)throw Error('候选层序仍有未赋值的纸面对。');
  }
  const columns=Math.ceil(faceCount/16),chunkWords=dirty.length;
  dirty.fill(0);
  for(let i=0;i<values.length;i++){
   const value=values[i];if(value===this.values[i])continue;
   const a=this.faces[i*2],b=this.faces[i*2+1];
   // The sole possible change of an assigned relation is 01 <-> 10.
   matrix[a*columns+(b>>>4)]^=3<<((b&15)*2);
   matrix[b*columns+(a>>>4)]^=3<<((a&15)*2);
   for(let word=0;word<chunkWords;word++)dirty[word]|=membership[a*chunkWords+word]&membership[b*chunkWords+word];
   this.values[i]=value;
  }
  return true;
 }
}
