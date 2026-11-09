import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGenericDarbouxResult,validateGenericDarbouxQuery} from '../../src/app/curvedNativeGenericDarboux';
import {validateNDSolveStepOptions} from '../../src/app/curvedNDSolveOptions';
const fixture=(name='origamica-ndsolve-step-options-1010.json')=>JSON.parse(readFileSync(new URL('../fixtures/'+name,import.meta.url),'utf8'));

test('explicit original step controls preserve domain, initial values, source and high-order resample through serialization',()=>{
 for(const c of fixture()){
  const q=validateGenericDarbouxQuery(JSON.parse(JSON.stringify(c.query)));assert.deepEqual(q,c.query);
  assert.notEqual(q.ndsolveOptions,c.query.ndsolveOptions);const r=parseGenericDarbouxResult(c.response,q),s=r.diagnostics.integration.stepOptions!;
  assert.deepEqual(s.options,q.ndsolveOptions);assert.equal(s.sourceInputsPreserved,true);assert.equal(s.wolframStepControllerReproduced,false);
  assert.equal(s.errorGoalNormReproduced,false);assert.equal(r.certification.adoptableCreasePattern,false);
 }
});
test('independent original source and ODE replay match actual smaller-step convergence against literal cone reference',()=>{
 const rows=fixture('origamica-ndsolve-literal-convergence-1010.json');for(const c of rows)parseGenericDarbouxResult(c.response,c.query);
 assert.ok(rows[1].independent60DigitPositionError<rows[0].independent60DigitPositionError/100);
 assert.ok(rows[1].response.diagnostics.integration.stepOptions.forwardSteps>rows[0].response.diagnostics.integration.stepOptions.forwardSteps);
 for(const c of rows)for(const row of c.response.sample.rows){
  assert.ok(Math.abs(row.targetBase[0]-Math.cos(4*row.s))<4e-12);assert.ok(Math.abs(row.targetBase[1]-Math.sin(4*row.s))<4e-12);
 }
});
test('original goals and defaults are explicitly unsupported rather than mapped to the wrong coordinate norm',()=>{
 for(const q of [{},{AccuracyGoal:8},{PrecisionGoal:8},{WorkingPrecision:30},{MaxSteps:'Automatic'},
  {MaxSteps:0},{MaxSteps:true},{MaxSteps:4097},{MaxSteps:2.5},{MaxStepSize:0},{MaxStepSize:1e-7},{MaxStepSize:2},{MaxStepSize:NaN}])
  assert.throws(()=>validateNDSolveStepOptions(q,1));
});
test('false source, fake total budget, changed initial parameter, broken step coverage and false kernel parity are rejected',()=>{
 for(const mutate of [(s:any)=>{s.optionSource='Options[FindRoot]';},(s:any)=>{s.definitionCell='In[3640]';},
  (s:any)=>{s.rhsEvaluationBudget=100000;},(s:any)=>{s.workingPrecisionReproduced=true;},
  (s:any)=>{s.wolframStepControllerReproduced=true;},(s:any)=>{s.errorGoalNormReproduced=true;},
  (s:any)=>{s.forwardSteps++;},(s:any)=>{s.backwardParameters[0]=0;},(s:any)=>{s.forwardParameters[2]=1;},
  (s:any)=>{s.options.MaxSteps=99;},(s:any)=>{s.effectiveMaxStepSize=.02;}]){
   const c=fixture()[2];mutate(c.response.diagnostics.integration.stepOptions);assert.throws(()=>parseGenericDarbouxResult(c.response,c.query));
 }
});
test('altered actual trajectories and exact CP claims remain rejected despite valid step options',()=>{
 for(const mutate of [(r:any)=>{r.sample.rows[3].normalizedTargetBase[0]+=.001;},
  (r:any)=>{r.certification.adoptableCreasePattern=true;},(r:any)=>{r.certification.integrationErrorIntervalCertified=true;}]){
   const c=fixture()[1];mutate(c.response);assert.throws(()=>parseGenericDarbouxResult(c.response,c.query));
 }
});
