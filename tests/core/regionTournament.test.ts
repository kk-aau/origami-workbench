import {test} from 'node:test';import assert from 'node:assert/strict';
import {RegionTournament,registerCoveragePairs,checkCoverageTournaments,regionComparisonsFromFaceOrders,type RegionCoverage,type RegionPair} from '../../src/core/regionTournament';

export function coverage(faceCount:number,groups:readonly (readonly number[])[]):RegionCoverage{return {
  faceCount,cellCount:groups.length,walk(visitor){
    const active=new Set<number>();
    groups.forEach((ids,cell)=>{const wanted=new Set(ids),removed=[...active].filter(f=>!wanted.has(f)),added=ids.filter(f=>!active.has(f));for(const f of removed)active.delete(f);for(const f of added)active.add(f);visitor.onTransition?.({removed,added});visitor.onCell?.(cell,active);});
    const removed=[...active];active.clear();visitor.onTransition?.({removed,added:[]});
  },
};}
const pairsFor=(n:number):RegionPair[]=>{const result:RegionPair[]=[];for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)result.push([a,b]);return result;};
function oracle(ids:readonly number[],pairs:readonly RegionPair[],values:Uint8Array):number[]|null{
  const wanted=new Set(ids),degree=new Map(ids.map(id=>[id,0])),out=new Map(ids.map(id=>[id,[] as number[]]));
  pairs.forEach(([a,b],i)=>{if(!wanted.has(a)||!wanted.has(b))return;if(values[i]===1)[a,b]=[b,a];degree.set(b,degree.get(b)!+1);out.get(a)!.push(b);});
  const ready=ids.filter(id=>degree.get(id)===0);for(let i=0;i<ready.length;i++)for(const b of out.get(ready[i])!){const n=degree.get(b)!-1;degree.set(b,n);if(!n)ready.push(b);}return ready.length===ids.length?ready:null;
}

test('incremental degree/histogram matches all tournaments through six faces throughout add/remove histories',()=>{
  let checked=0;
  for(let n=0;n<=6;n++){
    const pairs=pairsFor(n),ids=Array.from({length:n},(_,i)=>i);
    for(let orientation=0;orientation<2**pairs.length;orientation++){
      const values=Uint8Array.from(pairs,(_,i)=>(orientation>>>i&1)+1),state=new RegionTournament(n,pairs,values);
      const check=()=>{const expected=oracle([...state.active],pairs,values);assert.equal(state.ordered,!!expected);
        if(expected){const extrema=state.extrema();assert.equal(extrema.depth,expected.length);assert.equal(extrema.bottom,expected[0]??-1);assert.equal(extrema.top,expected.at(-1)??-1);}
        else{const [a,b,c]=state.triangle();assert.ok(state.active.has(a)&&state.active.has(b)&&state.active.has(c));assert.equal(state.below(a,b),state.below(b,c));assert.notEqual(state.below(a,b),state.below(a,c));}
      };
      state.transition([],ids);check();for(const id of ids){state.transition([id],[]);check();}for(const id of [...ids].reverse()){state.transition([],[id]);check();}state.transition([...state.active],[]);check();checked++;
    }
  }
  assert.equal(checked,33868);
});

test('DFS registration removes before additions, preserves seeds and never registers a phantom overlap',()=>{
  const pairs:RegionPair[]=[[3,4]],walk=coverage(5,[[0,1],[1,2],[0,1],[3,4],[]]);
  const result=registerCoveragePairs(walk,pairs,(a,b)=>pairs.push([a,b]));
  assert.deepEqual(pairs,[[3,4],[0,1],[1,2]]);assert.equal(result.added,2);assert.equal(result.cells,5);
});

test('coverage checks expose extrema only after every real cell including empty holes was verified',()=>{
  const walk=coverage(4,[[0,1],[1,2,3],[0,1],[]]),pairs:RegionPair[]=[];registerCoveragePairs(walk,pairs,(a,b)=>pairs.push([a,b]));
  const answer=checkCoverageTournaments(walk,pairs,new Uint8Array(pairs.length).fill(2));
  assert.equal(answer.complete,true);assert.deepEqual(answer.triangles,[]);assert.ok(answer.complete&&answer.certificate);
  assert.equal(answer.certificate.verifiedCells,4);assert.deepEqual([...answer.certificate.top],[1,3,1,-1]);assert.deepEqual([...answer.certificate.bottom],[0,1,0,-1]);assert.deepEqual([...answer.certificate.depth],[2,3,2,0]);
});

test('global cycles absent from each real coverage remain legal; a shared triple supplies a concrete counterexample',()=>{
  const pairs=pairsFor(3),values=new Uint8Array([2,1,2]);
  const separate=checkCoverageTournaments(coverage(3,[[0,1],[1,2],[0,2]]),pairs,values);assert.ok(separate.complete&&separate.certificate);
  const together=checkCoverageTournaments(coverage(3,[[0,1,2]]),pairs,values);assert.equal(together.complete,true);assert.deepEqual(together.triangles,[[0,1,2]]);assert.ok(!('certificate' in together));
});

test('a counterexample batch is explicitly incomplete and never supplies a partial paper certificate',()=>{
  const pairs=pairsFor(6),values=Uint8Array.from(pairs,([a,b])=>(a===0&&b===2)||(a===3&&b===5)?1:2),walk=coverage(6,[[0,1,2],[3,4,5]]);
  const partial=checkCoverageTournaments(walk,pairs,values,undefined,1);assert.equal(partial.complete,false);assert.equal(partial.triangles.length,1);assert.ok(!('certificate' in partial));
  const complete=checkCoverageTournaments(walk,pairs,values);assert.equal(complete.complete,true);assert.deepEqual(complete.triangles,[[0,1,2],[3,4,5]]);assert.ok(!('certificate' in complete));
});

test('missing/unknown/duplicate pairs and malformed or interrupted coverage never certify',()=>{
  assert.throws(()=>checkCoverageTournaments(coverage(2,[[0,1]]),[],[]),/缺少/);
  assert.throws(()=>new RegionTournament(2,[[0,1]],[0]),/未赋值/);
  assert.throws(()=>new RegionTournament(2,[[0,1],[0,1]],[1,2]),/重复/);
  const bad:RegionCoverage={faceCount:2,cellCount:2,walk(v){v.onTransition?.({removed:[],added:[0]});v.onCell?.(0,new Set([0]));v.onCell?.(0,new Set([0]));}};
  assert.throws(()=>checkCoverageTournaments(bad,[],[]),/遍历/);
  const unfinished:RegionCoverage={faceCount:1,cellCount:1,walk(v){v.onTransition?.({removed:[],added:[0]});v.onCell?.(0,new Set([0]));}};
  assert.throws(()=>checkCoverageTournaments(unfinished,[],[]),/返回外部/);
  const cancelled=Error('user cancelled');assert.throws(()=>checkCoverageTournaments(coverage(1,[[0]]),[],[],()=>{throw cancelled;}),error=>error===cancelled);
  assert.throws(()=>registerCoveragePairs(coverage(2,[[0,0]]),[],()=>{}),/重复/);
});

test('existing FaceOrders convert all normal and reversed-pair combinations without inventing missing relations',()=>{
  for(const normal of [-1,1] as const)for(const sign of [-1,1] as const)for(const reverse of [false,true]){
    const a=reverse?1:0,b=reverse?0:1,normals:[1|-1,1|-1]=[1,1];normals[b]=normal;
    const {pairs,values}=regionComparisonsFromFaceOrders([[a,b,sign]],normals),state=new RegionTournament(2,pairs,values);
    state.transition([],[0,1]);assert.equal(state.extrema().top,sign*normal>0?a:b);
  }
  assert.throws(()=>regionComparisonsFromFaceOrders([[0,1,1],[1,0,1]],[1,1]),/重复/);
  assert.throws(()=>regionComparisonsFromFaceOrders([[0,1,1]],[0,1] as never),/法向/);
  const converted=regionComparisonsFromFaceOrders([[0,1,1]],[1,1,1]);assert.deepEqual(converted.pairs,[[0,1]]);
  assert.throws(()=>checkCoverageTournaments(coverage(3,[[0,1,2]]),converted.pairs,converted.values),/缺少/);
});

test('packed comparison words and the sparse fallback agree across high-bit boundaries and repeated rollback',()=>{
  // IDs 15/31 use the signed high two bits; 16/32 start the following word.
  // The wide model selects paged storage without truncating any face ID.
  for(const faceCount of [1050,65537]){
    const ids=[0,15,16,31,32,1023,1024,faceCount-1],pairs:RegionPair[]=[],values:number[]=[];
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){pairs.push([ids[i],ids[j]]);values.push(2);}
    const state=new RegionTournament(faceCount,pairs,values);
    const check=(expected:number[])=>{
      assert.equal(state.ordered,true);
      assert.deepEqual(state.extrema(),{top:expected.at(-1)??-1,bottom:expected[0]??-1,depth:expected.length});
      for(const a of ids)for(const b of ids)assert.equal(state.below(a,b),a<b);
    };
    state.transition([],ids);check(ids);
    state.transition([15,31,1023],[ ]);check(ids.filter(id=>![15,31,1023].includes(id)));
    state.transition([16,32],[1023,31,15]);check(ids.filter(id=>![16,32].includes(id)));
    state.transition([],[32,16]);check(ids);
    state.transition([...state.active],[]);check([]);
    assert.throws(()=>new RegionTournament(faceCount,[...pairs,pairs[0]],[...values,1]),/重复/);
    const missing=new RegionTournament(faceCount,pairs.slice(1),values.slice(1));
    assert.throws(()=>missing.transition([],[ids[0],ids[1]]),/缺少/);
  }
});

test('shared packed comparisons reproduce both extrema and cycle witnesses with independent worker states',()=>{
  const n=34,pairs=pairsFor(n),values=Uint8Array.from(pairs,([a,b])=>(a*17+b*31)%3?1:2);
  const original=new RegionTournament(n,pairs,values),packed=original.packedComparisons!;
  const shared=new Uint32Array(new SharedArrayBuffer(packed.byteLength));shared.set(packed);
  const borrowed=RegionTournament.fromPackedComparisons(n,shared),independent=RegionTournament.fromPackedComparisons(n,shared);
  const transitions=[{removed:[],added:[0,15,16,31,32,33]},{removed:[15,32],added:[1,2]},{removed:[16,31],added:[15,32]},{removed:[0,33,1,2,15,32],added:[]},{removed:[],added:[33,32,31,16,15,0]}];
  for(const {removed,added}of transitions){
    original.transition(removed,added);borrowed.transition(removed,added);
    assert.deepEqual([...borrowed.active],[...original.active]);assert.equal(borrowed.ordered,original.ordered);
    if(original.ordered)assert.deepEqual(borrowed.extrema(),original.extrema());else assert.deepEqual(borrowed.triangle(),original.triangle());
    assert.equal(independent.active.size,0);
  }
  assert.deepEqual([...shared],[...packed]);
  assert.equal(new RegionTournament(65537,[],[]).packedComparisons,undefined);
  assert.deepEqual(RegionTournament.fromPackedComparisons(0,new Uint32Array(0)).extrema(),{top:-1,bottom:-1,depth:0});
});

test('shared packed input rejects invalid widths, assignments, diagonals, padding and reverse relations before checking cells',()=>{
  const original=new RegionTournament(17,[[0,15],[0,16]],[1,2]),valid=original.packedComparisons!,words=2;
  assert.throws(()=>RegionTournament.fromPackedComparisons(17,valid.subarray(1)),/长度/);
  assert.throws(()=>RegionTournament.fromPackedComparisons(17,new Int32Array(valid) as unknown as Uint32Array),/长度/);
  const alter=(index:number,mask:number,message:RegExp)=>{const copy=valid.slice();copy[index]|=mask;assert.throws(()=>RegionTournament.fromPackedComparisons(17,copy),message);};
  alter(0,3<<30,/非法赋值/); // a=0,b=15 uses both high bits.
  alter(0,1,/自身比较/);
  alter(1,1<<2,/超出纸面范围/); // b=17 is padding in the last word.
  const asymmetric=valid.slice();asymmetric[15*words]=0;assert.throws(()=>RegionTournament.fromPackedComparisons(17,asymmetric),/正反向/);
  const reversed=valid.slice();reversed[15*words]=2;assert.throws(()=>RegionTournament.fromPackedComparisons(17,reversed),/正反向/);
  const missing=RegionTournament.fromPackedComparisons(17,valid);assert.throws(()=>missing.transition([],[15,16]),/缺少/);
  const offset=new Uint32Array(valid.length+4);offset.set(valid,2);const slice=RegionTournament.fromPackedComparisons(17,offset.subarray(2,2+valid.length));
  assert.equal(slice.packedComparisons!.byteOffset,8);slice.transition([],[0,15]);assert.equal(slice.extrema().top,0);
  assert.throws(()=>new RegionTournament(1,[],[],{token:Symbol('forged'),matrix:new Uint32Array(1)} as never),/完整检查/);
});

/** Fail the real typed-array constructor, without changing algorithm branches. */
function withUint32AllocationFailure<T>(failure:(length:number)=>Error|undefined,run:(attempts:number[])=>T):T{
  const Native=globalThis.Uint32Array,attempts:number[]=[];
  globalThis.Uint32Array=new Proxy(Native,{construct(target,args,newTarget){
    if(typeof args[0]==='number'){attempts.push(args[0]);const error=failure(args[0]);if(error)throw error;}
    return Reflect.construct(target,args,newTarget);
  }}) as Uint32ArrayConstructor;
  try{return run(attempts);}finally{globalThis.Uint32Array=Native;}
}

test('packed allocation failure preserves the full certificate and forced paged recheck never retries dense allocation',()=>{
  const n=64,ids=[0,15,16,31,32,63],pairs:RegionPair[]=[];
  for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++)pairs.push([ids[a],ids[b]]);
  const values=new Uint8Array(pairs.length).fill(2),walk=coverage(n,[ids,[],[0,16,32],ids.slice().reverse(),[]]);
  const expected=checkCoverageTournaments(walk,pairs,values);
  withUint32AllocationFailure(length=>length===256?new RangeError('Array buffer allocation failed'):undefined,attempts=>{
    const state=new RegionTournament(n,pairs,values);assert.equal(state.packedComparisons,undefined);
    const actual=checkCoverageTournaments(walk,pairs,values,undefined,10000,{forcePaged:true});
    assert.deepEqual(actual,expected);assert.ok(actual.complete&&actual.certificate);assert.equal(actual.certificate.verifiedCells,walk.cellCount);
    assert.equal(attempts.filter(length=>length===256).length,1);
    assert.equal(attempts.filter(length=>length===128).length,0); // No second, one-bit dense attempt.
    assert.ok(attempts.includes(1024)); // Real relation pages were allocated.
  });
  withUint32AllocationFailure(length=>length===256?new RangeError('Array buffer allocation failed'):undefined,()=>{
    assert.deepEqual(checkCoverageTournaments(walk,pairs,values),expected);
  });
});

test('relation-registration dense allocation failure retains every required pair and duplicate guard',()=>{
  const walk=coverage(64,[[0,15,31],[15,32,63],[0,15,31],[]]),expected:RegionPair[]=[];
  const reference=registerCoveragePairs(walk,expected,(a,b)=>expected.push([a,b]));
  withUint32AllocationFailure(length=>length===128?new RangeError('Array buffer allocation failed'):undefined,attempts=>{
    const actual:RegionPair[]=[];const checked=registerCoveragePairs(walk,actual,(a,b)=>actual.push([a,b]));
    assert.deepEqual(actual,expected);assert.deepEqual(checked,reference);assert.equal(attempts.filter(length=>length===128).length,1);assert.ok(attempts.includes(1024));
    const normals=Array<1>(64).fill(1);
    assert.throws(()=>regionComparisonsFromFaceOrders([[0,15,1],[15,0,-1]],normals),/重复/);
  });
});

test('paged fallback preserves exact cycle witnesses and still rejects missing, duplicate and unassigned comparisons',()=>{
  const pairs:RegionPair[]=[[0,15],[0,31],[15,31]],values=new Uint8Array([2,1,2]),walk=coverage(64,[[],[0,15,31],[15,31],[0,15,31],[]]);
  const expected=checkCoverageTournaments(walk,pairs,values);
  withUint32AllocationFailure(length=>length===256?new RangeError('Array buffer allocation failed'):undefined,()=>{
    const actual=checkCoverageTournaments(walk,pairs,values);assert.deepEqual(actual,expected);assert.deepEqual(actual.triangles,[[0,15,31]]);assert.equal('certificate' in actual,false);
    assert.throws(()=>checkCoverageTournaments(walk,pairs.slice(0,2),values.slice(0,2)),/缺少/);
    assert.throws(()=>new RegionTournament(64,pairs,[2,0,2]),/未赋值/);
    assert.throws(()=>new RegionTournament(64,[...pairs,pairs[0]],[2,1,2,1]),/重复/);
    assert.throws(()=>new RegionTournament(64,[[15,0]],[1]),/规范化/);
    assert.throws(()=>new RegionTournament(64,[[0,64]],[1]),/编号/);
  });
});

test('storage fallback does not swallow nonallocation exceptions or semantic RangeErrors',()=>{
  const unrelated=Error('constructor dependency failed');
  withUint32AllocationFailure(length=>length===256?unrelated:undefined,()=>{
    assert.throws(()=>new RegionTournament(64,[[0,15]],[1]),error=>error===unrelated);
  });
  const semantic=new RangeError('relation provider is malformed');
  withUint32AllocationFailure(length=>length===256?new RangeError('Array buffer allocation failed'):undefined,()=>{
    assert.throws(()=>new RegionTournament(64,[[0,15]],{length:1,get 0(){throw semantic;}}),error=>error===semantic);
    assert.throws(()=>checkCoverageTournaments({faceCount:64,cellCount:1,walk(){throw semantic;}},[],[]),error=>error===semantic);
  });
});

test('exhausted relation pages remain an explicit failure and cannot issue a partial certificate',()=>{
  const exhausted=new RangeError('Page allocation exhausted');
  withUint32AllocationFailure(length=>length===256?new RangeError('Array buffer allocation failed'):length===1024?exhausted:undefined,attempts=>{
    assert.throws(()=>checkCoverageTournaments(coverage(64,[[0,15]]),[[0,15]],[2]),error=>error===exhausted);
    assert.equal(attempts.filter(length=>length===256).length,1);assert.equal(attempts.filter(length=>length===128).length,0);assert.equal(attempts.filter(length=>length===1024).length,1);
  });
});
