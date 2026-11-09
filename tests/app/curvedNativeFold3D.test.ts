import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {GENERIC_FOLD_3D_PRESET,validateGenericFold3DQuery,parseGenericFold3DResult,makeGenericFold3DSource,
  makeGenericFold3DReference,fetchGenericFold3DWhenIdle,type GenericFold3DResult} from '../../src/app/curvedNativeFold3D';
import {connect} from '../../src/app/api';
const fixture=(name:string):GenericFold3DResult=>JSON.parse(readFileSync(new URL(`../fixtures/origamica-fold-3d-generic-${name}.json`,import.meta.url),'utf8'));
const names=['shared','circle-positive','circle-negative','interior','negative-curvature','reverse','tiny','tiny-directors',
  'cosine-branch-negative','unknown','focus','raw-frame'];
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=2e-10*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const reject=(name:string,change:(r:GenericFold3DResult)=>void)=>{const r=fixture(name);change(r);assert.throws(()=>parseGenericFold3DResult(r,r.query),/回读/);};

test('all twelve actual original six-source fixtures pass independent source and bilateral Frenet readback',()=>{
  for(const name of names){const r=fixture(name);parseGenericFold3DResult(r,r.query);assert.equal(r.sample.rows.length,r.query.segments+1);
    assert.equal(r.certification.integrationErrorIntervalCertified,false);assert.equal(r.certification.adoptableCreasePattern,false);}
});
test('noncircular variable speed, angle, curvature and torsion recover the independent original spatial closed form',()=>{
  const r=fixture('shared'),reference=makeGenericFold3DReference(r.query,r.sample.rows.map(row=>row.s));
  for(const row of r.sample.rows){const s=row.s,k=(1+.1*s)*Math.sqrt(1+s*s/4)/(5+s*s);
    row.targetBase.forEach((v,i)=>near(v,[Math.sin(s),s*s/4,1-Math.cos(s)][i]));
    row.targetLeftDirector.forEach((v,i)=>near(v,[0,2+.1*s,0][i]));
    row.targetRightDirector.forEach((v,i)=>near(v,[4*k*Math.sin(s),(3+s*s)*k,-4*k*Math.cos(s)][i]));
    near(row.foldAngleRad,-2*Math.acos(1/Math.sqrt(5+s*s)));
    near(row.coefficients.curvature,.5*Math.sqrt(5+s*s)/(1+s*s/4)**1.5);near(row.coefficients.torsion,-2*s/(5+s*s));
    near(reference.target(s).base[0]*r.normalization.scale,Math.sin(s));}
});
test('positive and negative circle fold angles retain the same planar-source spatial curve and reverse the folded side',()=>{
  for(const [name,e] of [['circle-positive',1],['circle-negative',-1]] as const){const r=fixture(name);
    for(const row of r.sample.rows){near(row.targetBase[0],Math.cos(row.s));near(row.targetBase[1],Math.sin(row.s));near(row.targetBase[2],0);
      near(row.foldAngleRad,e*2*Math.PI/3);}
    assert.equal(Math.sign(r.sample.rows.at(-1)!.targetLeftDirector[2]),e);}
});
test('interior initial values, negative source curvature and nonprincipal cosine branches retain the original raw frame',()=>{
  const interior=fixture('interior');assert.ok(interior.query.initialParameter>interior.query.parameterStart);
  assert.ok(interior.query.initialParameter<interior.query.parameterEnd);parseGenericFold3DResult(interior);
  const negative=fixture('negative-curvature');assert.equal(negative.initial.sourceOrientation,-1);
  assert.deepEqual(negative.initial.binormal,negative.query.initialTopBinormal.map(x=>-x));
  const other=fixture('cosine-branch-negative');assert.equal(other.domain.angleBranch.cosineHalfAngleSign,-1);
  assert.ok(other.query.initialFoldAngleRad>Math.PI);near(other.initial.foldAngleRad,other.query.initialFoldAngleRad);
});
test('real source-budget unknown, focal widths and raw near-unit frames preserve geometry and distinct formal certificates',()=>{
  const unknown=parseGenericFold3DResult(fixture('unknown'));assert.equal(unknown.domain.evaluations,1024);
  assert.equal(unknown.certification.formalIsometryCertified,false);assert.equal(unknown.sample.rows.length,9);
  const focus=parseGenericFold3DResult(fixture('focus'));assert.equal(focus.query.transverseEnd,1.1);
  assert.equal(focus.domain.sourceStripRegularity.left.status,'degenerate');assert.equal(focus.domain.sourceStripRegularity.right.status,'verified');
  const frame=parseGenericFold3DResult(fixture('raw-frame'));assert.deepEqual(frame.query.initialTangent,[1,9e-11,0]);
  assert.equal(frame.initial.frameCompatible,false);assert.equal(frame.certification.finiteRightMetricVerified,true);
  assert.equal(frame.certification.formalIsometryCertified,false);assert.equal(frame.domain.sourceStripRegularity.left.status,'verified');
  assert.equal(frame.domain.formalStripRegularity.left.status,'unknown');
});
test('source jets, angle, initial binormal, recovered frame and interval metadata cannot be replaced by plausible points',()=>{
  reject('shared',r=>{r.sample.rows[3].normalizedSourceRightDirector[1]*=2;});
  reject('shared',r=>{r.sample.rows[3].normalizedTargetBase[0]+=.01;});reject('shared',r=>{r.sample.rows[3].foldAngleRad+=.01;});
  reject('negative-curvature',r=>{r.initial.binormal=r.query.initialTopBinormal.slice();});
  reject('shared',r=>{r.sample.rows[3].targetBinormal[1]+=.01;});reject('shared',r=>{r.domain.angleBranch.sineHalfAngleBounds=[-.1,-.01];});
  reject('shared',r=>{r.domain.minimumAbsoluteCurvatureLowerBound=100;});reject('unknown',r=>{r.certification.angleBranchCertified=true;});
  reject('raw-frame',r=>{r.initial.frameGramResidual=0;});reject('raw-frame',r=>{r.certification.initialFrameCompatible=true;});
  reject('raw-frame',r=>{r.certification.formalIsometryCertified=true;});
});
test('tiny physical source/target director, coefficient and each EFG component are verified at their own scales',()=>{
  reject('tiny',r=>{r.sample.rows[3].targetBaseDerivative[0]+=1e-10;});
  reject('tiny-directors',r=>{r.sample.rows[3].normalizedTargetLeftDirector[1]*=2;});
  reject('tiny-directors',r=>{r.sample.rows[3].targetRightDirector[2]*=2;});
  reject('tiny-directors',r=>{r.sample.rows[3].coefficients.right.normalizedQ*=2;});
  reject('tiny-directors',r=>{r.grid[3].targetRightEFG[0][2]*=2;});
});
test('original query contract accepts six safe expressions and rejects foreign initial conventions or literal half-angle poles',()=>{
  assert.deepEqual(validateGenericFold3DQuery(GENERIC_FOLD_3D_PRESET),GENERIC_FOLD_3D_PRESET);
  for(const change of [{foldCurve:['s','0','0']},{leftDirector:['eval(s)','1']},{sigma:1},{initialFoldAngleRad:0},
    {initialFoldAngleRad:Math.PI},{initialFoldAngleRad:2*Math.PI},{initialTangent:[2,0,0]},{initialTopBinormal:[1,0,0]},
    {initialParameter:-1},{rulingSegments:65}])assert.throws(()=>validateGenericFold3DQuery({...GENERIC_FOLD_3D_PRESET,...change}));
});
test('independent safe source jets preserve original signed p q and the true angle coefficient instead of normalizing directors',()=>{
  const r=fixture('shared'),ref=makeGenericFold3DSource(r.query);for(const s of [0,.37,1]){const p=ref.evaluate(s),L=ref.normalization.scale;
    near(Math.hypot(...p.left.director)*L,2+.1*s);assert.ok(p.right.q>0);
    near(p.angleCoefficient,2*s/((4+s*s)*(5+s*s)));}
});
test('the shared-worker busy response retries the same six-source input without changing raw initial values',async()=>{
  const original=globalThis.fetch,r=fixture('shared');let calls=0;
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/health')return Response.json({token:'native-fold-test-token'});
    assert.equal(new Headers(options?.headers).get('X-Zhezhi-Token'),'native-fold-test-token');
    assert.deepEqual(JSON.parse(options?.body as string),r.query);
    return new Response(JSON.stringify(++calls===1?{error:'已有镶嵌计算正在进行，请等待或取消后重试。'}:r),
      {status:calls===1?429:200,headers:{'Content-Type':'application/json'}});};
  try{await connect();const result=await fetchGenericFold3DWhenIdle(r.query,AbortSignal.timeout(5000));assert.equal(calls,2);assert.deepEqual(result.query,r.query);}
  finally{globalThis.fetch=original;}
});
