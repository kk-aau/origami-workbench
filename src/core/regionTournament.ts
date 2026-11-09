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
  finish(active:ReadonlySet<number>){if(this.count!==this.seen.length||active.size)throw Error('精确覆盖遍历没有检查全部区域并返回外部。');}
}

export function registerCoveragePairs(coverage:RegionCoverage,initialPairs:readonly RegionPair[],append:(a:number,b:number)=>void,onProgress?:RegionProgress):{added:number;cells:number}{
  const visits=new CoverageVisits(coverage),seen=new RelationBits(coverage.faceCount),active=new Set<number>();let added=0;
  for(const [a,b]of initialPairs){faceId(a,coverage.faceCount);faceId(b,coverage.faceCount);if(a===b)throw Error('层序包含自身比较。');seen.add(Math.min(a,b),Math.max(a,b));}
  onProgress?.('coverage-pairs',{cells:0,total:coverage.cellCount,added:0});
  coverage.walk({
    onTransition:({removed,added:entering})=>{
      for(const face of removed){faceId(face,coverage.faceCount);if(!active.delete(face))throw Error('精确覆盖移除了不在当前区域中的纸面。');}
      // Inserting before removing would register comparisons for faces that
      // never coexist in any real cell. Only the final-state subset is used.
      for(const face of entering){
        faceId(face,coverage.faceCount);if(active.has(face))throw Error('精确覆盖重复加入纸面。');
        for(const other of active){const a=Math.min(face,other),b=Math.max(face,other);if(seen.add(a,b)){append(a,b);added++;}}
        active.add(face);
      }
    },
    onCell:(cell,faces)=>{
      visits.visit(cell);if(faces.size!==active.size)throw Error('精确覆盖集合与增量记录不一致。');
      if(visits.count%65536===0)onProgress?.('coverage-pairs',{cells:visits.count,total:coverage.cellCount,added});
    },
  });
  visits.finish(active);onProgress?.('coverage-pairs',{cells:visits.count,total:coverage.cellCount,added});return {added,cells:visits.count};
}

/** Incremental complete-tournament certificate. A complete orientation is a
 * total order iff its indegrees are exactly 0..k-1. Buckets provide the visible
 * extrema without scanning the current region at every cell. */
const packedComparisonInput=Symbol('validated packed region comparisons');
type PackedComparisonInput={token:typeof packedComparisonInput;matrix:Readonly<Uint32Array>};

/** Validate all represented relations, including ones outside this worker's
 * slice. Enumerating nonzero two-bit slots also detects asymmetric missing
 * pairs without scanning every absent pair individually. */
function validatePackedComparisons(faceCount:number,matrix:Readonly<Uint32Array>):void{
  validCount(faceCount,'纸面数量');
  const words=Math.ceil(faceCount/16),length=faceCount*words;
  if(!(matrix instanceof Uint32Array)||!Number.isSafeInteger(length)||matrix.length!==length)throw Error('共享层序关系矩阵长度与纸面数量不一致。');
  for(let a=0;a<faceCount;a++)for(let column=0;column<words;column++){
    const word=matrix[a*words+column];
    if(word&(word>>>1)&0x55555555)throw Error('共享层序关系包含非法赋值。');
    let present=(word|(word>>>1))&0x55555555;
    while(present){
      const shift=31-Math.clz32(present&-present),b=column*16+(shift>>>1),value=(word>>>shift)&3;
      if(b>=faceCount)throw Error('共享层序关系包含超出纸面范围的赋值。');
      if(a===b)throw Error('共享层序关系包含自身比较。');
      if(((matrix[b*words+(a>>>4)]>>>((a&15)*2))&3)!==3-value)throw Error('共享层序关系的正反向比较不一致。');
      present&=present-1;
    }
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
      this.comparisonRows=Array.from({length:faceCount},(_,face)=>internal.matrix.subarray(face*words,(face+1)*words));
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
  static fromPackedComparisons(faceCount:number,matrix:Readonly<Uint32Array>):RegionTournament{
    validatePackedComparisons(faceCount,matrix);
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
    for(const face of removed){
      faceId(face,this.faceCount);if(!this.active.delete(face))throw Error('精确覆盖移除了不在当前区域中的纸面。');this.unlink(face);
      const row=this.comparisonRows?.[face];
      if(row){for(const other of this.active)if(((row[other>>>4]>>>((other&15)*2))&3)===1)this.change(other,-1);}
      else for(const other of this.active)if(this.below(face,other))this.change(other,-1);
    }
    for(const face of added){
      faceId(face,this.faceCount);if(this.active.has(face))throw Error('精确覆盖重复加入纸面。');let degree=0;
      const row=this.comparisonRows?.[face];
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
  visits.finish(state.active);onProgress?.('coverage-check',{cells:visits.count,total:coverage.cellCount,conflicts:triangles.length});
  if(!triangles.length)certificate.verifiedCells=visits.count;
  return {complete:true,triangles,...(!triangles.length?{certificate}:{})};
}
