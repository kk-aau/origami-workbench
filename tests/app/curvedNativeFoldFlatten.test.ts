import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GENERIC_FOLD_FLATTEN_PRESET,validateGenericFoldFlattenQuery,parseGenericFoldFlattenResult,
  fetchGenericFoldFlattenWhenIdle,type GenericFoldFlattenResult} from '../../src/app/curvedNativeFoldFlatten';
const fixture=(name:string):GenericFoldFlattenResult=>JSON.parse(readFileSync(new URL(`../fixtures/origamica-fold-flatten-generic-${name}.json`,import.meta.url),'utf8'));
const names=['shared','interior','tiny','tiny-directors','incompatible','nondevelopable','unknown','focus','reverse'];
const near=(a:number,b:number,tol=2e-10)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const reject=(name:string,change:(r:GenericFoldFlattenResult)=>void)=>{const r=fixture(name);change(r);assert.throws(()=>parseGenericFoldFlattenResult(r,r.query),/回读/);};
test('independently reads all original direct-fold source fixtures with both raw director lengths',()=>{
  for(const name of names){const r=fixture(name);parseGenericFoldFlattenResult(r,r.query);
    assert.equal(r.sample.rows.length,r.query.segments+1);assert.equal(r.grid.length,r.query.segments+1);
    assert.equal(r.certification.integrationErrorIntervalCertified,false);assert.equal(r.certification.adoptableCreasePattern,false);}
});
test('true noncircular common unfolding matches independent closed source equations and the original negative right q',()=>{
  const r=fixture('shared');for(const row of r.sample.rows){const s=row.s,k=(1+.1*s)*Math.sqrt(1+s*s/4)/(5+s*s);
    near(row.targetBase[0],s);near(row.targetBase[1],s*s/4);
    near(row.targetLeftDirector[0],0);near(row.targetLeftDirector[1],2+.1*s);
    near(row.targetRightDirector[0],4*s*k);near(row.targetRightDirector[1],(s*s-5)*k);
    assert.ok(row.coefficients.right.q<0);near(row.coefficients.left.g,.5/(1+s*s/4));
    near(row.coefficients.right.g,.5/(1+s*s/4));}
});
test('interior initial point and tangent recover the original curve on both sides without moving ui',()=>{
  const r=fixture('interior'),q=r.query,angle=Math.atan2(q.initialTangent[1],q.initialTangent[0])-Math.atan(q.initialParameter/2),
    c=Math.cos(angle),h=Math.sin(angle);assert.ok(q.initialParameter>q.parameterStart&&q.initialParameter<q.parameterEnd);
  for(const row of r.sample.rows){const x=row.s-q.initialParameter,y=(row.s*row.s-q.initialParameter*q.initialParameter)/4;
    near(row.targetBase[0],q.initialPoint[0]+c*x-h*y);near(row.targetBase[1],q.initialPoint[1]+h*x+c*y);}
});
test('two developable sources with different geodesic curvatures keep their original unequal right metric',()=>{
  const r=parseGenericFoldFlattenResult(fixture('incompatible'));
  assert.equal(r.certification.leftSourceDevelopabilityAnalytic,true);assert.equal(r.certification.rightSourceDevelopabilityAnalytic,true);
  assert.equal(r.certification.sharedGeodesicCurvatureAnalytic,false);assert.equal(r.certification.finiteLeftMetricVerified,true);
  assert.equal(r.certification.finiteRightMetricVerified,false);assert.equal(r.certification.formalCommonFlatteningCertified,false);
  for(const row of r.grid)for(let j=0;j<=r.query.rulingSegments;j++){
    const w=r.query.transverseStart+(r.query.transverseEnd-r.query.transverseStart)*j/r.query.rulingSegments,L=r.normalization.scale;
    near(row.sourceRightEFG[j][0]*L*L,1);near(row.targetRightEFG[j][0]*L*L,(1+w)**2);}
});
test('nondevelopability, real interval budget exhaustion and four independent strip checks remain distinct',()=>{
  const bad=parseGenericFoldFlattenResult(fixture('nondevelopable')),unknown=parseGenericFoldFlattenResult(fixture('unknown')),
    focus=parseGenericFoldFlattenResult(fixture('focus'));
  assert.equal(bad.certification.finiteSourceDevelopabilityVerified,false);assert.equal(bad.certification.formalCommonFlatteningCertified,false);
  assert.equal(unknown.domain.evaluations,1024);assert.equal(unknown.domain.certified,false);assert.equal(unknown.sample.rows.length,9);
  assert.equal(unknown.certification.formalCommonFlatteningCertified,false);
  assert.equal(focus.domain.formalStripRegularity.left.status,'degenerate');
  assert.equal(focus.domain.formalStripRegularity.right.status,'verified');
});
test('source, trajectory, initial frame, signed right coefficient and interval metadata tampering are rejected',()=>{
  reject('shared',r=>{r.sample.rows[3].normalizedSourceRightDirector[0]+=.01;});
  reject('shared',r=>{r.sample.rows[3].normalizedTargetBase[0]+=.01;});
  reject('interior',r=>{r.initial.point[1]+=.01;});
  reject('shared',r=>{r.sample.rows[3].coefficients.right.q*=-1;});
  reject('shared',r=>{r.sample.rows[3].coefficients.right.normalizedQ*=-1;});
  reject('shared',r=>{r.domain.cells[0].formalRightNormalizedJacobianBounds=[-1e-5,1e-5];});
  reject('shared',r=>{r.domain.minimumRightTransverseLowerBound=100;});
  reject('incompatible',r=>{r.certification.formalCommonFlatteningCertified=true;});
  reject('unknown',r=>{r.certification.sourceRegularityCertified=true;});
});
test('tiny physical director and metric fields are checked at their own scales',()=>{
  reject('tiny',r=>{r.sample.rows[3].targetBaseDerivative[0]+=1e-10;});
  reject('tiny-directors',r=>{r.sample.rows[3].normalizedTargetRightDirector[1]*=2;});
  reject('tiny-directors',r=>{r.sample.rows[3].targetLeftDirector[1]*=2;});
  reject('tiny-directors',r=>{r.grid[3].targetRightEFG[0][2]*=2;});
});
test('nine source dimensions, original initial contract and safe expression limits are enforced',()=>{
  assert.deepEqual(validateGenericFoldFlattenQuery(GENERIC_FOLD_FLATTEN_PRESET),GENERIC_FOLD_FLATTEN_PRESET);
  for(const change of [{foldCurve:['s','0']},{rightDirector:['eval(s)','1','0']},{sigma:1},{initialParameter:2},
    {initialTangent:[2,0]},{initialPoint:[0,0,0]},{segments:7},{transverseStart:1}])
    assert.throws(()=>validateGenericFoldFlattenQuery({...GENERIC_FOLD_FLATTEN_PRESET,...change}));
});
test('a raw near-unit planar initial tangent cannot certify the common exact orthonormal unfolding',()=>{
  const r=parseGenericFoldFlattenResult(fixture('near-frame'));assert.equal(r.query.initialTangent[0],1+4.5e-11);
  assert.equal(r.initial.frameCompatible,false);assert.equal(r.certification.initialFrameCompatible,false);
  assert.equal(r.domain.certified,true);assert.equal(r.certification.formalCommonFlatteningCertified,false);
  for(const side of ['left','right'] as const){assert.equal(r.domain.sourceStripRegularity[side].status,'verified');
    assert.equal(r.domain.formalStripRegularity[side].status,'unknown');}
  reject('near-frame',x=>{x.initial.frameGramResidual=0;});reject('near-frame',x=>{x.certification.initialFrameCompatible=true;});
  reject('near-frame',x=>{x.certification.formalCommonFlatteningCertified=true;});
});
test('the original shared-worker busy wording retries until the same fold query is available',async()=>{
  const original=globalThis.fetch,r=fixture('shared');let calls=0;
  globalThis.fetch=async()=>new Response(JSON.stringify(++calls===1?{error:'已有镶嵌计算正在进行，请等待或取消后重试。'}:r),
    {status:calls===1?429:200,headers:{'Content-Type':'application/json'}});
  try{const parsed=await fetchGenericFoldFlattenWhenIdle(r.query,AbortSignal.timeout(5000));assert.equal(calls,2);assert.deepEqual(parsed.query,r.query);}
  finally{globalThis.fetch=original;}
});
