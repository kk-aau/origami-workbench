import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESHAPE_INITIAL,SAVED_RESHAPE,reshapeFirstForm,reshapeFrame,
  reshapeSurface,sampleReshape,validateReshapeParams,
  type ReshapeStage,
} from '../../src/app/curvedGenericCylinderReshape';

const close=(actual:number,expected:number,tol=1e-11)=>
  assert.ok(Math.abs(actual-expected)<=tol,`${actual} != ${expected}`);

test('saved source inputs and both target initial conditions stay distinct',()=>{
  assert.deepEqual(RESHAPE_INITIAL,{u:0,b:[0,0,0],d:[0,1,0],t:[1,0,0],sigma:1});
  close(reshapeFrame(SAVED_RESHAPE['flatten-cylinder'],'source',0).b[0],-1);
  assert.deepEqual(reshapeFrame(SAVED_RESHAPE['curl-plane'],'source',0).b,[0,0,0]);
  for(const p of Object.values(SAVED_RESHAPE)){
    const at=reshapeFrame(p,'target',0);
    for(const [actual,expected] of [[at.b,RESHAPE_INITIAL.b],[at.d,RESHAPE_INITIAL.d],
      [at.t,RESHAPE_INITIAL.t],[at.l,[0,1,0]],[at.normal,[0,0,1]]])
      actual.forEach((value,i)=>close(value,expected[i]));
  }
});

test('source-derived analytic targets satisfy initial-value Darboux system',()=>{
  for(const u of [0,.2,1.1,Math.PI]){
    const flat=reshapeFrame(SAVED_RESHAPE['flatten-cylinder'],'target',u);
    const curled=reshapeFrame(SAVED_RESHAPE['curl-plane'],'target',u);
    assert.deepEqual(flat.b,[u,0,0]);
    close(curled.b[0],Math.sin(u));
    close(curled.b[2],1-Math.cos(u));
    close(curled.t[0],Math.cos(u));
    close(curled.normal[0],-Math.sin(u));
    close(curled.normal[2],Math.cos(u));
  }
});

test('both saved surfaces have exactly matching first forms, no focal loss and requested curvature',()=>{
  const cases=[['flatten-cylinder',[-1,0]],['curl-plane',[0,1]]] as const;
  for(const [mode,curvatures] of cases){
    const p=SAVED_RESHAPE[mode];
    for(const [i,stage] of (['source','target'] as ReshapeStage[]).entries())
      for(const u of [0,.4,2,Math.PI]){
        close(reshapeFrame(p,stage,u).normalCurvature,curvatures[i]);
        for(const v of [0,.5,1]){
          const form=reshapeFirstForm(p,stage,u,v);
          close(form.E,1);close(form.F,0);close(form.G,1);
          close(form.regularity,1);
        }
      }
  }
});

test('numeric examples preserve source labels but sampling is not exact FOLD geometry',()=>{
  for(const mode of ['flatten-cylinder','curl-plane'] as const){
    const p=SAVED_RESHAPE[mode],sample=sampleReshape({...p,curveSegments:64});
    assert.equal(sample.parameterValues.length,65);
    assert.equal(sample.parameterValues.at(-1),Math.PI);
    assert.equal(sample.stages.source.crease.length,65);
    assert.equal(sample.stages.target.outerBoundary.length,65);
    assert.deepEqual(sample.sourceCells,mode==='flatten-cylinder'?
      ['In[3891]','In[3896]']:['In[3892]','In[3897]']);
    assert.equal(sample.wolframNumericalOutputReproduced,false);
    assert.equal(sample.exactStraightCreaseFOLD,false);
    const length=(stage:ReshapeStage)=>{
      const a=reshapeSurface(p,stage,0,0),b=reshapeSurface(p,stage,Math.PI,0);
      return Math.hypot(...a.map((x,i)=>x-b[i]));
    };
    close(Math.min(length('source'),length('target')),2);
    close(Math.max(length('source'),length('target')),Math.PI);
  }
});

test('only saved-case finite subdomains are accepted',()=>{
  for(const patch of [
    {mode:'other'},{parameterEnd:0},{parameterEnd:Math.PI+.1},
    {rulingWidth:0},{rulingWidth:1.1},{rulingWidth:true},
    {curveSegments:15},{curveSegments:1.2},{unexpected:1},
  ])assert.throws(()=>validateReshapeParams({...SAVED_RESHAPE['flatten-cylinder'],...patch}));
  assert.throws(()=>reshapeSurface(SAVED_RESHAPE['curl-plane'],'target',1,1.1));
});
