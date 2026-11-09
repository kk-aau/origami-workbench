import test from 'node:test';
import assert from 'node:assert/strict';
import {LayerCandidateSearch,LayerPairIndex} from '../../src/core/layerCandidateSearch';
import type {ConvexLayerConstraints} from '../../src/core/convexLayerContacts';

const empty=():ConvexLayerConstraints=>({taco_taco:[],taco_tortilla:[],tortilla_tortilla:[],transitivity:[]});
function pairs(faces:number,reverse=false){
 const index=new LayerPairIndex(faces),rows:[number,number][]=[];
 for(let a=0;a<faces;a++)for(let b=a+1;b<faces;b++)rows.push([a,b]);
 for(const [a,b]of reverse?rows.reverse():rows)index.term(b,a);
 return index;
}

/** Independent small-model oracle: compare above/below relations directly.
 * A tortilla cannot lie between the two taco faces; two tortillas preserve
 * their relative side; a shared triple must not contain a directed cycle. */
function accepts(index:LayerPairIndex,rules:ConvexLayerConstraints,values:Uint8Array,initial:Uint8Array){
 const ids=new Map(index.pairs.map(([a,b],i)=>[`${a},${b}`,i]));
 const above=(a:number,b:number)=>{
  const value=values[ids.get(`${Math.min(a,b)},${Math.max(a,b)}`)!];
  return a<b?value===1:value===2;
 };
 if(initial.some((value,i)=>value!==0&&value!==values[i]))return false;
 for(const [a,b,c]of rules.taco_tortilla)if(above(a,b)===above(b,c))return false;
 for(const [a,b,c,d]of rules.tortilla_tortilla)if(above(a,c)!==above(b,d))return false;
 for(const [a,b,c]of rules.transitivity)if(above(a,b)===above(b,c)&&above(b,c)===above(c,a))return false;
 assert.equal(rules.taco_taco.length,0,'the independent oracle intentionally covers three distinct logical rule families');
 return true;
}
function enumerate(index:LayerPairIndex,rules:ConvexLayerConstraints,initial:Uint8Array){
 const solutions:Uint8Array[]=[];
 for(let bits=0;bits<2**index.pairs.length;bits++){
  const value=Uint8Array.from(index.pairs,(_,i)=>(bits>>i&1)+1);
  if(accepts(index,rules,value,initial))solutions.push(value);
 }
 return solutions;
}

test('dynamic variable choice and both restart policies agree with exhaustive small-model truth assignments',()=>{
 let random=0x5a1743;
 const pick=(n:number)=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random%n;};
 let satisfiable=0,unsatisfiable=0,dynamicSatisfiable=0;
 for(let sample=0;sample<36;sample++){
  const index=pairs(4,sample%2===0),rules=empty(),initial=new Uint8Array(index.pairs.length);
  for(let rule=0;rule<5;rule++){
   const face=[0,1,2,3];for(let i=3;i>0;i--){const j=pick(i+1);[face[i],face[j]]=[face[j],face[i]];}
   const kind=pick(3);if(kind===0)rules.taco_tortilla.push(face.slice(0,3));else if(kind===1)rules.tortilla_tortilla.push(face);else rules.transitivity.push(face.slice(0,3));
  }
  for(let fixed=0;fixed<sample%3;fixed++)initial[pick(initial.length)]=pick(2)+1;
  const expected=enumerate(index,rules,initial);expected.length?satisfiable++:unsatisfiable++;
  for(const switchAfterBacktracks of [1,Number.MAX_SAFE_INTEGER]){
   const search=new LayerCandidateSearch(index,structuredClone(rules),{switchAfterBacktracks});
   const seeded=search.seed(initial),root=search.values.slice();
   const result=seeded?search.first(Uint32Array.from([2,0,3,1])):null;
   assert.equal(result!==null,expected.length>0,`sample ${sample}, switch ${switchAfterBacktracks}`);
   if(result){assert.ok(accepts(index,rules,result,initial));assert.ok(search.valid(result));if(search.lastSearch.attempts>0)dynamicSatisfiable++;}
   assert.ok(search.lastSearch.strategySwitches<=1,'the final DFS never restarts repeatedly');
   assert.deepEqual(search.values,root,'search returns only a candidate copy and restores the forced root');
  }
 }
 assert.ok(satisfiable>0&&unsatisfiable>0,'the corpus contains both satisfiable and unsatisfiable models');
 assert.ok(dynamicSatisfiable>0,'satisfiable cases exercise branching as well as the direct proposal');
});

test('a bounded strategy restart still exhausts an unsatisfiable parity cycle and restores its root',()=>{
 const index=pairs(3),rules=empty();
 // Each of three faces cannot simultaneously be outside the other two.
 rules.taco_tortilla=[[0,1,2],[1,2,0],[2,0,1]];
 assert.equal(enumerate(index,rules,new Uint8Array(3)).length,0);
 const search=new LayerCandidateSearch(index,rules,{switchAfterBacktracks:1});
 assert.ok(search.seed(new Uint8Array(3)));
 assert.equal(search.first(Uint32Array.from([0,1,2])),null);
 assert.equal(search.lastSearch.strategySwitches,1);
 assert.ok(search.lastSearch.backtracks>0);
 assert.deepEqual(search.values,new Uint8Array(3));
});

test('adding a real shared triple replaces a candidate guess while retaining hard relations',()=>{
 const index=pairs(3),search=new LayerCandidateSearch(index,empty()),initial=new Uint8Array(3);
 initial[index.find(0,1)-1]=1;initial[index.find(1,2)-1]=1;
 assert.ok(search.seed(initial));
 const old=search.first(Uint32Array.from([0,1,2]));assert.ok(old);
 assert.equal(old[index.find(0,2)-1],2,'unconstrained completion initially closes a cycle');
 assert.deepEqual(search.values,initial,'the completed guess is not a root constraint');
 assert.ok(search.addTransitivity([[0,1,2]]));
 assert.equal(search.values[index.find(0,2)-1],1,'the newly active rule is evaluated against the existing root immediately');
 assert.ok(!search.valid(old));
 const next=search.first(Uint32Array.from([0,1,2]));assert.ok(next);
 assert.equal(next[index.find(0,2)-1],1);
 for(let i=0;i<initial.length;i++)if(initial[i])assert.equal(next[i],initial[i]);
});

test('an appended shared triple detects conflict among already-forced relations without a new decision',()=>{
 const index=pairs(3),search=new LayerCandidateSearch(index,empty()),initial=Uint8Array.from([1,2,1]);
 assert.ok(search.seed(initial));
 assert.ok(search.first(Uint32Array.from([0,1,2])));
 assert.equal(search.addTransitivity([[0,1,2]]),false);
});

test('locally legal shared triples do not forbid a global ring absent from any one region',()=>{
 const index=pairs(4),rules=empty(),initial=new Uint8Array(index.pairs.length);
 initial[index.find(0,1)-1]=1;initial[index.find(1,2)-1]=1;initial[index.find(0,2)-1]=2;
 rules.transitivity=[[0,1,3],[1,2,3],[2,0,3]];
 const expected=enumerate(index,rules,initial);assert.ok(expected.length);
 const search=new LayerCandidateSearch(index,rules,{switchAfterBacktracks:1});assert.ok(search.seed(initial));
 const result=search.first(Uint32Array.from([0,1,2,3]));assert.ok(result);
 assert.ok(accepts(index,rules,result,initial));
 assert.deepEqual([result[index.find(0,1)-1],result[index.find(1,2)-1],result[index.find(0,2)-1]],[1,1,2]);
});

test('incremental rules reject unregistered pair identities instead of extending fixed state arrays silently',()=>{
 const index=new LayerPairIndex(3);index.term(0,1);index.term(1,2);
 const search=new LayerCandidateSearch(index,empty());assert.ok(search.seed(new Uint8Array(2)));
 assert.throws(()=>search.addTransitivity([[0,1,2]]));
 assert.equal(index.pairs.length,2);assert.equal(search.values.length,2);
});

test('a malformed append batch does not hide its valid prefix from a later retry',()=>{
 const index=pairs(3),search=new LayerCandidateSearch(index,empty()),initial=new Uint8Array(3);
 initial[index.find(0,1)-1]=1;initial[index.find(1,2)-1]=1;
 assert.ok(search.seed(initial));
 assert.throws(()=>search.addTransitivity([[0,1,2],[0,1,3]]));
 assert.deepEqual(search.values,initial,'failed validation leaves the root unchanged');
 assert.ok(search.addTransitivity([[0,1,2]]));
 assert.equal(search.values[index.find(0,2)-1],1,'the valid prefix was not prematurely marked as installed');
});

test('successive region clauses preserve complete search after previous candidates and changing priorities',()=>{
 const triangles=[[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
 for(let sample=0;sample<12;sample++){
  const index=pairs(4,sample%2===0),rules=empty(),initial=new Uint8Array(index.pairs.length);
  rules.tortilla_tortilla.push(sample%2? [0,1,2,3]:[1,2,0,3]);
  rules.taco_tortilla.push([sample%4,(sample+1)%4,(sample+2)%4]);
  if(sample%3)initial[index.find(0,3)-1]=sample%2+1;
  const search=new LayerCandidateSearch(index,structuredClone(rules),{switchAfterBacktracks:1});
  if(!search.seed(initial)){assert.equal(enumerate(index,rules,initial).length,0);continue;}
  search.first(Uint32Array.from([2,0,3,1]));
  for(let added=0;added<triangles.length;added++){
   const triangle=triangles[(added+sample)%triangles.length];rules.transitivity.push(triangle);
   const expected=enumerate(index,rules,initial),appended=search.addTransitivity([triangle]);
   if(!appended){assert.equal(expected.length,0);break;}
   const root=search.values.slice(),result=search.first(Uint32Array.from([1,3,0,2]));
   assert.equal(result!==null,expected.length>0,`sample ${sample}, clause ${added}`);
   if(result)assert.ok(accepts(index,rules,result,initial));
   assert.deepEqual(search.values,root);
  }
 }
});

test('regional clauses stay lazy on easy folds and activate once at a difficult restart without promoting guesses',()=>{
 const easyIndex=pairs(3),easy=new LayerCandidateSearch(easyIndex,empty());
 assert.ok(easy.seed(new Uint8Array(3)));let easyCalls=0;
 assert.ok(easy.first(Uint32Array.from([0,1,2]),()=>{easyCalls++;return [[0,1,2]];}));
 assert.equal(easyCalls,0,'the fast proposal must not construct regional clauses');

 // This small SAT model needs to undo a preferred branch and has several
 // valid completions; adding regional rules must preserve its solutions.
 const makeRules=():ConvexLayerConstraints=>({taco_taco:[],taco_tortilla:[],tortilla_tortilla:[[2,1,3,0],[2,1,0,3]],transitivity:[[3,2,0],[0,1,3]]});
 for(const unsatisfiable of [false,true]){
  const index=pairs(unsatisfiable?7:4),rules=makeRules(),initial=new Uint8Array(index.pairs.length);
  initial[index.find(0,2)-1]=2;
  // A separate forced ring is legal before these three faces are declared
  // to share one region. The other component supplies the difficult branch.
  if(unsatisfiable){initial[index.find(4,5)-1]=1;initial[index.find(5,6)-1]=1;initial[index.find(4,6)-1]=2;}
  const preference=Uint32Array.from(unsatisfiable?[2,0,3,1,4,5,6]:[2,0,3,1]);
  const ordinary=new LayerCandidateSearch(index,structuredClone(rules),{switchAfterBacktracks:1});assert.ok(ordinary.seed(initial));
  const before=ordinary.first(preference);assert.ok(before);assert.equal(ordinary.lastSearch.strategySwitches,1);
  const regional=unsatisfiable?[[4,5,6]]:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]],allRules={...rules,transitivity:[...rules.transitivity,...regional]};
  if(unsatisfiable)assert.ok(!accepts(index,allRules,before,initial),'the proposed regional fact rejects the otherwise legal global ring');
  const search=new LayerCandidateSearch(index,structuredClone(rules),{switchAfterBacktracks:1});assert.ok(search.seed(initial));const root=search.values.slice();let calls=0;
  const result=search.first(preference,()=>{calls++;return regional;});
  assert.equal(calls,1);assert.equal(search.lastSearch.strategySwitches,1);
  if(unsatisfiable){
   assert.equal(result,null,'the shared forced ring has no valid completion');
   assert.deepEqual(search.values,root,'restart-conflict cleanup retains only the original forced root');
  }else{
   const expected=enumerate(index,allRules,initial);assert.ok(expected.length);assert.ok(result);
   assert.ok(accepts(index,allRules,result,initial));
   for(let v=0;v<search.values.length;v++)if(search.values[v])assert.ok(expected.every(answer=>answer[v]===search.values[v]),'every retained root value is true in all solutions, never a discarded guess');
  }
 }
});
