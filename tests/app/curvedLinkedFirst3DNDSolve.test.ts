import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLinkedFirstBandResult,validateLinkedFirstBandQuery} from '../../src/app/curvedLinkedFirstBand';
import {parseP45LinkedChainResult,validateP45LinkedChainQuery} from '../../src/app/curvedP45LinkedChain';
import {parseLinkedCommonResult,validateLinkedCommonQuery} from '../../src/app/curvedLinkedCommonParameter';
import {parseGenericLinkedResult,validateGenericLinkedQuery} from '../../src/app/curvedGenericLinked';
import {linkedStepOptionsFromFields} from '../../src/app/curvedLinkedNDSolveOptions';
const cases=JSON.parse(fs.readFileSync('tests/fixtures/linked-first3d-ndsolve-20261010.json','utf8'));
const parser=(q:any)=>q.variant==='saved-chain'?parseP45LinkedChainResult:q.variant==='common-parameter'?parseLinkedCommonResult:q.variant==='generic-common-parameter'?parseGenericLinkedResult:parseLinkedFirstBandResult;
const validator=(q:any)=>q.variant==='saved-chain'?validateP45LinkedChainQuery:q.variant==='common-parameter'?validateLinkedCommonQuery:q.variant==='generic-common-parameter'?validateGenericLinkedQuery:validateLinkedFirstBandQuery;
test('42 actual First3D finite results and all old full outputs pass independent source and ODE replay',()=>{
 assert.equal(cases.length,42);for(const c of cases)assert.doesNotThrow(()=>parser(c.query)(c.response,c.query),c.name);
});
test('blank step controls omit options; finite original option contracts reject unsupported goals and defaults',()=>{
 assert.equal(linkedStepOptionsFromFields('','',1),undefined);assert.deepEqual(linkedStepOptionsFromFields('512','.02',1),{MaxSteps:512,MaxStepSize:.02});
 for(const c of cases.filter((c:any)=>c.name.endsWith('-maxsteps'))){const validate=validator(c.query);
  for(const ndsolveOptions of [{},{MaxSteps:0},{MaxSteps:1.1},{MaxSteps:4097},{MaxSteps:'Infinity'},{MaxStepSize:'Automatic'},{MaxStepSize:0},{MaxStepSize:Infinity},{AccuracyGoal:10},{MaxSteps:512,WorkingPrecision:30}])
   assert.throws(()=>validate({...c.query,ndsolveOptions}));
 }
});
test('only the actual first Darboux stage, original initial state, source definition and full s endpoints are admitted',()=>{
 for(const name of ['saved-first-8-smallstep','saved-chain-ip32-smallstep','common-subdomain-smallstep','generic-default-smallstep','independent-raw-prefix-2-smallstep']){
  const c=cases.find((x:any)=>x.name===name),parse=parser(c.query);
  for(const edit of [(r:any)=>{r.first3DIntegration.callerDefinitionCell='In[4085]';},(r:any)=>{r.first3DIntegration.controlledStages.push('FindRoot');},
   (r:any)=>{r.first3DIntegration.interpolationAndRootStagesControlled=true;},(r:any)=>{r.first3DIntegration.initialState[3]+=.1;},
   (r:any)=>{r.first3DIntegration.initialParameter+=.01;},(r:any)=>{r.first3DIntegration.stepOptions.definitionCell='In[3685]';},
   (r:any)=>{r.first3DIntegration.stepOptions.forwardParameters.pop();},(r:any)=>{r.first3DIntegration.stepOptions.options.MaxSteps=1;},
   (r:any)=>{r.first3DIntegration.stepOptions.wolframStepControllerReproduced=true;},(r:any)=>{delete r.first3DIntegration;},
   (r:any)=>{r.first3DIntegration.evaluations=24001;}]){const r=structuredClone(c.response);edit(r);assert.throws(()=>parse(r,c.query),name);}
 }
});
test('valid step tags cannot authorize forged spatial trajectories or altered original options',()=>{
 for(const c of cases.filter((c:any)=>c.name.endsWith('-smallstep'))){const r=structuredClone(c.response),row=r.sample.rows[4];
  if('foldedFirst' in row){row.foldedFirst[0]+=.01;row.foldedSecond[0]+=.01;}else for(const p of row.foldedCurves)p[0]+=.01;
  assert.throws(()=>parser(c.query)(r,c.query),c.name);
  assert.throws(()=>parser(c.query)(c.response,{...c.query,ndsolveOptions:{MaxSteps:4095,MaxStepSize:.01}}),c.name);
 }
});
test('actual source serialization preserves imported raw rules and keeps saved-chain root sequences unchanged',()=>{
 for(const c of cases){const q=validator(c.query)(JSON.parse(JSON.stringify(c.query)));assert.deepEqual(q,c.query);assert.doesNotThrow(()=>parser(q)(JSON.parse(JSON.stringify(c.response)),q));}
 for(const ip of [16,32,64]){const before=cases.find((c:any)=>c.name==='unchanged-saved-chain-ip'+ip).response,after=cases.find((c:any)=>c.name==='saved-chain-ip'+ip+'-smallstep').response;
  before.sample.rows.forEach((r:any,i:number)=>{for(const key of ['qValues','foldAnglesDeg','flatCurves'])assert.deepEqual(after.sample.rows[i][key],r[key]);});
 }
 for(const c of cases.filter((c:any)=>c.name.startsWith('independent-')&&c.name.endsWith('-smallstep'))){assert.deepEqual(c.response.curve2DSystems.systems,c.query.curve2DSystems);
  assert.equal(c.response.curve2DSystems.next2DThirdSystemUsed,false);assert.equal(c.response.independentRules.rawImportedValuesPreserved,true);}
});
