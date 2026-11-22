import type {FaceOrder} from './layerSolutions';
import {allocateRegion,RegionAllocationError} from './regionAllocation';

/** Stream exact, real coverage cells without retaining per-cell face arrays.
 * Each transition is atomic: removals precede additions. The walk visits every
 * cell once, includes backtrack deltas, and finishes at the empty exterior. */
export interface RegionCoverageVisitor {
  onTransition?:(delta:{removed:readonly number[];added:readonly number[]})=>void;
  onCell?:(cell:number,faces:ReadonlySet<number>)=>void;
}
export interface RegionCoverage {
  faceCount:number;cellCount:number;
  walk:(visitor:RegionCoverageVisitor)=>void;
}
export interface RegionCoverageCertificate {top:Int32Array;bottom:Int32Array;depth:Uint32Array;verifiedCells:number}
export type RegionProgress=(stage:string,details:Record<string,number>)=>void;
export type RegionPair=readonly [number,number];
export type RegionTriangle=[number,number,number];
/** Internal storage choice only; never changes the relations or cells checked. */
export interface RegionTournamentStorage {forcePaged?:boolean}

function validCount(value:number,name:string){if(!Number.isSafeInteger(value)||value<0||value>0x7fffffff)throw Error(`${name}不能使用当前拓扑索引格式表示。`);}
function faceId(value:number,count:number){if(!Number.isInteger(value)||value<0||value>=count)throw Error('精确覆盖包含无效的纸面编号。');}

/** Dense for ordinary models, lazily paged for wider sparse indexes. The
 * storage choice never truncates face counts or drops a required relation. */
class RelationBits {
  private readonly words:number;private readonly dense:Uint32Array|undefined;
  private readonly pages=new Map<number,Uint32Array>();
  constructor(faces:number,forcePaged=false){
    this.words=Math.ceil(faces/32);const count=faces*this.words;
    if(!Number.isSafeInteger(count))throw Error('层序位索引超过安全整数范围。');
    if(!forcePaged&&count*4<=128*1024*1024){
      try{this.dense=allocateRegion(()=>new Uint32Array(count));}
      catch(error){if(!(error instanceof RegionAllocationError))throw error;}
    }
  }
  has(a:number,b:number):boolean{
    const word=a*this.words+Math.floor(b/32),mask=1<<(b%32);
    if(this.dense)return !!(this.dense[word]&mask);
    return !!((this.pages.get(Math.floor(word/1024))?.[word%1024]??0)&mask);
  }
  add(a:number,b:number):boolean{
    const word=a*this.words+Math.floor(b/32),mask=1<<(b%32);
    if(this.dense){if(this.dense[word]&mask)return false;this.dense[word]|=mask;return true;}
    const key=Math.floor(word/1024);let page=this.pages.get(key);if(!page){page=new Uint32Array(1024);this.pages.set(key,page);}
    if(page[word%1024]&mask)return false;page[word%1024]|=mask;return true;
  }
}

/** Convert FOLD's second-face-normal sign to canonical +Z comparisons. This
 * only represents existing relations; missing comparisons are not invented. */
export function regionComparisonsFromFaceOrders(orders:readonly FaceOrder[],faceNormals:readonly (1|-1)[]):{pairs:RegionPair[];values:Uint8Array}{
  validCount(faceNormals.length,'纸面数量');if(faceNormals.some(n=>n!==1&&n!==-1))throw Error('纸面法向尚未确定，不能验证区域层序。');
  if(!Array.isArray(orders))throw Error('层序关系必须为数组。');
  const seen=new RelationBits(faceNormals.length),pairs:RegionPair[]=[],values=new Uint8Array(orders.length);
  for(let i=0;i<orders.length;i++){
    const row=orders[i];if(!Array.isArray(row)||row.length!==3||(row[2]!==1&&row[2]!==-1))throw Error('层序关系格式无效。');
    const [a,b,sign]=row;faceId(a,faceNormals.length);faceId(b,faceNormals.length);if(a===b)throw Error('层序包含自身比较。');
    const first=Math.min(a,b),second=Math.max(a,b);if(!seen.add(first,second))throw Error('层序包含重复纸面对。');
    const value=sign*faceNormals[b]>0?1:2;pairs.push([first,second]);values[i]=a>b?3-value:value;
  }
  return {pairs,values};
}

/** Detect missing, repeated and prematurely interrupted real-cell callbacks.
 * The source topology must itself certify geometry; this guards the stream. */
class CoverageVisits {
  private readonly seen:Uint8Array;count=0;
  constructor(readonly coverage:RegionCoverage){validCount(coverage.faceCount,'纸面数量');validCount(coverage.cellCount,'区域数量');this.seen=new Uint8Array(coverage.cellCount);}
  visit(cell:number){if(!Number.isInteger(cell)||cell<0||cell>=this.seen.length||this.seen[cell])throw Error('精确覆盖区域遍历不完整或重复。');this.seen[cell]=1;this.count++;}
  finish(remainingFaces:number){if(this.count!==this.seen.length||remainingFaces)throw Error('精确覆盖遍历没有检查全部区域并返回外部。');}
}

export function registerCoveragePairs(coverage:RegionCoverage,initialPairs:readonly RegionPair[],append:(a:number,b:number)=>void,onProgress?:RegionProgress):{added:number;cells:number}{
  return collectCoveragePairs(coverage,new RelationBits(coverage.faceCount),initialPairs,append,onProgress);
}

export function coveragePairMembership(coverage:RegionCoverage,append:(a:number,b:number)=>void=()=>{},onProgress?:RegionProgress){
  const seen=new RelationBits(coverage.faceCount);
  const {added}=collectCoveragePairs(coverage,seen,[],append,onProgress);
  const contains=(a:number,b:number)=>seen.has(Math.min(a,b),Math.max(a,b));
  return Object.assign(contains,{count:added});
}

/** Pair rows remain in solver order. Keep only the typically sparse list of
 * auxiliary row indices, so the full coverage bitmap can be collected before
 * search and never has to be rebuilt during publication. */
export function nonContactRows(pairs:ReadonlyArray<RegionPair|FaceOrder>,touches:(a:number,b:number)=>boolean):Uint32Array{
  const indices:number[]=[];
  for(let i=0;i<pairs.length;i++)if(!touches(pairs[i][0],pairs[i][1]))indices.push(i);
  return Uint32Array.from(indices);
}

/** Keep the solver's row order for exact-cell checks. Pair references and copy
 * ranges are prepared once. The returned value view is borrowed until the
 * next call, after synchronous checking of the current candidate has ended. */
export function contactComparisonRows(pairs:readonly RegionPair[],excluded:Uint32Array){
  const count=pairs.length,ranges:number[]=[];
  let first=0;
  for(const row of excluded){
    if(row<first||row>=count)throw Error('非重叠纸面对的行号无效。');
    if(first<row)ranges.push(first,row);
    first=row+1;
  }
  if(first<count)ranges.push(first,count);
  let kept=pairs;
  if(excluded.length){
    const rows:RegionPair[]=[];
    for(let r=0;r<ranges.length;r+=2)for(let i=ranges[r];i<ranges[r+1];i++)rows.push(pairs[i]);
    kept=rows;
  }
  let buffer:Uint8Array|undefined;
  return {pairs:kept,values(all:Uint8Array):Uint8Array{
    if(all.length!==count)throw Error('候选层序变量数量不一致。');
    if(!excluded.length)return all;
    if(!ranges.length)return all.subarray(0,0);
    if(ranges.length===2)return all.subarray(ranges[0],ranges[1]);
    buffer??=new Uint8Array(kept.length);
    let dest=0;
    for(let r=0;r<ranges.length;r+=2){
      const start=ranges[r],end=ranges[r+1];
      if(end-start<16){for(let i=start;i<end;i++)buffer[dest++]=all[i];}
      else{buffer.set(all.subarray(start,end),dest);dest+=end-start;}
    }
    return buffer;
  }};
}

type FaceVisit={face:number;entered:number;departed:number;active:boolean;previous?:FaceVisit;next?:FaceVisit};
function collectCoveragePairs(coverage:RegionCoverage,seen:RelationBits,initialPairs:readonly RegionPair[],append:(a:number,b:number)=>void,onProgress?:RegionProgress){
  const visits=new CoverageVisits(coverage),nodes=new Map<number,FaceVisit>();
  let head:FaceVisit|undefined,tail:FaceVisit|undefined,clock=0,activeCount=0,added=0;
  for(const [a,b]of initialPairs){faceId(a,coverage.faceCount);faceId(b,coverage.faceCount);if(a===b)throw Error('层序包含自身比较。');seen.add(Math.min(a,b),Math.max(a,b));}
  onProgress?.('coverage-pairs',{cells:0,total:coverage.cellCount,added:0});
  coverage.walk({
    onTransition:({removed,added:entering})=>{
      for(const face of removed){
        faceId(face,coverage.faceCount);const node=nodes.get(face);
        if(!node?.active)throw Error('精确覆盖移除了不在当前区域中的纸面。');
        if(node.previous)node.previous.next=node.next;else head=node.next;
        if(node.next)node.next.previous=node.previous;else tail=node.previous;
        node.previous=node.next=undefined;node.active=false;node.departed=clock;activeCount--;
      }
      // Inserting before removing would register comparisons for faces that
      // never coexist in any real cell. Only the final-state subset is used.
      for(const face of entering){
        faceId(face,coverage.faceCount);let node=nodes.get(face);
        if(node?.active)throw Error('精确覆盖重复加入纸面。');
        if(!node){node={face,entered:0,departed:0,active:false};nodes.set(face,node);}
        // Every currently active face which was already present at this
        // face's last departure has met it before. Only the newer suffix
        // can contribute a new pair. Emit in original insertion order.
        let first=head;
        if(head&&head.entered<=node.departed&&clock<Number.MAX_SAFE_INTEGER){
          first=undefined;
          for(let p=tail;p&&p.entered>node.departed;p=p.previous)first=p;
        }
        for(let p=first;p;p=p.next){
          const a=Math.min(face,p.face),b=Math.max(face,p.face);
          if(seen.add(a,b)){append(a,b);added++;}
        }
        node.entered=++clock;node.active=true;node.previous=tail;
        if(tail)tail.next=node;else head=node;
        tail=node;activeCount++;
      }
    },
    onCell:(cell,faces)=>{
      visits.visit(cell);if(faces.size!==activeCount)throw Error('精确覆盖集合与增量记录不一致。');
      if(visits.count%65536===0)onProgress?.('coverage-pairs',{cells:visits.count,total:coverage.cellCount,added});
    },
  });
  visits.finish(activeCount);onProgress?.('coverage-pairs',{cells:visits.count,total:coverage.cellCount,added});return {added,cells:visits.count};
}

/** Incremental complete-tournament certificate. A complete orientation is a
 * total order iff its indegrees are exactly 0..k-1. Buckets provide the visible
 * extrema without scanning the current region at every cell. */
const packedComparisonInput=Symbol('validated packed region comparisons');
type PackedComparisonInput={token:typeof packedComparisonInput;matrix:Readonly<Uint32Array>};
// Only array views, never comparison values. Every generation still validates
// the current contents of the shared buffer before a checker can read it.
const sharedRowViews=new WeakMap<Readonly<Uint32Array>,Uint32Array[]>();
// A worker owns just its row slice. A byte-for-byte unchanged comparison has
// already been checked. Its reverse is rechecked whenever either entry changes.
const checkedRowSlices=new WeakMap<Readonly<Uint32Array>,{first:number;end:number;words:Uint32Array}>();

/** Every row has one validation owner. A comparison with a face in another
 * slice still checks its reverse entry in the same immutable matrix. */
function validatePackedComparisons(faceCount:number,matrix:Readonly<Uint32Array>,firstRow:number,endRow:number,cacheRows:boolean):void{
  validCount(faceCount,'纸面数量');
  const words=Math.ceil(faceCount/16),length=faceCount*words;
  if(!(matrix instanceof Uint32Array)||!Number.isSafeInteger(length)||matrix.length!==length)throw Error('共享层序关系矩阵长度与纸面数量不一致。');
  let prior=cacheRows?checkedRowSlices.get(matrix):undefined;
  if(cacheRows&&(!prior||prior.first!==firstRow||prior.end!==endRow)){
    prior={first:firstRow,end:endRow,words:new Uint32Array((endRow-firstRow)*words)};
    checkedRowSlices.set(matrix,prior);
  }
  const snapshot=prior?.words,start=firstRow*words;
  for(let a=firstRow;a<endRow;a++)for(let column=0;column<words;column++){
    const offset=a*words+column,word=matrix[offset],changed=snapshot?word^snapshot[offset-start]:word;
    if(changed===0)continue;
    if(word&(word>>>1)&0x55555555)throw Error('共享层序关系包含非法赋值。');
    let present=(changed|(changed>>>1))&0x55555555;
    while(present){
      const shift=31-Math.clz32(present&-present),b=column*16+(shift>>>1),value=(word>>>shift)&3;
      if(b>=faceCount)throw Error('共享层序关系包含超出纸面范围的赋值。');
      if(a===b)throw Error('共享层序关系包含自身比较。');
      if(((matrix[b*words+(a>>>4)]>>>((a&15)*2))&3)!==(value===0?0:3-value))throw Error('共享层序关系的正反向比较不一致。');
      present&=present-1;
    }
    if(snapshot)snapshot[offset-start]=word;
  }
}

export class RegionTournament {
  readonly active=new Set<number>();
  private readonly incoming:RelationBits|undefined;
  /** Both comparison directions share one row lookup: 0 missing, 1 below,
   * 2 above. Repeated region transitions otherwise read the bit matrix by
   * column, jumping between distant rows for every active face. */
  private readonly comparisonRows:Uint32Array[]|undefined;
  private readonly degree:Int32Array;private readonly histogram:Uint32Array;
  private readonly head:Int32Array;private readonly next:Int32Array;private readonly previous:Int32Array;
  private duplicates=0;
  constructor(readonly faceCount:number,pairs:readonly RegionPair[],values:ArrayLike<number>,internal?:PackedComparisonInput,storage?:RegionTournamentStorage){
    validCount(faceCount,'纸面数量');if(pairs.length!==values.length)throw Error('候选层序变量数量不一致。');
    const words=Math.ceil(faceCount/16),length=faceCount*words;
    // This threshold selects a storage representation, never a face limit.
    // Wider sparse models retain the complete paged relation implementation.
    if(internal){
      if(internal.token!==packedComparisonInput||pairs.length||values.length)throw Error('共享层序关系必须先通过完整检查。');
      let rows=sharedRowViews.get(internal.matrix);
      if(!rows){rows=Array.from({length:faceCount},(_,face)=>internal.matrix.subarray(face*words,(face+1)*words));sharedRowViews.set(internal.matrix,rows);}
      this.comparisonRows=rows;
    }else if(!storage?.forcePaged&&length*4<=512*1024*1024){
      let matrix:Uint32Array|undefined;
      try{matrix=allocateRegion(()=>new Uint32Array(length));}
      catch(error){if(!(error instanceof RegionAllocationError))throw error;}
      if(matrix){const packed=matrix;this.comparisonRows=Array.from({length:faceCount},(_,face)=>packed.subarray(face*words,(face+1)*words));}
      // Do not replace one failed large allocation with another dense matrix.
      else this.incoming=new RelationBits(faceCount,true);
    }else this.incoming=new RelationBits(faceCount,storage?.forcePaged);
    for(let i=0;i<pairs.length;i++){
      const [a,b]=pairs[i];faceId(a,faceCount);faceId(b,faceCount);if(a>=b)throw Error('候选层序变量必须是规范化纸面对。');
      if(values[i]!==1&&values[i]!==2)throw Error('候选层序仍有未赋值的纸面对。');
      const row=this.comparisonRows?.[a];
      if(row?((row[b>>>4]>>>((b&15)*2))&3):this.incoming!.has(a,b)||this.incoming!.has(b,a))throw Error('候选层序重复定义纸面对。');
      // Rabbit Ear variable 1 means canonical a is above b, 2 below b.
      if(this.comparisonRows){
        this.comparisonRows[a][b>>>4]|=(values[i]===1?2:1)<<((b&15)*2);
        this.comparisonRows[b][a>>>4]|=(values[i]===1?1:2)<<((a&15)*2);
      }else if(values[i]===1)this.incoming!.add(a,b);else this.incoming!.add(b,a);
    }
    this.degree=new Int32Array(faceCount);this.histogram=new Uint32Array(faceCount);
    this.head=new Int32Array(faceCount).fill(-1);this.next=new Int32Array(faceCount).fill(-1);this.previous=new Int32Array(faceCount).fill(-1);
  }
  /** Borrow a flat read-only view for a checker pool. The producer must never
   * modify these bytes while this tournament or a borrowing checker is active.
   * Paged models return undefined and keep their complete sequential path. */
  get packedComparisons():Readonly<Uint32Array>|undefined{
    if(!this.comparisonRows)return undefined;
    if(!this.faceCount)return new Uint32Array(0);
    const first=this.comparisonRows[0];return new Uint32Array(first.buffer,first.byteOffset,this.faceCount*Math.ceil(this.faceCount/16));
  }
  /** One instance per checker per candidate; reset its active faces between
   * chunks. The caller's generation barrier must keep shared bytes immutable
   * throughout validation and checking, until every reader has finished. */
  static fromPackedComparisons(faceCount:number,matrix:Readonly<Uint32Array>,team?:{workerId:number;workers:number;barrier:()=>void}):RegionTournament{
    let first=0,end=faceCount;
    if(team){
      if(!Number.isSafeInteger(team.workers)||team.workers<1||!Number.isInteger(team.workerId)||team.workerId<0||team.workerId>=team.workers)throw Error('共享层序矩阵校验分工无效。');
      first=Math.floor(faceCount*team.workerId/team.workers);
      end=Math.floor(faceCount*(team.workerId+1)/team.workers);
    }
    try{validatePackedComparisons(faceCount,matrix,first,end,Boolean(team));team?.barrier();}
    catch(error){checkedRowSlices.delete(matrix);throw error;}
    return new RegionTournament(faceCount,[],[],{token:packedComparisonInput,matrix});
  }
  private insert(face:number,degree:number){
    this.degree[face]=degree;const old=this.head[degree];this.next[face]=old;this.previous[face]=-1;if(old>=0)this.previous[old]=face;this.head[degree]=face;
    if(++this.histogram[degree]===2)this.duplicates++;
  }
  private unlink(face:number){
    const degree=this.degree[face],previous=this.previous[face],next=this.next[face];
    if(previous>=0)this.next[previous]=next;else this.head[degree]=next;if(next>=0)this.previous[next]=previous;
    if(this.histogram[degree]--===2)this.duplicates--;
  }
  private change(face:number,delta:number){const degree=this.degree[face]+delta;if(degree<0||degree>=this.faceCount)throw Error('增量层序入度越界。');this.unlink(face);this.insert(face,degree);}
  below(a:number,b:number):boolean{return this.comparisonRows?((this.comparisonRows[a][b>>>4]>>>((b&15)*2))&3)===1:this.incoming!.has(b,a);}
  transition(removed:readonly number[],added:readonly number[]){
    this.removeFaces(removed,0,removed.length);this.addFaces(added,0,added.length);
  }
  /** Replay validated offsets directly; a large traversal has millions of
   * these short records. No per-record subarrays are necessary. */
  transitionRecord(events:Uint32Array,start:number,split:number,end:number){
    this.removeFaces(events,start,split);this.addFaces(events,split,end);
  }
  private removeFaces(faces:ArrayLike<number>,start:number,end:number){
    for(let i=start;i<end;i++){const face=faces[i];
      faceId(face,this.faceCount);if(!this.active.delete(face))throw Error('精确覆盖移除了不在当前区域中的纸面。');
      const row=this.comparisonRows?.[face];
      if(row&&this.ordered){
        // A subset of a total order is still ordered. Each occupied bucket
        // has exactly one face, so head doubles as the bottom-to-top stack.
        const depth=this.active.size,rank=this.head.indexOf(face);
        if(rank<0||rank>depth)throw Error('区域层序极值缺失。');
        this.head.copyWithin(rank,rank+1,depth+1);this.head[depth]=-1;this.histogram[depth]=0;
        continue;
      }
      this.unlink(face);
      if(row){for(const other of this.active)if(((row[other>>>4]>>>((other&15)*2))&3)===1)this.change(other,-1);}
      else for(const other of this.active)if(this.below(face,other))this.change(other,-1);
    }
  }
  /** In a total order the new face must be above a prefix and below the
   * entire suffix. Every comparison is checked, including missing entries. */
  private insertIntoOrder(face:number,row:Uint32Array):boolean{
    const depth=this.active.size;
    let rank=0;
    for(let i=0;i<depth;i++){
      const other=this.head[i],relation=(row[other>>>4]>>>((other&15)*2))&3;
      if(relation===2){
        if(rank!==i){
          // A genuine cycle. Reconstitute the unique single-entry degree
          // buckets before replaying this insertion in the original order.
          for(let j=0;j<depth;j++){const f=this.head[j];this.degree[f]=j;this.next[f]=-1;this.previous[f]=-1;}
          return false;
        }
        rank++;
      }else if(relation!==1)throw Error('精确覆盖区域缺少已赋值的纸面对。');
    }
    this.head.copyWithin(rank+1,rank,depth);this.head[rank]=face;this.histogram[depth]=1;
    this.active.add(face);return true;
  }
  private addFaces(faces:ArrayLike<number>,start:number,end:number){
    for(let i=start;i<end;i++){const face=faces[i];
      faceId(face,this.faceCount);if(this.active.has(face))throw Error('精确覆盖重复加入纸面。');let degree=0;
      const row=this.comparisonRows?.[face];
      if(row&&this.ordered&&this.insertIntoOrder(face,row))continue;
      for(const other of this.active){
        const relation=row?((row[other>>>4]>>>((other&15)*2))&3):this.below(other,face)?2:this.below(face,other)?1:0;
        if(relation===2)degree++;else if(relation===1)this.change(other,1);else throw Error('精确覆盖区域缺少已赋值的纸面对。');
      }
      this.insert(face,degree);this.active.add(face);
    }
  }
  get ordered():boolean{return this.duplicates===0;}
  extrema():{top:number;bottom:number;depth:number}{
    if(!this.ordered)throw Error('存在层序循环的区域不能输出可见面。');const depth=this.active.size;
    const top=depth?this.head[depth-1]:-1,bottom=depth?this.head[0]:-1;if(depth&&(top<0||bottom<0))throw Error('区域层序极值缺失。');return {top,bottom,depth};
  }
  triangle():RegionTriangle{
    if(this.ordered)throw Error('无环区域没有三环反例。');
    let bucket=0;while(bucket<this.active.size&&this.histogram[bucket]<2)bucket++;
    let a=this.head[bucket],b=this.next[a];if(!this.below(a,b))[a,b]=[b,a];
    // Equal indegrees and a→b imply some c with b→c→a: otherwise b would
    // have strictly greater indegree. This finds a witness in O(k), not O(k²).
    for(const c of this.active)if(c!==a&&c!==b&&this.below(b,c)&&this.below(c,a))return [a,b,c].sort((x,y)=>x-y) as RegionTriangle;
    throw Error('区域入度冲突没有三环见证，完整性不变量失效。');
  }
}

export type RegionTournamentCheck={complete:true;triangles:RegionTriangle[];certificate?:RegionCoverageCertificate}|{complete:false;triangles:RegionTriangle[]};
export function checkCoverageTournaments(coverage:RegionCoverage,pairs:readonly RegionPair[],values:ArrayLike<number>,onProgress?:RegionProgress,batchSize=10_000,storage?:RegionTournamentStorage):RegionTournamentCheck{
  if(!Number.isSafeInteger(batchSize)||batchSize<1)throw Error('区域反例批次大小无效。');
  const visits=new CoverageVisits(coverage),state=new RegionTournament(coverage.faceCount,pairs,values,undefined,storage),triangles:RegionTriangle[]=[],seen=new Set<string>(),stop=Symbol('region-batch');
  const certificate:RegionCoverageCertificate={top:new Int32Array(coverage.cellCount),bottom:new Int32Array(coverage.cellCount),depth:new Uint32Array(coverage.cellCount),verifiedCells:0};
  let lastTriangle:RegionTriangle|undefined;
  onProgress?.('coverage-check',{cells:0,total:coverage.cellCount,conflicts:0});
  try{
    coverage.walk({
      onTransition:({removed,added})=>state.transition(removed,added),
      onCell:(cell,faces)=>{
        visits.visit(cell);if(faces.size!==state.active.size)throw Error('精确覆盖集合与增量记录不一致。');
        if(state.ordered){const {top,bottom,depth}=state.extrema();certificate.top[cell]=top;certificate.bottom[cell]=bottom;certificate.depth[cell]=depth;}
        else{
          const triangle=lastTriangle?.every(face=>state.active.has(face))?lastTriangle:state.triangle();lastTriangle=triangle;
          const key=triangle.join(',');if(!seen.has(key)){seen.add(key);triangles.push(triangle);if(triangles.length>=batchSize)throw stop;}
        }
        if(visits.count%65536===0)onProgress?.('coverage-check',{cells:visits.count,total:coverage.cellCount,conflicts:triangles.length});
      },
    });
  }catch(error){if(error!==stop)throw error;onProgress?.('coverage-check',{cells:visits.count,total:coverage.cellCount,conflicts:triangles.length});return {complete:false,triangles};}
  visits.finish(state.active.size);onProgress?.('coverage-check',{cells:visits.count,total:coverage.cellCount,conflicts:triangles.length});
  if(!triangles.length)certificate.verifiedCells=visits.count;
  return {complete:true,triangles,...(!triangles.length?{certificate}:{})};
}
