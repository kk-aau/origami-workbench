import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installFlatComputationProgress,reportFlatComputationProgress,reportLayerRegionProgress,type FlatComputationProgress} from '../../src/core/flatComputationProgress';
import {LayerPairIndex,LayerCandidateSearch} from '../../src/core/layerCandidateSearch';
import type {ConvexLayerConstraints} from '../../src/core/convexLayerContacts';

const empty=():ConvexLayerConstraints=>({taco_taco:[],taco_tortilla:[],tortilla_tortilla:[],transitivity:[]});
function pairs(){const index=new LayerPairIndex(3);index.term(0,1);index.term(0,2);index.term(1,2);return index;}

test('search summaries retain relation counts and the same title instead of flashing unknown progress',t=>{
 let now=0;t.mock.method(performance,'now',()=>now);
 const events:FlatComputationProgress[]=[];installFlatComputationProgress(p=>events.push(p));
 try{
  reportLayerRegionProgress('candidate',{iteration:1,pairs:10});
  reportFlatComputationProgress({stage:'search',label:'推导纸层关系',metric:'confirmed-relations',completed:4,total:10,detail:'当前分支试排 3 组'});
  assert.equal(events.at(-1)?.completed,4,'first measured update is not swallowed by the phase throttle');
  for(const stage of ['candidate','search','search-strategy']){now+=300;reportLayerRegionProgress(stage,{iteration:2,attempts:20});}
  for(const event of events.slice(1)){assert.equal(event.stage,'search');assert.equal(event.label,'搜索纸层顺序');assert.equal(event.completed,4);assert.equal(event.total,10);}
  now+=300;reportFlatComputationProgress({stage:'coverage-check',label:'认证纸面遮挡',completed:3,total:8});
  now+=300;reportLayerRegionProgress('candidate',{iteration:3});
  assert.equal(events.at(-1)?.completed,4,'return to search keeps search units, not coverage units');
  installFlatComputationProgress(p=>events.push(p));
  reportLayerRegionProgress('candidate',{iteration:1});assert.equal(events.at(-1)?.completed,undefined,'a new task never inherits previous counts');
 }finally{installFlatComputationProgress();}
});

test('temporary branch assignments and a strategy restart never increase confirmed relation progress',t=>{
 let now=0;t.mock.method(performance,'now',()=>now+=300);
 const events:FlatComputationProgress[]=[];installFlatComputationProgress(p=>events.push(p));
 try{
  const index=pairs(),rules=empty();rules.taco_tortilla=[[0,1,2],[1,2,0],[2,0,1]];
  const search=new LayerCandidateSearch(index,rules,{switchAfterBacktracks:1});assert.ok(search.seed(new Uint8Array(3)));
  assert.equal(search.first(Uint32Array.from([0,1,2])),null);assert.equal(search.lastSearch.strategySwitches,1);
  assert.ok(events.some(p=>p.detail?.includes('当前分支试排')),'exercise actual tentative branch reports');
  assert.ok(events.every(p=>p.metric==='confirmed-relations'&&p.completed===0&&p.total===3),'guesses must not become permanent progress');
 }finally{installFlatComputationProgress();}
});

test('necessary regional inference advances the fixed relation count without claiming completion of the task',t=>{
 let now=0;t.mock.method(performance,'now',()=>now+=300);
 const events:FlatComputationProgress[]=[];installFlatComputationProgress(p=>events.push(p));
 try{
  const index=pairs(),search=new LayerCandidateSearch(index,empty()),initial=new Uint8Array(3);
  initial[index.find(0,1)-1]=1;initial[index.find(1,2)-1]=1;
  assert.ok(search.seed(initial));assert.equal(events.at(-1)?.completed,2);
  assert.ok(search.first(Uint32Array.from([0,1,2])));assert.equal(events.at(-1)?.completed,2);
  assert.ok(search.addTransitivity([[0,1,2]]));assert.equal(events.at(-1)?.completed,3);
  assert.ok(events.every(p=>p.stage==='search'));assert.match(events.at(-1)!.detail!,/继续认证/);
 }finally{installFlatComputationProgress();}
});
