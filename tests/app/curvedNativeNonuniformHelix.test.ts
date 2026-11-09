import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NONUNIFORM_HELIX_NATIVE_PRESET,makeGenericNonuniformHelixSource,parseGenericNonuniformHelixResult,
  validateGenericNonuniformHelixQuery} from '../../src/app/curvedNativeNonuniformHelix';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-nonuniform-helix-native-20261001.json','utf8'));
const fixture=(name:string)=>fixtures.find((x:{name:string})=>x.name===name),copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
test('18 independent literal helix and fixed-IC DP54 fixtures retain sign branches and stages',()=>{
  for(const row of fixtures)assert.doesNotThrow(()=>parseGenericNonuniformHelixResult(row.response,row.query),row.name);
  const zero=fixture('zero-gamma-spatial-only');assert.equal(zero.response.flattening.status,'source-singularity');
  assert.ok(Math.hypot(...makeGenericNonuniformHelixSource(zero.query).evaluate(0).left.director)*zero.response.normalization.scale>.99);
  assert.equal(fixture('gamma-cross-zero').response.flattening.status,'unknown');
});
test('complete original query, safety AST, zero and signed radius/pitch without invented Space4 fields',()=>{
  for(const [key,value] of [['radius',true],['radius',1e7],['pitchAngle',11],['foldAngle','s.__class__'],['orientation',-1],['initialPoint',[1,0]],
    ['segments',7],['rulingSegments',65],['transverseEnd',0],['parameterEnd',0]])assert.throws(()=>validateGenericNonuniformHelixQuery({...NONUNIFORM_HELIX_NATIVE_PRESET,[key as string]:value}));
  for(const row of fixtures)assert.deepEqual(validateGenericNonuniformHelixQuery(row.query),row.query);
  assert.throws(()=>validateGenericNonuniformHelixQuery({family:'nonuniform-helix-generic-native'}));
});
test('both raw closed rules, derivatives, grids and each tiny EFG dimension strictly replayed',()=>{
  const f=fixture('original-in3968');
  for(const key of ['sourceBase','sourceBaseDerivative','sourceLeftDirector','sourceRightDirector','sourceLeftDirectorDerivative','sourceRightDirectorDerivative',
    'normalizedSourceBase','normalizedSourceBaseDerivative','normalizedSourceLeftDirector','normalizedSourceRightDirector','normalizedSourceLeftDirectorDerivative','normalizedSourceRightDirectorDerivative']){
    const r=copy(f.response);r.sample.rows[5][key][0]+=.01;assert.throws(()=>parseGenericNonuniformHelixResult(r,f.query),key);}
  for(const key of ['sourceLeft','sourceRight','normalizedSourceLeft','normalizedSourceRight','sourceLeftEFG','sourceRightEFG']){
    const r=copy(f.response);r.grid[5][key][3][0]+=.01;assert.throws(()=>parseGenericNonuniformHelixResult(r,f.query),key);}
  const large=fixture('large-radius');for(const stage of ['','flatten'])for(const side of ['Left','Right']){
    const r=copy(large.response),grid=stage?r.flattening.result.grid:r.grid;grid[5]['source'+side+'EFG'][3][2]=0;
    assert.throws(()=>parseGenericNonuniformHelixResult(r,large.query),'G near 1e-14 cannot be swallowed by max1');}
  const tiny=fixture('tiny-radius-and-width');const r=copy(tiny.response);r.sample.rows[5].sourceBase=[0,0,0];assert.throws(()=>parseGenericNonuniformHelixResult(r,tiny.query));
});
test('source binding, fixed IC, original frame/domain evidence and absent 2D cannot be promoted',()=>{
  const f=fixture('negative-radius-beyond-right-angle');
  for(const change of [
    (r:any)=>{r.query.radius=2.3;},(r:any)=>{r.source.rulingConstruction='Space4';},(r:any)=>{r.normalization.scale*=2;},
    (r:any)=>{r.flattening.initial.point=[0,0];},(r:any)=>{r.domain.cells[0].end-=.001;},(r:any)=>{r.domain.minimumLeftDenominatorLowerBound*=2;},
    (r:any)=>{r.domain.cells[0].normalizedRuleBounds[0][0]=[8,9];},(r:any)=>{r.flattening.result.sample.rows[3].targetBase[0]+=.1;},
    (r:any)=>{r.flattening.result.grid[5].normalizedTargetRight[2][0]+=.1;},(r:any)=>{r.flattening.result.sample.rows[5].coefficients.right.q*=-1;},
    (r:any)=>{r.flattening.result.certification.adoptableCreasePattern=true;},(r:any)=>{r.flattening.result.domain.cells[0].speedLowerBound=100;},
    (r:any)=>{r.flattening.result.domain.sourceStripRegularity.left={status:'degenerate',orientation:null,minimumAbsoluteJacobianLowerBound:null,reason:'fake focus'};
      r.flattening.result.certification.sourceLeftStripRegularityCertified=false;},
  ]){const r=copy(f.response);change(r);assert.throws(()=>parseGenericNonuniformHelixResult(r,f.query));}
  for(const name of ['zero-gamma-spatial-only','zero-radius-spatial-only','gamma-cross-zero','two-pi-planar-unknown']){
    const a=fixture(name),r=copy(a.response);r.flattening.status='computed';r.flattening.reason=null;r.flattening.result=f.response.flattening.result;
    assert.throws(()=>parseGenericNonuniformHelixResult(r,a.query));}
});
