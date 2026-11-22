import ear from 'rabbit-ear';
import type {ConvexLayerConstraints,LayerCategory} from './convexLayerContacts';
import {reportFlatComputationProgress} from './flatComputationProgress';
import type {FlatConflictTrace,FlatFoldConflict,FlatLayerRelation} from './types';
import {makeLayerConflict} from './flatConflictDiagnostics';

const categories:LayerCategory[]=['taco_taco','taco_tortilla','tortilla_tortilla','transitivity'];
const widths=[6,3,2,3];
// Bounds the speculative local proof only. Ordinary search is exhaustive.
const maxRepairOccurrences=32768;
const tables=categories.map((type,t)=>{
 const table=new Int16Array(3**widths[t]);
 for(const [key,value]of Object.entries(ear.layer.table[type]))table[parseInt(key,3)]=value===false?-1:value===true?0:(value[0]+1)*3+value[1];
 return table;
});

function completedRuleHolds(values:Uint8Array,type:number,terms:Int32Array,start:number,end:number):boolean{
 let state=0;
 for(let j=start;j<end;j++){
  const term=terms[j],value=values[Math.abs(term)-1];
  if(value!==1&&value!==2)return false;
  state=state*3+(term<0?3-value:value);
 }
 return tables[type][state]===0;
}

/** Stable signed face-pair ids; adding a rule never renumbers old variables. */
export class LayerPairIndex{
 readonly pairs:[number,number][]=[];
 private dense:Uint32Array|undefined;
 private sparse=new Map<number,number>();
 constructor(readonly faces:number){if(faces*faces<=64_000_000)this.dense=new Uint32Array(faces*faces);}
 term(a:number,b:number):number{
  if(a===b)throw Error('层序接触约束包含同一纸面的自身比较。');
  const flipped=a>b,x=flipped?b:a,y=flipped?a:b,key=x*this.faces+y;
  let id=this.dense?.[key]??this.sparse.get(key)??0;
  if(!id){id=this.pairs.push([x,y]);if(this.dense)this.dense[key]=id;else this.sparse.set(key,id);}
  return flipped?-id:id;
 }
 find(a:number,b:number):number{const key=Math.min(a,b)*this.faces+Math.max(a,b);return this.dense?.[key]??this.sparse.get(key)??0;}
}

/** Lazy removal of propagated variables avoids a heap operation on every
 * forced assignment. Rollback reinserts any variable removed while assigned. */
class VariableHeap{
 private items:Uint32Array;private positions:Int32Array;private size=0;private conflictFirst=false;
 constructor(private degree:Uint32Array,private activity:Uint32Array){this.items=new Uint32Array(degree.length);this.positions=new Int32Array(degree.length);this.positions.fill(-1);}
 private before(a:number,b:number):boolean{
  const first=this.conflictFirst?this.activity:this.degree,second=this.conflictFirst?this.degree:this.activity;
  return first[a]>first[b]||first[a]===first[b]&&(second[a]>second[b]||second[a]===second[b]&&a<b);
 }
 private swap(a:number,b:number){const v=this.items[a];this.items[a]=this.items[b];this.items[b]=v;this.positions[this.items[a]]=a;this.positions[v]=b;}
 private down(at:number){while(at*2+1<this.size){let child=at*2+1;if(child+1<this.size&&this.before(this.items[child+1],this.items[child]))child++;if(!this.before(this.items[child],this.items[at]))break;this.swap(at,child);at=child;}}
 private up(at:number){while(at>0){const parent=(at-1)>>>1;if(!this.before(this.items[at],this.items[parent]))break;this.swap(at,parent);at=parent;}}
 rebuild(values:Uint8Array,conflictFirst:boolean){
  this.size=0;this.positions.fill(-1);this.conflictFirst=conflictFirst;
  for(let v=0;v<values.length;v++)if(!values[v]&&this.degree[v]){this.positions[v]=this.size;this.items[this.size++]=v;}
  for(let at=(this.size>>>1)-1;at>=0;at--)this.down(at);
 }
 insert(v:number){if(this.degree[v]&&this.positions[v]<0){this.positions[v]=this.size;this.items[this.size++]=v;this.up(this.size-1);}}
 promote(v:number){const at=this.positions[v];if(at>=0)this.up(at);}
 take(values:Uint8Array):number{
  while(this.size){
   const v=this.items[0];this.positions[v]=-1;this.size--;
   if(this.size){this.items[0]=this.items[this.size];this.positions[this.items[0]]=0;this.down(0);}
   if(!values[v])return v;
  }
  return -1;
 }
}

export interface LayerSearchStats{attempts:number;backtracks:number;strategySwitches:number;propagations:number}
export interface LayerSearchOptions{
 /** Strategy-switch trigger only, never a search/solution budget. The final
  * conflict-priority pass always runs to a solution or genuine exhaustion. */
 switchAfterBacktracks?:number;
}

/** Original Rabbit Ear truth tables, indexed once. Necessary regional clauses
 * are appended in a separate occurrence chain; the millions of contact terms
 * and their CSR index are retained. Guesses live only above rootMark. */
export class LayerCandidateSearch{
 readonly values:Uint8Array;
 readonly trail:number[]=[];
 lastSearch:LayerSearchStats={attempts:0,backtracks:0,strategySwitches:0,propagations:0};
 private terms:Int32Array;private starts:Uint32Array;private types:Uint8Array;
 private offsets:Uint32Array;private occurrences:Uint32Array;
 private degree:Uint32Array;private activity:Uint32Array;private phases:Uint8Array;
 private extraTerms=new Int32Array(0);private extraNext=new Int32Array(0);private extraHeads:Int32Array|undefined;private extraLength=0;
 // At a completed search every unfixed variable in the active rules has its
 // satisfying phase saved. Later preferences can change only still-free
 // comparisons outside those rules. Newly forced values are in the trail.
 private witnessedRoot=-1;private witnessedExtra=0;
 private previous?:{candidate:Uint8Array;preference:Uint32Array;root:number;unphased:Uint32Array};
 private triangles=new Set<string>();private rootMark=0;private inSearch=false;private usePriority=false;private heap:VariableHeap|undefined;
 private conflictSamples:FlatFoldConflict[]=[];private sampledRules:number[]=[];
 // A rule reference and its assigned-premise mask, not a copied proof tree.
 // Allocated on first inference/guess; five bytes per pair. See the Flat-Folder
 // attribution in THIRD_PARTY_NOTICES.md for the provenance-tracing idea.
 private reasons:Int32Array|undefined;private premises:Uint8Array|undefined;
 constructor(readonly index:LayerPairIndex,constraints:ConvexLayerConstraints,private options:LayerSearchOptions={}){
  const trigger=options.switchAfterBacktracks;if(trigger!==undefined&&trigger!==Infinity&&(!Number.isSafeInteger(trigger)||trigger<1))throw Error('搜索策略切换间隔必须为正整数。');
  let ruleCount=0,termCount=0;
  categories.forEach((type,t)=>{ruleCount+=constraints[type].length;termCount+=constraints[type].length*widths[t];});
  this.types=new Uint8Array(ruleCount);this.starts=new Uint32Array(ruleCount+1);this.terms=new Int32Array(termCount);
  let rule=0,position=0;
  categories.forEach((type,t)=>{for(const face of constraints[type]){
   this.types[rule]=t;for(const [a,b]of ear.layer.constraintToFacePairs[type](face as never))this.terms[position++]=index.term(a,b);this.starts[++rule]=position;
   if(t===3)this.triangles.add([...face].sort((a,b)=>a-b).join(','));
  }});
  this.values=new Uint8Array(index.pairs.length);this.offsets=new Uint32Array(index.pairs.length+1);
  for(const term of this.terms)this.offsets[Math.abs(term)]++;
  for(let i=1;i<this.offsets.length;i++)this.offsets[i]+=this.offsets[i-1];
  this.occurrences=new Uint32Array(this.terms.length);const cursor=this.offsets.slice();
  for(let c=0;c<ruleCount;c++)for(let j=this.starts[c];j<this.starts[c+1];j++)this.occurrences[cursor[Math.abs(this.terms[j])-1]++]=c;
  this.degree=new Uint32Array(this.values.length);for(let v=0;v<this.values.length;v++)this.degree[v]=this.offsets[v+1]-this.offsets[v];
  this.activity=new Uint32Array(this.values.length);this.phases=new Uint8Array(this.values.length);
 }
 get transitivityCount():number{return this.triangles.size;}
 /** At most four local witnesses. Branch witnesses illustrate rejected
  * candidates, never a minimal unsatisfiable core or the sole global cause. */
 get conflicts():readonly FlatFoldConflict[]{return this.conflictSamples;}
 private clearConflicts(){this.conflictSamples=[];this.sampledRules=[];}
 private prepareTrace(){if(!this.reasons){this.reasons=new Int32Array(this.values.length);this.premises=new Uint8Array(this.values.length);}}
 private set(term:number,value:number):boolean{
  const v=Math.abs(term)-1,next=term<0?3-value:value,current=this.values[v];if(current)return current===next;
  this.values[v]=next;this.trail.push(v);if(this.inSearch){this.phases[v]=next;this.prepareTrace();this.premises![v]=128;}return true;
 }
 private infer(term:number,value:number,reason:number,terms:Int32Array,start:number,end:number):boolean{
  const v=Math.abs(term)-1;if(this.values[v])return this.set(term,value);
  let mask=0;for(let j=start;j<end;j++)if(this.values[Math.abs(terms[j])-1])mask|=1<<(j-start);
  this.set(term,value);this.prepareTrace();this.reasons![v]=reason;this.premises![v]=mask;return true;
 }
 private rollback(mark:number){while(this.trail.length>mark){const v=this.trail.pop()!;this.values[v]=0;if(this.reasons){this.reasons[v]=0;this.premises![v]=0;}if(this.inSearch&&this.usePriority)this.heap?.insert(v);}}
 private explain(terms:Int32Array,start:number,end:number):FlatConflictTrace|undefined{
  if(!this.reasons)return undefined;
  const pending:number[]=[],seen=new Set<number>(),trace:FlatConflictTrace={origins:[],steps:[],truncated:false};
  const relation=(v:number):FlatLayerRelation=>{const [a,b]=this.index.pairs[v];return this.values[v]===1?{above:a,below:b}:{above:b,below:a};};
  const enqueue=(v:number)=>{if(this.values[v]&&!seen.has(v)){seen.add(v);pending.push(v);}};
  for(let j=start;j<end;j++)enqueue(Math.abs(terms[j])-1);
  // Bound the diagnostic payload only. Search still exhausts its full domain.
  // Masks capture premises at inference time, excluding later consequences.
  for(let q=0;q<pending.length;q++){
   if(q===64){trace.truncated=true;break;}
   const v=pending[q],reason=this.reasons[v];
   if(!reason){trace.origins.push({...relation(v),source:this.premises![v]===128?'search':'initial'});continue;}
   const c=reason-1,source=reason>0?this.terms:this.extraTerms,from=reason>0?this.starts[c]:-reason-1,to=reason>0?this.starts[c+1]:from+3;
   const requires:FlatLayerRelation[]=[];
   for(let j=from;j<to;j++)if(this.premises![v]&(1<<(j-from))){const p=Math.abs(source[j])-1;requires.push(relation(p));enqueue(p);}
   trace.steps.push({relation:relation(v),kind:categories[reason>0?this.types[c]:3],requires});
  }
  return trace.steps.length?trace:undefined;
 }
 private conflict(type:number,terms:Int32Array,start:number,end:number){
  const key=terms===this.terms?start:-start-1;
  // A contradiction among forced relations is stronger evidence than an
  // earlier guessed branch. Sampling stays bounded without keeping a trace
  // for millions of assignments or allocating on every rejected branch.
  if(!this.inSearch)this.clearConflicts();
  if(this.conflictSamples.length<4&&!this.sampledRules.includes(key)){
   const faces:number[]=[],relations:{above:number;below:number}[]=[];
   for(let j=start;j<end;j++){
    const v=Math.abs(terms[j])-1,[a,b]=this.index.pairs[v],value=this.values[v];faces.push(a,b);
    if(value)relations.push(value===1?{above:a,below:b}:{above:b,below:a});
   }
   const conflict=makeLayerConflict(categories[type],this.inSearch?'branch':'root',faces,{relations}),trace=this.explain(terms,start,end);
   if(trace)conflict.trace=trace;
   this.sampledRules.push(key);this.conflictSamples.push(conflict);
  }
  if(!this.inSearch)return;
  for(let j=start;j<end;j++){const v=Math.abs(terms[j])-1;if(this.activity[v]<0xffffffff)this.activity[v]++;if(this.usePriority)this.heap?.promote(v);}
 }
 private apply(type:number,terms:Int32Array,start:number,end:number):boolean{
  let state=0;for(let j=start;j<end;j++){const term=terms[j],value=this.values[Math.abs(term)-1];state=state*3+(term<0&&value?3-value:value);}
  const answer=tables[type][state];
  if(answer<0){this.conflict(type,terms,start,end);return false;}
  if(answer>0&&!this.infer(terms[start+Math.floor(answer/3)-1],answer%3,-start-1,terms,start,end)){this.conflict(type,terms,start,end);return false;}
  return true;
 }
 private reportProgress(){
  const confirmed=this.inSearch?this.rootMark:this.trail.length;
  const tentative=this.inSearch?this.trail.length-this.rootMark:0;
  reportFlatComputationProgress({stage:'search',label:'搜索纸层顺序',metric:'confirmed-relations',completed:confirmed,total:this.values.length,
   detail:tentative?`当前分支试排 ${tentative.toLocaleString('zh-CN')} 组 · 回退 ${this.lastSearch.backtracks.toLocaleString('zh-CN')} 次`:'按已确定的层序关系计数，完成后继续认证纸面'});
 }
 private propagate(mark:number):boolean{
  for(let q=mark;q<this.trail.length;q++){
   if(this.inSearch)this.lastSearch.propagations++;
   if((q&16383)===0)this.reportProgress();
   const v=this.trail[q];
   // Keep the original contact loop inline: it dominates easy large folds,
   // and an extra function call for every rule measurably regresses that path.
   for(let k=this.offsets[v];k<this.offsets[v+1];k++){
    const c=this.occurrences[k],type=this.types[c],start=this.starts[c],end=this.starts[c+1];let state=0;
    for(let j=start;j<end;j++){const term=this.terms[j],value=this.values[Math.abs(term)-1];state=state*3+(term<0&&value?3-value:value);}
    const answer=tables[type][state];
    if(answer<0){this.conflict(type,this.terms,start,end);return false;}
    if(answer>0&&!this.infer(this.terms[start+Math.floor(answer/3)-1],answer%3,c+1,this.terms,start,end)){this.conflict(type,this.terms,start,end);return false;}
   }
   if(this.extraHeads)for(let k=this.extraHeads[v];k>=0;k=this.extraNext[k]){const start=k-k%3;if(!this.apply(3,this.extraTerms,start,start+3))return false;}
  }
  return true;
 }
 seed(initial:Uint8Array):boolean{
  if(initial.length!==this.values.length)throw Error('层序初始关系数量不一致。');
  const mark=this.trail.length;
  for(let v=0;v<initial.length;v++){
   if(initial[v]>2)throw Error('层序初始关系值无效。');
   if(initial[v]&&!this.set(v+1,initial[v])){
    const [a,b]=this.index.pairs[v];this.clearConflicts();this.conflictSamples.push(makeLayerConflict('relative-order','root',[a,b],{relations:[{above:a,below:b},{above:b,below:a}]}));return false;
   }
  }
  if(!this.propagate(mark))return false;this.rootMark=this.trail.length;this.reportProgress();return true;
 }
 /** Only call with necessary triangles proven by actual common coverage. All
  * pairs must already exist; malformed clauses cannot silently add variables. */
 addTransitivity(rows:readonly (readonly number[])[]):boolean{
  this.inSearch=false;this.rollback(this.rootMark);const newTerms:number[]=[],keys=new Set<string>();
  for(const row of rows){
   if(row.length!==3||new Set(row).size!==3||row.some(v=>!Number.isInteger(v)||v<0||v>=this.index.faces))throw Error('区域传递约束包含无效纸面。');
   const key=[...row].sort((a,b)=>a-b).join(',');if(this.triangles.has(key)||keys.has(key))continue;
   const terms=ear.layer.constraintToFacePairs.transitivity(row as never).map(([a,b])=>{const id=this.index.find(a,b);if(!id||id>this.values.length)throw Error('区域传递约束缺少已登记的纸面对。');return a>b?-id:id;});
   keys.add(key);newTerms.push(...terms);
  }
  if(!newTerms.length)return true;
  if(!this.extraHeads){this.extraHeads=new Int32Array(this.values.length);this.extraHeads.fill(-1);}
  const oldLength=this.extraLength,required=oldLength+newTerms.length;
  if(required>this.extraTerms.length){const capacity=Math.max(required,this.extraTerms.length*2,96),terms=new Int32Array(capacity),next=new Int32Array(capacity);terms.set(this.extraTerms);next.set(this.extraNext);this.extraTerms=terms;this.extraNext=next;}
  for(const key of keys)this.triangles.add(key);
  for(const term of newTerms){const v=Math.abs(term)-1,k=this.extraLength++;this.extraTerms[k]=term;this.extraNext[k]=this.extraHeads[v];this.extraHeads[v]=k;this.degree[v]++;}
  // Root assignments are not newly queued. Evaluate every NEW rule once so
  // a clause already false/unit at the root is handled immediately.
  const mark=this.trail.length;
  for(let start=oldLength;start<this.extraLength;start+=3)if(!this.apply(3,this.extraTerms,start,start+3))return false;
  if(!this.propagate(mark))return false;this.rootMark=this.trail.length;this.reportProgress();return true;
 }
 /** Collect all currently broken rules. A positive id indexes a contact
  * rule plus one; a negative id encodes the start of an appended triple. */
 private brokenRules(proposal:Uint8Array):number[]|undefined{
  const broken:number[]=[];
  for(let start=this.witnessedExtra;start<this.extraLength;start+=3){
   if(!completedRuleHolds(proposal,3,this.extraTerms,start,start+3)&&broken.push(-start-1)>maxRepairOccurrences)return;
  }
  const checkContact=(c:number)=>{
   const start=this.starts[c],end=this.starts[c+1];
   return completedRuleHolds(proposal,this.types[c],this.terms,start,end)||broken.push(c+1)<=maxRepairOccurrences;
  };
  if(this.witnessedRoot<0){
   for(let c=0;c<this.types.length;c++)if(!checkContact(c))return;
  }else{
   for(let i=this.witnessedRoot;i<this.rootMark;i++){
    const v=this.trail[i];if(this.values[v]===this.phases[v])continue;
    for(let k=this.offsets[v];k<this.offsets[v+1];k++)if(!checkContact(this.occurrences[k]))return;
    for(let k=this.extraHeads![v];k>=0;k=this.extraNext[k]){
     const start=k-k%3;
     if(start<this.witnessedExtra&&!completedRuleHolds(proposal,3,this.extraTerms,start,start+3)&&broken.push(-start-1)>maxRepairOccurrences)return;
    }
   }
  }
  return broken;
 }
 /** Re-run this one truth table with just the hard facts and variables that
  * source-order DFS must already have assigned before it can guess target. */
 private forcedByPrefix(candidate:Uint8Array,target:number,type:number,terms:Int32Array,start:number,end:number):number{
  let state=0;
  for(let j=start;j<end;j++){
   const term=terms[j],v=Math.abs(term)-1,value=this.values[v]||(v<target?candidate[v]:0);
   state=state*3+(term<0&&value?3-value:value);
  }
  for(let answer=tables[type][state];answer>0;answer=tables[type][state]){
   const position=start+Math.floor(answer/3)-1,term=terms[position],value=answer%3;
   if(Math.abs(term)-1===target)return term<0?3-value:value;
   state+=value*3**(end-position-1);
  }
  return 0;
 }
 /** A satisfying model equals the normal zero-backtrack walk if every
  * departure from its preferred value is forced by earlier decisions.
  * Recheck that proof on the final values, since an earlier repair can
  * invalidate a later explanation. An inconclusive probe changes no state. */
 private repair(proposal:Uint8Array,pending:number[]):Uint8Array|undefined{
  const candidate=proposal.slice(),reasons=new Map<number,number>();
  const rule=(id:number)=>{
   const type=id>0?this.types[id-1]:3,terms=id>0?this.terms:this.extraTerms;
   const start=id>0?this.starts[id-1]:-id-1,end=id>0?this.starts[id]:start+3;
   return {type,terms,start,end};
  };
  for(let q=0;q<pending.length;q++){
   const id=pending[q],{type,terms,start,end}=rule(id);
   if(completedRuleHolds(candidate,type,terms,start,end))continue;
   let changed=false;
   for(let j=start;j<end;j++){
    const v=Math.abs(terms[j])-1;
    if(this.values[v])continue;
    const value=this.forcedByPrefix(candidate,v,type,terms,start,end);
    if(!value||value===candidate[v])continue;
    candidate[v]=value;reasons.set(v,id);changed=true;
    for(let k=this.offsets[v];k<this.offsets[v+1];k++)pending.push(this.occurrences[k]+1);
    for(let k=this.extraHeads![v];k>=0;k=this.extraNext[k])pending.push(-(k-k%3)-1);
    break;
   }
   if(!changed||pending.length>maxRepairOccurrences)return;
  }
  for(const [v,id] of reasons){
   if(candidate[v]===proposal[v])continue;
   const {type,terms,start,end}=rule(id);
   if(this.forcedByPrefix(candidate,v,type,terms,start,end)!==candidate[v])return;
  }
  for(const v of reasons.keys())this.phases[v]=candidate[v];
  if(this.witnessedRoot<0){
   for(let v=0;v<candidate.length;v++)if(!this.values[v]&&this.degree[v])this.phases[v]=candidate[v];
  }else{
   for(let k=this.witnessedExtra;k<this.extraLength;k++){
    const v=Math.abs(this.extraTerms[k])-1;if(!this.values[v])this.phases[v]=candidate[v];
   }
  }
  return candidate;
 }
 private saveCandidate(candidate:Uint8Array,preference:Uint32Array):Uint8Array{
  // Keep the returned bytes caller-owned. Only repeated solves need a
  // template and its list of still-unphased comparisons.
  if(this.previous){
   this.previous.candidate.set(candidate);this.previous.preference.set(preference);this.previous.root=this.rootMark;
  }else if(this.extraLength){
   let count=0;
   for(let v=0;v<candidate.length;v++)if(!this.values[v]&&!this.phases[v])count++;
   const unphased=new Uint32Array(count);
   for(let v=0,i=0;v<candidate.length;v++)if(!this.values[v]&&!this.phases[v])unphased[i++]=v;
   this.previous={candidate:candidate.slice(),preference:preference.slice(),root:this.rootMark,unphased};
  }
  return candidate;
 }
 first(preference:Uint32Array,regionalTriangles:readonly (readonly number[])[]|(()=>readonly (readonly number[])[])=[]):Uint8Array|null{
  if(preference.length!==this.index.faces)throw Error('纸面搜索偏好数量不一致。');
  this.inSearch=false;this.rollback(this.rootMark);this.clearConflicts();this.lastSearch={attempts:0,backtracks:0,strategySwitches:0,propagations:0};
  const preferred=(v:number)=>{if(this.phases[v])return this.phases[v];const [a,b]=this.index.pairs[v];return preference[a]>preference[b]?1:2;};
  const previous=this.previous,initialRoot=this.rootMark;
  const proposal=previous?previous.candidate.slice():this.values.slice();
  if(previous){
   if(preference.some((value,i)=>value!==previous.preference[i])){
    for(const v of previous.unphased)if(!this.values[v]&&!this.phases[v])proposal[v]=preferred(v);
   }
   for(let i=previous.root;i<this.rootMark;i++){const v=this.trail[i];proposal[v]=this.values[v];}
  }else{
   for(let v=0;v<proposal.length;v++)if(!proposal[v])proposal[v]=preferred(v);
  }
  this.reportProgress();
  // Cheap root-order/previous-phase proposal, never a hard constraint. Plain
  // pleats often pass directly; every contact rule is checked before use.
  if(this.extraLength){
   const broken=this.brokenRules(proposal);
   if(broken?.length===0){if(this.witnessedRoot>=0)this.witnessedRoot=this.rootMark;return this.saveCandidate(proposal,preference);}
   const repaired=broken&&this.repair(proposal,broken);
   if(repaired){this.witnessedRoot=this.rootMark;this.witnessedExtra=this.extraLength;return this.saveCandidate(repaired,preference);}
  }else if(this.valid(proposal))return proposal;
  this.witnessedRoot=-1;this.witnessedExtra=0;
  // Preserve the inexpensive source-order walk on models that need little or
  // no backtracking. A global priority order can be much worse on plain pleats.
  // Only a difficult search pays for the activity/degree heap below.
  this.usePriority=false;this.inSearch=true;
  const switchAfter=this.options.switchAfterBacktracks??Math.max(128,Math.min(8192,Math.ceil(Math.sqrt(this.values.length)*8)));
  const passStarted=performance.now(),explicitTrigger=this.options.switchAfterBacktracks!==undefined;
  const decisions:{variable:number;mark:number;alternative:number}[]=[];let conflictFirst=false,scanNext=0;
  const finish=(candidate:Uint8Array|null)=>{
   this.inSearch=false;this.rollback(this.rootMark);
   if(candidate){this.clearConflicts();return this.saveCandidate(candidate,preference);}
   this.previous=undefined;return null;
  };
  while(true){
   let v:number;
   if(this.usePriority)v=this.heap!.take(this.values);
   else{while(scanNext<this.values.length&&(this.values[scanNext]||!this.degree[scanNext]))scanNext++;v=scanNext<this.values.length?scanNext++:-1;}
   if(v<0){
    // All tentative assignments and any new root inferences from an adaptive
    // restart are on this trail. Other comparisons retain their proposal.
    for(let i=initialRoot;i<this.trail.length;i++){const variable=this.trail[i];proposal[variable]=this.values[variable];}
    this.witnessedRoot=this.rootMark;this.witnessedExtra=this.extraLength;return finish(proposal);
   }
   const value=preferred(v),frame={variable:v,mark:this.trail.length,alternative:3-value};decisions.push(frame);this.lastSearch.attempts++;
   if((this.lastSearch.attempts&1023)===0)this.reportProgress();
   this.set(v+1,value);if(this.propagate(frame.mark))continue;
   let resumed=false,restart=false;
   while(decisions.length){
    this.lastSearch.backtracks++;
    if((this.lastSearch.backtracks&1023)===0)this.reportProgress();
    // A millisecond-scale fold cannot repay building regional caches/a heap.
    // This is only an activation gate: there is never a time-based verdict or
    // interruption of the original exhaustive search. Explicit test triggers
    // exercise the switch deterministically without depending on wall time.
    if(!conflictFirst&&this.lastSearch.backtracks>=switchAfter&&(explicitTrigger||(this.lastSearch.backtracks&255)===0&&performance.now()-passStarted>=25)){restart=true;break;}
    const previous=decisions[decisions.length-1];this.rollback(previous.mark);
    if(previous.alternative){const alternative=previous.alternative;previous.alternative=0;this.set(previous.variable+1,alternative);if(this.propagate(previous.mark)){if(!this.usePriority)scanNext=previous.variable+1;resumed=true;break;}}
    else decisions.pop();
   }
   if(restart){
    // A single adaptive restart changes the heuristic, not the verdict. The
    // following pass has NO decision/time bound and exhausts both values.
    this.inSearch=false;this.rollback(this.rootMark);decisions.length=0;conflictFirst=true;this.lastSearch.strategySwitches++;
    // Activate sampled real-cell clauses only when ordinary search is hard.
    // Eagerly activating otherwise-free pair variables regresses easy pleats.
    if(!this.addTransitivity(typeof regionalTriangles==='function'?regionalTriangles():regionalTriangles))return finish(null);
    this.heap??=new VariableHeap(this.degree,this.activity);this.heap.rebuild(this.values,true);this.usePriority=true;this.inSearch=true;
    this.reportProgress();
    continue;
   }
   if(!resumed)return finish(null);
  }
 }
 valid(values:Uint8Array):boolean{
  if(values.length!==this.values.length)return false;
  for(let c=0;c<this.types.length;c++)if(!completedRuleHolds(values,this.types[c],this.terms,this.starts[c],this.starts[c+1]))return false;
  for(let start=0;start<this.extraLength;start+=3)if(!completedRuleHolds(values,3,this.extraTerms,start,start+3))return false;
  return true;
 }
}
