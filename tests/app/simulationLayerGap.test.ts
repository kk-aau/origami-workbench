import {test} from 'node:test';
import assert from 'node:assert/strict';
import {correctSimulationLayerGapInput,createSimulationLayerGapPreferenceStore,DEFAULT_SIMULATION_LAYER_GAP,MAX_SIMULATION_LAYER_GAP,parseSimulationLayerGapInput,readSimulationLayerGap,saveSimulationLayerGap,SIMULATION_LAYER_GAP_KEY,validateSimulationLayerGap} from '../../src/app/simulationLayerGap';

test('layer gap accepts zero, fractional, and large multipliers with current spacing as default',()=>{
  assert.equal(DEFAULT_SIMULATION_LAYER_GAP,1);
  for(const value of [0,.125,1,2,10,100,MAX_SIMULATION_LAYER_GAP])assert.equal(validateSimulationLayerGap(value),value);
  assert.equal(Object.is(validateSimulationLayerGap(-0),0),true);
  for(const value of [-.01,1000.001,NaN,Infinity,-Infinity,'2',null,undefined,{}])assert.throws(()=>validateSimulationLayerGap(value),/0 至 1000/);
});

test('incomplete and out-of-range edits do not produce layer gap commands',()=>{
  for(const value of ['', ' ','.','-','1e','1e-','0x10','NaN','Infinity','-1','1001'])assert.equal(parseSimulationLayerGapInput(value),null,value);
  for(const [text,value] of [['0',0],['.25',.25],['0.125',.125],[' 2.5 ',2.5],['1e2',100],['1000',1000]] as const)assert.equal(parseSimulationLayerGapInput(text),value);
});

test('committing edits restores empty input and clamps range without losing fractional values',()=>{
  assert.equal(correctSimulationLayerGapInput('',2.5),2.5);
  assert.equal(correctSimulationLayerGapInput('1e-',2.5),2.5);
  assert.equal(correctSimulationLayerGapInput('1e999',2.5),2.5);
  assert.equal(correctSimulationLayerGapInput('-2',2.5),0);
  assert.equal(correctSimulationLayerGapInput('5000',2.5),1000);
  assert.equal(correctSimulationLayerGapInput('.0625',2.5),.0625);
});

test('gap preference round-trips through the managed preference storage key',()=>{
  let saved='';
  assert.match(SIMULATION_LAYER_GAP_KEY,/^zhezhi\.[a-z-]+\.v1$/);
  saveSimulationLayerGap(.125,{setItem:(key,value)=>{assert.equal(key,SIMULATION_LAYER_GAP_KEY);saved=value;}});
  assert.deepEqual(JSON.parse(saved),{version:1,multiplier:.125});
  assert.equal(readSimulationLayerGap({getItem:key=>{assert.equal(key,SIMULATION_LAYER_GAP_KEY);return saved;}}),.125);
  saveSimulationLayerGap(0,{setItem:(_key,value)=>{saved=value;}});
  assert.equal(readSimulationLayerGap({getItem:()=>saved}),0);
});

test('invalid preference records and unavailable storage fall back to the current default',()=>{
  for(const saved of [null,'null','{}','bad','{"version":2,"multiplier":2}','{"version":1,"multiplier":-1}','{"version":1,"multiplier":"2"}','{"version":1,"multiplier":1001}'])assert.equal(readSimulationLayerGap({getItem:()=>saved}),1);
  assert.equal(readSimulationLayerGap({getItem:()=>{throw Error('unavailable');}}),1);
  assert.throws(()=>saveSimulationLayerGap(2,{setItem:()=>{throw Error('quota');}}),/quota/);
});

test('shared gap subscriptions update together and re-opened views retain the saved value',()=>{
  let saved:string|null=null,firstUpdates=0,secondUpdates=0;
  const storage={getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}},store=createSimulationLayerGapPreferenceStore(storage);
  const initial=store.getSnapshot();assert.deepEqual(initial,{multiplier:1});assert.equal(store.getSnapshot(),initial);
  const unsubscribeFirst=store.subscribe(()=>firstUpdates++),unsubscribeSecond=store.subscribe(()=>secondUpdates++);
  store.set(25.5);assert.equal(firstUpdates,1);assert.equal(secondUpdates,1);assert.deepEqual(store.getSnapshot(),{multiplier:25.5});
  store.set(25.5);assert.equal(firstUpdates,1);assert.equal(secondUpdates,1);
  unsubscribeFirst();store.set(0);assert.equal(firstUpdates,1);assert.equal(secondUpdates,2);
  assert.equal(createSimulationLayerGapPreferenceStore(storage).getSnapshot().multiplier,0);
  unsubscribeSecond();
});

test('failed persistence keeps the adjusted preview and retries clear the save warning',()=>{
  let fail=true,saved:string|null=null;
  const store=createSimulationLayerGapPreferenceStore({getItem:()=>saved,setItem:(_key,value)=>{if(fail)throw Error('disk');saved=value;}});
  store.set(3.5);assert.equal(store.getSnapshot().multiplier,3.5);assert.match(store.getSnapshot().saveError!,/暂未保存/);
  fail=false;store.set(3.5);assert.deepEqual(store.getSnapshot(),{multiplier:3.5});assert.equal(JSON.parse(saved!).multiplier,3.5);
  assert.throws(()=>store.set(-1));assert.equal(store.getSnapshot().multiplier,3.5);
});

test('an external preference refresh updates subscribers without writing back',()=>{
  let saved=JSON.stringify({version:1,multiplier:2}),writes=0,updates=0;
  const store=createSimulationLayerGapPreferenceStore({getItem:()=>saved,setItem:()=>{writes++;}});
  store.getSnapshot();const unsubscribe=store.subscribe(()=>updates++);
  saved=JSON.stringify({version:1,multiplier:100});store.refresh();assert.equal(store.getSnapshot().multiplier,100);assert.equal(updates,1);assert.equal(writes,0);
  saved='bad';store.refresh();assert.equal(store.getSnapshot().multiplier,1);assert.equal(updates,2);
  unsubscribe();
});
