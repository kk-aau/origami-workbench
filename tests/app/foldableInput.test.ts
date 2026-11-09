import test from 'node:test';
import assert from 'node:assert/strict';
import {beginFoldableInput,chooseFoldableDirection,pickFoldableDirection,setFoldableEndpoint,finishFoldableInput,type FoldableInput} from '../../src/app/foldableInput';
import type {Doc,Segment} from '../../src/core/types';
const ray=(a:number,id=String(a)):Segment=>({id,a:[100,100],b:[100+50*Math.cos(a*Math.PI/180),100+50*Math.sin(a*Math.PI/180)],assignment:'V',angle:45});
const doc=(segments:Segment[]):Doc=>({name:'input',paper:{width:200,height:200},segments});
test('empty grid origin and even-degree vertex allow ordinary endpoint input',()=>{
 for(const d of [doc([]),doc([ray(0),ray(90)])]){const state=beginFoldableInput(d,[100,100],25);assert.equal(state.end,null);assert.equal(state.suggestions.length,0);assert.throws(()=>finishFoldableInput(state,'M'));const next=setFoldableEndpoint(state,[125,125]);assert.deepEqual(finishFoldableInput(next,'M'),{a:[100,100],b:[125,125],assignment:'M',angle:-180});assert.equal(state.end,null);}
});
test('single candidate auto-selects one grid step but always uses current preset',()=>{
 const state=beginFoldableInput(doc([ray(0)]),[100,100],25);assert.equal(state.suggestions.length,1);assert.ok(Math.abs(state.end![0]-75)<1e-8);const result=finishFoldableInput(state,'M');assert.equal(result.assignment,'M');assert.equal(result.angle,-180);
});
test('multiple candidates wait for selection and can be replaced by arbitrary valid endpoint',()=>{
 const d=doc([ray(0),ray(120),ray(240)]),before=structuredClone(d),state=beginFoldableInput(d,[100,100],25);assert.equal(state.end,null);assert.equal(state.suggestions.length,3);const chosen=chooseFoldableDirection(state,1),replaced=setFoldableEndpoint(chosen,[130,140]);assert.deepEqual(finishFoldableInput(replaced,'U').b,[130,140]);assert.equal(finishFoldableInput(replaced,'U').angle,null);assert.equal(state.end,null);assert.notDeepEqual(chosen.end,replaced.end);assert.deepEqual(d,before);
});
test('finite forward cutoff extends current endpoint direction without mutating it',()=>{
 const state=setFoldableEndpoint(beginFoldableInput(doc([]),[100,100],25),[125,100]),target:Segment={id:'target',a:[200,0],b:[200,200],assignment:'B',angle:0};assert.deepEqual(finishFoldableInput(state,'V',target).b,[200,100]);assert.deepEqual(state.end,[125,100]);assert.throws(()=>finishFoldableInput(state,'M',{...target,a:[200,150]}));assert.throws(()=>finishFoldableInput(state,'M',{...target,a:[0,0],b:[0,200]}));
});
test('invalid preview, endpoint or candidate selection cannot create zero or invalid geometry',()=>{
 for(const length of [0,-1,NaN,Infinity])assert.throws(()=>beginFoldableInput(doc([]),[100,100],length));const state=beginFoldableInput(doc([ray(0)]),[100,100],25);assert.throws(()=>chooseFoldableDirection(state,5));assert.throws(()=>chooseFoldableDirection(state,.5));assert.throws(()=>setFoldableEndpoint(state,[100,100]));assert.throws(()=>setFoldableEndpoint(state,[NaN,100]));
});
test('overlapping rays remain an error rather than silently switching to unconstrained input',()=>{
 assert.throws(()=>beginFoldableInput(doc([ray(0,'one'),ray(0,'two')]),[100,100],25),/重叠/);
});

test('pointer selects the closest finite suggestion, including index zero, and misses return null',()=>{
 const state:FoldableInput={origin:[0,0],end:null,degree:3,suggestions:[[10,1],[10,-1]]},before=structuredClone(state);
 assert.equal(pickFoldableDirection(state,[8,.8],1),0);
 assert.equal(pickFoldableDirection(state,[8,-.8],1),1);
 assert.equal(pickFoldableDirection(state,[20,2],1),null);
 assert.deepEqual(state,before);
});

test('equidistant suggestions reject in either order and explicit numbered choice still works',()=>{
 const state:FoldableInput={origin:[0,0],end:null,degree:3,suggestions:[[10,1],[10,-1]]};
 for(const suggestions of [state.suggestions,[...state.suggestions].reverse()]){
  assert.throws(()=>pickFoldableDirection({...state,suggestions},[8,0],1),/多个补线方向/);
  assert.deepEqual(chooseFoldableDirection({...state,suggestions},1).end,suggestions[1]);
 }
 assert.equal(state.end,null);
});

test('invalid candidate pointer or radius rejects without changing input',()=>{
 const state:FoldableInput={origin:[0,0],end:null,degree:1,suggestions:[[10,0]]};
 assert.throws(()=>pickFoldableDirection(state,[NaN,0],1));
 for(const radius of [-1,NaN,Infinity])assert.throws(()=>pickFoldableDirection(state,[5,0],radius));
 assert.equal(state.end,null);
});

test('screen-space ambiguity tolerance absorbs pointer rounding at different zoom scales',()=>{
 for(const scale of [.01,1,100]){
  const state={origin:[0,0] as [number,number],suggestions:[[10*scale,scale],[10*scale,-scale]] as [number,number][]};
  assert.throws(()=>pickFoldableDirection(state,[8*scale,1e-5*scale],scale,.1*scale),/多个补线方向/);
  assert.equal(pickFoldableDirection(state,[8*scale,.5*scale],scale,.1*scale),0);
 }
});
