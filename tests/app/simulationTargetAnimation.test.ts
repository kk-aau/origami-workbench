import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSimTargetAnimation,evaluateSimTargetAnimation,validateSimTargetAnimationSteps,DEFAULT_SIM_TARGET_ANIMATION_STEPS,type SimTargetAnimationStep,type SimTargetAnimationPath} from '../../src/engine/simTargetAnimation';

test('default playback starts at the current target and reaches exactly 100% after ten seconds',()=>{
  const path=compileSimTargetAnimation(40,DEFAULT_SIM_TARGET_ANIMATION_STEPS);
  assert.equal(path.durationMs,10000);
  assert.deepEqual(evaluateSimTargetAnimation(path,0),{percent:40,done:false,stepIndex:0});
  assert.equal(evaluateSimTargetAnimation(path,2500).percent,55);
  assert.deepEqual(evaluateSimTargetAnimation(path,10000),{percent:100,done:true,stepIndex:0});
  assert.equal(evaluateSimTargetAnimation(path,Number.MAX_VALUE).percent,100);
});

test('holds preserve the incoming target through both directions and exact internal boundaries',()=>{
  const path=compileSimTargetAnimation(35,[
    {id:'start-hold',kind:'hold',duration:.2},
    {id:'invert',kind:'fold',target:-100,duration:1},
    {id:'end-hold',kind:'hold',duration:.5},
    {id:'unfold',kind:'fold',target:0,duration:2},
  ]);
  for(const time of [-500,0,100])assert.equal(evaluateSimTargetAnimation(path,time).percent,35);
  assert.deepEqual(evaluateSimTargetAnimation(path,200),{percent:35,done:false,stepIndex:1});
  assert.equal(evaluateSimTargetAnimation(path,700).percent,-32.5);
  assert.deepEqual(evaluateSimTargetAnimation(path,1200),{percent:-100,done:false,stepIndex:2});
  assert.equal(evaluateSimTargetAnimation(path,1500).percent,-100);
  assert.deepEqual(evaluateSimTargetAnimation(path,1700),{percent:-100,done:false,stepIndex:3});
  assert.equal(evaluateSimTargetAnimation(path,2700).percent,-50);
  assert.deepEqual(evaluateSimTargetAnimation(path,3700),{percent:0,done:true,stepIndex:3});
});

test('sampling can seek backwards after completion without retaining previous playback state',()=>{
  const path=compileSimTargetAnimation(-100,[{id:'reverse',kind:'fold',target:100,duration:4}]);
  for(const [time,expected] of [[4000,100],[3000,50],[1000,-50],[2000,0],[0,-100],[4000,100]])assert.equal(evaluateSimTargetAnimation(path,time).percent,expected);
});

test('empty playback completes at its starting target and inputs remain independent of the compiled path',()=>{
  assert.deepEqual(evaluateSimTargetAnimation(compileSimTargetAnimation(-25,[]),0),{percent:-25,done:true,stepIndex:-1});
  const steps:SimTargetAnimationStep[]=[{id:'fold',kind:'fold',target:50,duration:1}];
  const path=compileSimTargetAnimation(0,steps);
  steps[0].duration=10;
  if(steps[0].kind==='fold')steps[0].target=-50;
  steps.push({id:'later',kind:'hold',duration:3});
  assert.deepEqual(evaluateSimTargetAnimation(path,1000),{percent:50,done:true,stepIndex:0});
  assert.ok(Object.isFrozen(path)&&Object.isFrozen(path.segments)&&Object.isFrozen(path.segments[0]));
});

test('untrusted stored settings reject nonfinite values, bad identifiers, kinds and percentages',()=>{
  const valid={id:'fold',kind:'fold',target:100,duration:1};
  for(const bad of [null,{},'sequence',[null],new Array(1),[{...valid,id:''}],[{...valid,id:' '}],[valid,valid],[{...valid,kind:'jump'}],[{...valid,duration:'1'}],[{...valid,target:'10'}]])assert.throws(()=>validateSimTargetAnimationSteps(bad));
  for(const value of [NaN,Infinity,-Infinity]){
    assert.throws(()=>validateSimTargetAnimationSteps([{...valid,duration:value}]));
    assert.throws(()=>validateSimTargetAnimationSteps([{...valid,target:value}]));
    assert.throws(()=>compileSimTargetAnimation(value,[]));
    assert.throws(()=>evaluateSimTargetAnimation(compileSimTargetAnimation(0,[]),value));
  }
  for(const target of [-100.001,100.001])assert.throws(()=>validateSimTargetAnimationSteps([{...valid,target}]));
  for(const duration of [0,.099,120.001])assert.throws(()=>validateSimTargetAnimationSteps([{...valid,duration}]));
  const copy=validateSimTargetAnimationSteps([valid]);copy[0].duration=2;assert.equal(valid.duration,1);
});

test('resource limits accept twenty rows and exactly ten minutes without permitting larger paths',()=>{
  const maxRows:SimTargetAnimationStep[]=Array.from({length:20},(_,index)=>({id:String(index),kind:'hold',duration:30}));
  const path=compileSimTargetAnimation(100,maxRows);
  assert.equal(path.durationMs,600000);
  assert.deepEqual(evaluateSimTargetAnimation(path,600000),{percent:100,done:true,stepIndex:19});
  assert.equal(compileSimTargetAnimation(0,[{id:'minimum',kind:'hold',duration:.1}]).durationMs,100);
  assert.equal(compileSimTargetAnimation(0,[{id:'maximum',kind:'fold',target:-100,duration:120}]).durationMs,120000);
  assert.throws(()=>compileSimTargetAnimation(0,[...maxRows,{id:'overflow',kind:'hold',duration:.1}]));
  assert.throws(()=>compileSimTargetAnimation(0,maxRows.map((row,index)=>({...row,duration:index===0?30.1:30}))));
});

test('externally malformed paths cannot turn sampling into NaN, extrapolation or a discontinuous jump',()=>{
  const path=compileSimTargetAnimation(0,[{id:'fold',kind:'fold',target:100,duration:1}]);
  const malformed=[
    {...path,durationMs:NaN},
    {...path,endPercent:-100},
    {...path,segments:[{...path.segments[0],endMs:Infinity}]},
    {...path,segments:[{...path.segments[0],startMs:1}]},
    {...path,segments:[{...path.segments[0],from:10}]},
    {...path,segments:[{...path.segments[0],kind:'hold'}]},
    {...path,segments:[{...path.segments[0],to:NaN}]},
  ];
  for(const invalid of malformed)assert.throws(()=>evaluateSimTargetAnimation(invalid as SimTargetAnimationPath,500));
});
