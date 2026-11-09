import test from 'node:test';
import assert from 'node:assert/strict';
import {LayerCandidateSearch,LayerPairIndex} from '../../src/core/layerCandidateSearch';
import type {ConvexLayerConstraints} from '../../src/core/convexLayerContacts';

const empty=():ConvexLayerConstraints=>({taco_taco:[],taco_tortilla:[],tortilla_tortilla:[],transitivity:[]});
function pairs(count:number){const index=new LayerPairIndex(count);for(let a=0;a<count;a++)for(let b=a+1;b<count;b++)index.term(a,b);return index;}

test('a root conflict traces its upstream hard relation beyond the last conflicting faces',()=>{
 const index=pairs(6),rules=empty();rules.tortilla_tortilla=[[0,2,1,3],[2,4,3,5]];
 const search=new LayerCandidateSearch(index,rules),initial=new Uint8Array(index.pairs.length);
 initial[index.find(0,1)-1]=1;initial[index.find(4,5)-1]=2;
 assert.equal(search.seed(initial),false);
 const conflict=search.conflicts[0],trace=conflict.trace!;
 assert.deepEqual(conflict.faces,[2,3,4,5],'the local overlap witness remains local');
 assert.ok(trace);assert.equal(trace.truncated,false);
 assert.deepEqual(trace.steps,[{relation:{above:2,below:3},kind:'tortilla_tortilla',requires:[{above:0,below:1}]}]);
 assert.deepEqual(new Set(trace.origins.map(r=>`${r.above}>${r.below}:${r.source}`)),new Set(['0>1:initial','5>4:initial']));
 assert.deepEqual(JSON.parse(JSON.stringify(conflict)).trace,trace,'worker serialization retains the proof excerpt');
});

test('incrementally appended regional rules retain their original inference premises',()=>{
 const index=pairs(4),search=new LayerCandidateSearch(index,empty()),initial=new Uint8Array(index.pairs.length);
 for(const [a,b]of [[0,1],[1,2],[2,3]])initial[index.find(a,b)-1]=1;
 initial[index.find(0,3)-1]=2;
 assert.ok(search.seed(initial));assert.ok(search.first(Uint32Array.from([0,1,2,3])));
 assert.ok(search.addTransitivity([[0,1,2]]));
 assert.equal(search.addTransitivity([[0,2,3]]),false);
 const trace=search.conflicts[0].trace!;assert.ok(trace);
 assert.deepEqual(trace.steps,[{relation:{above:0,below:2},kind:'transitivity',requires:[{above:0,below:1},{above:1,below:2}]}]);
 assert.ok(trace.origins.every(r=>r.source==='initial'));
});

test('branch traces survive rollback as snapshots, while subsequent forced conflicts have no stale guesses',()=>{
 const index=pairs(3),rules=empty();rules.taco_tortilla=[[0,1,2],[1,2,0],[2,0,1]];
 const search=new LayerCandidateSearch(index,rules,{switchAfterBacktracks:1});
 assert.ok(search.seed(new Uint8Array(3)));assert.equal(search.first(Uint32Array.from([0,1,2])),null);
 assert.deepEqual(search.values,new Uint8Array(3));
 assert.ok(search.conflicts.length>0);
 for(const conflict of search.conflicts){assert.ok(conflict.trace);assert.ok(conflict.trace.origins.length>0);assert.ok(conflict.trace.origins.every(r=>r.source==='search'));}
 const snapshot=JSON.stringify(search.conflicts);
 const initial=new Uint8Array(3);initial[index.find(0,1)-1]=1;
 assert.equal(search.seed(initial),false);
 assert.equal(search.conflicts[0].scope,'root');
 assert.ok(search.conflicts[0].trace!.origins.every(r=>r.source==='initial'));
 assert.ok(JSON.parse(snapshot).every((c:any)=>c.trace.origins.every((r:any)=>r.source==='search')));
});

test('long diagnostic excerpts are marked partial without limiting constraint propagation',()=>{
 const count=100,index=new LayerPairIndex(count*2),rules=empty();
 for(let i=0;i<count;i++)index.term(i*2,i*2+1);
 for(let i=0;i<count-1;i++)rules.tortilla_tortilla.push([i*2,(i+1)*2,i*2+1,(i+1)*2+1]);
 const initial=new Uint8Array(count);initial[0]=1;initial[count-1]=2;
 const search=new LayerCandidateSearch(index,rules);assert.equal(search.seed(initial),false);
 assert.equal(search.trail.length,count,'all required propagation occurred before the contradiction');
 const trace=search.conflicts[0].trace!;assert.ok(trace.truncated);
 assert.equal(trace.origins.length+trace.steps.length,64);
});
