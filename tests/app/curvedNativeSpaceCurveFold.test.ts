import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {GENERIC_SPACE_CURVE_FOLD_PRESET,validateGenericSpaceCurveFoldQuery,parseGenericSpaceCurveFoldResult,
  makeGenericSpaceCurveFoldSource,makeGenericSpaceCurveFoldReference,fetchGenericSpaceCurveFoldWhenIdle,
  type GenericSpaceCurveFoldResult} from '../../src/app/curvedNativeSpaceCurveFold';
const fixture=(name:string):GenericSpaceCurveFoldResult=>JSON.parse(readFileSync(`tests/fixtures/origamica-space-curve-fold-generic-${name}.json`,'utf8'));
const names=['noncircular','circle-positive','circle-negative','half-angle-pi','orientation-negative','nonlinear','reverse','variable-helix','tiny','focus','unknown'];
const near=(a:number,b:number,scale=1)=>assert.ok(Math.abs(a-b)<=2e-10*Math.max(scale,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const reject=(name:string,change:(r:GenericSpaceCurveFoldResult)=>void)=>{const r=fixture(name);change(r);assert.throws(()=>parseGenericSpaceCurveFoldResult(r,r.query),/回读/);};

test('eleven actual original four-source fixtures retain raw curves and pass independent fourth-order Sign/Abs and planar readback',()=>{
  for(const name of names){const r=fixture(name);parseGenericSpaceCurveFoldResult(r,r.query);assert.equal(r.sample.rows.length,r.query.segments+1);
    assert.equal(r.certification.integrationErrorIntervalCertified,false);assert.equal(r.certification.adoptableCreasePattern,false);}
});
test('a genuinely noncircular variable-angle curve has independently known unit rulings and a closed planar image',()=>{
  const r=fixture('noncircular'),ref=makeGenericSpaceCurveFoldReference(r.query,r.sample.rows.map(row=>row.s)),L=r.normalization.scale;
  for(const row of r.sample.rows){const s=row.s,den=Math.sqrt(25+6*s*s+s**4),target=ref.target(s);
    row.sourceBase.forEach((v,i)=>near(v,[Math.sin(s),s*s/4,1-Math.cos(s)][i]));
    row.sourceLeftDirector.forEach((v,i)=>near(v,[0,1,0][i]));
    row.sourceRightDirector.forEach((v,i)=>near(v,[4*Math.sin(s),3+s*s,-4*Math.cos(s)][i]/den));
    row.targetBase.forEach((v,i)=>near(v,[1-s*s/4,s][i]));
    row.targetLeftDirector.forEach((v,i)=>near(v,[-1,0][i]));
    row.targetRightDirector.forEach((v,i)=>near(v,[5-s*s,4*s][i]/den));
    target.base.forEach((v,i)=>near(v*L+[1,0][i],[1-s*s/4,s][i]));
    near(row.coefficients.curvature,.5*Math.sqrt(5+s*s)/(1+s*s/4)**1.5);near(row.coefficients.torsion,-2*s/(5+s*s));}
});
test('positive and negative fold sources preserve the supplied circle while the original Sign/Abs convention switches spatial sides',()=>{
  const positive=fixture('circle-positive'),negative=fixture('circle-negative');
  for(let i=0;i<positive.sample.rows.length;i++){const p=positive.sample.rows[i],n=negative.sample.rows[i];
    p.sourceBase.forEach((v,k)=>near(v,n.sourceBase[k]));near(p.foldAngleRad,-n.foldAngleRad);
    assert.equal(Math.sign(p.coefficients.left.q),1);assert.equal(Math.sign(n.coefficients.left.q),1);
    assert.equal(Math.sign(p.coefficients.right.q),-1);assert.equal(Math.sign(n.coefficients.right.q),-1);}
  const half=parseGenericSpaceCurveFoldResult(fixture('half-angle-pi'));near(half.sample.rows[0].foldAngleRad,Math.PI);
  assert.equal(half.certification.formalCommonFlatteningCertified,true);
});
test('the original wrapper always starts at the requested first parameter with [1,0] and [0,1], including nonlinear and reversed spatial curves',()=>{
  for(const name of ['nonlinear','reverse','orientation-negative','variable-helix']){const r=parseGenericSpaceCurveFoldResult(fixture(name));
    assert.deepEqual(r.initial.point,[1,0]);assert.deepEqual(r.initial.tangent,[0,1]);assert.equal(r.initial.parameter,r.query.parameterStart);
    assert.deepEqual(r.sample.rows[0].targetBase,[1,0]);assert.equal(r.query.foldCurve.length,3);}
  assert.equal(fixture('orientation-negative').query.orientation,-1);assert.notEqual(fixture('nonlinear').query.parameterStart,0);
});
test('true interval-budget unknown and focused widths retain full geometry and keep common local isometry separate from whole-strip regularity',()=>{
  for(const name of ['nonlinear','unknown']){const r=parseGenericSpaceCurveFoldResult(fixture(name));assert.equal(r.domain.evaluations,1024);
    assert.equal(r.certification.sourceRegularityCertified,false);assert.equal(r.certification.formalCommonFlatteningCertified,false);
    assert.equal(r.certification.finiteLeftMetricVerified,true);assert.equal(r.sample.rows.at(-1)!.s,r.query.parameterEnd);}
  const r=parseGenericSpaceCurveFoldResult(fixture('focus'));assert.equal(r.domain.sourceStripRegularity.left.status,'degenerate');
  assert.equal(r.domain.formalStripRegularity.left.status,'degenerate');assert.equal(r.domain.sourceStripRegularity.right.status,'verified');
  assert.equal(r.certification.formalCommonFlatteningCertified,true);assert.equal(r.certification.sourceLeftStripRegularityCertified,false);
});
test('four-source expression binding, all original Frenet normals, literal derivatives and target trajectory cannot be forged using plausible grids',()=>{
  reject('noncircular',r=>{r.sample.rows[3].sourceBinormal[0]+=.01;});reject('noncircular',r=>{r.sample.rows[3].sourceRightSurfaceNormal[1]+=.01;});
  reject('noncircular',r=>{r.sample.rows[3].coefficients.right.normalTangentProjection*=-1;});
  reject('noncircular',r=>{r.sample.rows[3].coefficients.left.normalizedQ*=2;});
  reject('noncircular',r=>{r.sample.rows[3].foldAngleDerivative+=.01;});reject('noncircular',r=>{r.grid[3].targetLeft[2][0]+=.01;});
  reject('noncircular',r=>{r.sample.rows[3].targetLeftDirectorDerivative[1]+=.01;});
  reject('noncircular',r=>{r.initial.tangent=[1,0];});reject('noncircular',r=>{r.source.flatteningInitialSource='arbitrary UI initial frame';});
});
test('tiny translated curves retain unit world rulings and verify physical jets plus every E/F/G component at its own scale',()=>{
  const r=parseGenericSpaceCurveFoldResult(fixture('tiny')),L=r.normalization.scale;assert.ok(L<1e-7);
  for(const row of r.sample.rows)near(Math.hypot(...row.sourceLeftDirector),1);
  assert.ok(Math.hypot(...r.sample.rows[0].normalizedSourceLeftDirector)>1e7);
  reject('tiny',r=>{r.sample.rows[3].sourceBaseDerivative[0]+=1e-10;});
  reject('tiny',r=>{r.sample.rows[3].normalizedTargetBaseDerivative[0]*=2;});
  reject('tiny',r=>{r.grid[3].sourceRightEFG[0][0]*=2;});reject('tiny',r=>{r.grid[3].targetRightEFG[0][1]*=2;});
  reject('tiny',r=>{r.grid[3].targetRightEFG[0][2]*=2;});
});
test('interval branch signs, lower bounds, certification flags and complete domain partitions have strict source-bound meaning',()=>{
  reject('noncircular',r=>{r.domain.cells[0].leftSign*=-1;});reject('noncircular',r=>{r.domain.minimumCurvatureLowerBound=100;});
  reject('noncircular',r=>{r.domain.cells[0].start=.001;});reject('unknown',r=>{r.certification.unitRulingsAnalytic=true;});
  reject('unknown',r=>{r.certification.formalCommonFlatteningCertified=true;});reject('focus',r=>{r.certification.sourceLeftStripRegularityCertified=true;});
  reject('noncircular',r=>{r.certification.adoptableCreasePattern=true as false;});
});
test('the exact four-source query permits pi, safe variable angle and arbitrary curves without inheriting planar-to-3D recovery fields',()=>{
  assert.deepEqual(validateGenericSpaceCurveFoldQuery(GENERIC_SPACE_CURVE_FOLD_PRESET),GENERIC_SPACE_CURVE_FOLD_PRESET);
  validateGenericSpaceCurveFoldQuery({...GENERIC_SPACE_CURVE_FOLD_PRESET,foldAngle:'pi'});
  for(const change of [{foldCurve:['s','0']},{foldAngle:'eval(s)'},{orientation:0},{initialPoint:[1,0]},{initialParameter:0},
    {initialFoldAngleRad:Math.PI},{sigma:1},{parameterStart:1},{rulingSegments:65}])
    assert.throws(()=>validateGenericSpaceCurveFoldQuery({...GENERIC_SPACE_CURVE_FOLD_PRESET,...change}));
  assert.throws(()=>makeGenericSpaceCurveFoldSource({...GENERIC_SPACE_CURVE_FOLD_PRESET,foldAngle:'0'}).evaluate(0));
});
test('shared-worker busy retries preserve the four sources and use the ordinary local-session API request',async()=>{
  const original=globalThis.fetch,r=fixture('noncircular');let calls=0;
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),'/api/tessellation/curved-space-curve-fold-generic');
    assert.deepEqual(JSON.parse(String(init?.body)),r.query);return new Response(JSON.stringify(++calls===1?{error:'已有镶嵌计算正在进行，请稍后重试。'}:r),
      {status:calls===1?429:200,headers:{'Content-Type':'application/json'}});};
  try{const next=await fetchGenericSpaceCurveFoldWhenIdle(r.query,AbortSignal.timeout(5000));assert.equal(calls,2);assert.deepEqual(next.query,r.query);}
  finally{globalThis.fetch=original;}
});
