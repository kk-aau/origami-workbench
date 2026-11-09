import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SYSTEM_HELPERS_NATIVE_PRESETS,SYSTEM_HELPERS_NDSOLVE_PRESETS,validateGenericSystemHelpersQuery,parseGenericSystemHelpersResult} from '../../src/app/curvedNativeSystemHelpers';
import {validateNDSolveStepStamp} from '../../src/app/curvedNDSolveOptions';
const cases=JSON.parse(fs.readFileSync('tests/fixtures/recover-ndsolve-options-20261010.json','utf8'));
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
test('all three original recovery step options and old complete outputs independently replay',()=>{
 for(const c of cases)assert.doesNotThrow(()=>parseGenericSystemHelpersResult(c.response,c.query),c.name);
 assert.equal(cases.filter((c:any)=>!c.name.startsWith('unchanged-')).length,15);
 for(const [mode,query] of Object.entries(SYSTEM_HELPERS_NDSOLVE_PRESETS)){
  const q=validateGenericSystemHelpersQuery(query);assert.equal(q.mode,mode);assert.equal(q.initialParameter,.4);assert.equal(q.ndsolveOptions!.MaxStepSize,.02);
  assert.equal(SYSTEM_HELPERS_NATIVE_PRESETS[q.mode].initialParameter,0);assert.equal(SYSTEM_HELPERS_NATIVE_PRESETS[q.mode].ndsolveOptions,undefined);
 }
});
test('finite original step options are recovery-only and unknown/default/error controls remain rejected',()=>{
 for(const mode of ['recover2','recover3','recover-darboux'] as const)for(const ndsolveOptions of [{},{MaxSteps:0},{MaxSteps:1.2},{MaxSteps:4097},{MaxSteps:'Infinity'},
  {MaxStepSize:'Automatic'},{MaxStepSize:1.1},{MaxStepSize:0},{MaxStepSize:Infinity},{WorkingPrecision:30},{MaxSteps:128,AccuracyGoal:10}])
  assert.throws(()=>validateGenericSystemHelpersQuery({...SYSTEM_HELPERS_NATIVE_PRESETS[mode],ndsolveOptions}));
 for(const mode of ['curve2','curve3','darboux3','ruled-normal'] as const)
  assert.throws(()=>validateGenericSystemHelpersQuery({...SYSTEM_HELPERS_NATIVE_PRESETS[mode],ndsolveOptions:{MaxSteps:128}}));
});
test('saved sources retain original coefficients, raw nonunit initials, interior ui and optional step values',()=>{
 for(const c of cases.filter((c:any)=>c.name.endsWith('raw-interior'))){const loaded=validateGenericSystemHelpersQuery(JSON.parse(JSON.stringify(c.query)));
  assert.deepEqual(loaded,c.query);const result=parseGenericSystemHelpersResult(JSON.parse(JSON.stringify(c.response)),loaded);
  assert.equal(result.initial!.frameCompatible,false);assert.deepEqual(result.initial!.point,loaded.initialPoint);
  assert.equal(result.certification.formalFrameOrthonormalCertified,false);assert.equal(result.certification.adoptableCreasePattern,false);
 }
});
test('step counts, every original endpoint, definitions, option identity and certificate promotion cannot be forged',()=>{
 for(const mode of ['recover2','recover3','recover-darboux']){
  const c=cases.find((x:any)=>x.name===mode+'-raw-interior');
  for(const edit of [(r:any)=>{r.diagnostics.integration.stepOptions.definitionCell='In[999]';},(r:any)=>{r.diagnostics.integration.stepOptions.forwardParameters.pop();},
   (r:any)=>{r.diagnostics.integration.stepOptions.backwardSteps--;},(r:any)=>{r.diagnostics.integration.stepOptions.options.MaxSteps=1;},
   (r:any)=>{r.diagnostics.integration.stepOptions.forwardParameters[1]=.6;},(r:any)=>{r.diagnostics.integration.stepOptions.wolframStepControllerReproduced=true;},
   (r:any)=>{r.diagnostics.integration.stepOptions.sourceInputsPreserved=false;},(r:any)=>{r.source.wolframOptionsReproduced=true;},
   (r:any)=>{r.initial.frame[0][0]=1;},(r:any)=>{r.certification.adoptableCreasePattern=true;},(r:any)=>{delete r.diagnostics.integration.stepOptions;}]){
   const forged=copy(c.response);edit(forged);assert.throws(()=>parseGenericSystemHelpersResult(forged,c.query));
  }
  assert.throws(()=>parseGenericSystemHelpersResult(c.response,{...c.query,ndsolveOptions:{MaxSteps:129,MaxStepSize:.02}}));
 }
});
test('the shared stamp retains old boolean bindings and accepts only the actual recovery definition/default divisor',()=>{
 for(const c of cases.filter((c:any)=>c.name.endsWith('-maxsteps'))){const s=c.response.diagnostics.integration.stepOptions,i=c.response.diagnostics.integration;
  assert.ok(validateNDSolveStepStamp(s,c.query.ndsolveOptions,s.definitionCell,0,1,0,i.forwardEvaluations+i.backwardEvaluations,1/16));
  assert.equal(validateNDSolveStepStamp(s,c.query.ndsolveOptions,s.definitionCell,0,1,0,i.forwardEvaluations+i.backwardEvaluations),false);
 }
});
