import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GENERIC_DARBOUX_FLATTEN_PRESET,GENERIC_DARBOUX_RESHAPE_PRESET,makeGenericDarbouxEvaluator,
  parseGenericDarbouxResult,validateGenericDarbouxQuery,fetchGenericDarbouxWhenIdle,type GenericDarbouxResult} from '../../src/app/curvedNativeGenericDarboux';
const fixture=(name:string):GenericDarbouxResult=>JSON.parse(readFileSync(new URL(`../fixtures/origamica-generic-darboux-${name}.json`,import.meta.url),'utf8'));
const names=['flatten','reshape','flatten-interior','reshape-interior','flatten-tiny','reshape-tiny','nondevelopable','hint','unknown','cone','tiny-director'];
const near=(a:number,b:number,tol=2e-10)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const reject=(name:string,change:(r:GenericDarbouxResult)=>void)=>{const r=fixture(name);change(r);assert.throws(()=>parseGenericDarbouxResult(r,r.query),/回读/);};

test('strictly reads all actual general Darboux source fixtures with independent bidirectional ODE recovery',()=>{
  for(const name of names){const r=fixture(name),parsed=parseGenericDarbouxResult(r,r.query);
    assert.equal(parsed.family,'origamica-generic-darboux');assert.equal(parsed.sample.rows.length,r.query.segments+1);
    assert.equal(parsed.certification.integrationErrorIntervalCertified,false);
    assert.equal(parsed.certification.adoptableCreasePattern,false);
  }
});
test('noncircular nonconstant-speed flattening matches an independent exact primitive',()=>{
  const r=fixture('flatten'),x=(s:number)=>.5*s*Math.sqrt(1+.04*s*s)+2.5*Math.asinh(.2*s);
  for(const row of r.sample.rows){near(row.targetBase[0],x(row.s));near(row.targetBase[1],.2*row.s**3);
    near(row.targetDirector[0],0);near(row.targetDirector[1],1);
    for(let j=0;j<=r.query.rulingSegments;j++){
      const [E,F,G]=r.grid[r.sample.rows.indexOf(row)].targetEFG[j],L=r.normalization.scale;
      near(E*L*L,1+.04*row.s**2+.36*row.s**4);near(F*L*L,.6*row.s**2);near(G*L*L,1);
    }
  }
});
test('arbitrary interior planar initial point and tangent determine both sides of the recovered curve',()=>{
  const r=fixture('flatten-interior'),q=r.query,ui=q.initialParameter,
    x=(s:number)=>.5*s*Math.sqrt(1+.04*s*s)+2.5*Math.asinh(.2*s),t=q.initialTangent,
    angle=Math.atan2(t[1],t[0])-Math.atan2(q.sigma*.6*ui**2,Math.sqrt(1+.04*ui**2)),c=Math.cos(angle),h=Math.sin(angle);
  assert.ok(ui>q.parameterStart&&ui<q.parameterEnd);
  for(const row of r.sample.rows){const dx=x(row.s)-x(ui),dy=q.sigma*.2*(row.s**3-ui**3);
    near(row.targetBase[0],q.initialPoint[0]+c*dx-h*dy);
    near(row.targetBase[1],q.initialPoint[1]+h*dx+c*dy);
  }
});
test('nondevelopable source, real interval budget exhaustion and cone focus retain separate flags and complete output',()=>{
  const bad=parseGenericDarbouxResult(fixture('nondevelopable')),
    unknown=parseGenericDarbouxResult(fixture('unknown')),cone=parseGenericDarbouxResult(fixture('cone'));
  assert.equal(bad.diagnostics.sourceDevelopability.status,'incompatible');
  assert.equal(bad.certification.finiteMetricVerified,false);assert.equal(bad.certification.formalIsometryCertified,false);
  assert.ok(bad.diagnostics.maximumRelativeMetricDifference>.03);
  assert.equal(unknown.domain.evaluations,1024);assert.equal(unknown.domain.certified,false);
  assert.equal(unknown.certification.sourceDevelopabilityAnalytic,true);assert.equal(unknown.certification.formalIsometryCertified,false);
  assert.equal(unknown.sample.rows.length,unknown.query.segments+1);assert.ok(unknown.domain.unresolved.length);
  assert.equal(cone.domain.formalStripRegularity.status,'degenerate');
  assert.equal(cone.certification.formalStripRegularityCertified,false);assert.equal(cone.certification.formalIsometryCertified,true);
});
test('original reshape director hint controls orientation while requested and computed lengths remain distinct',()=>{
  const r=parseGenericDarbouxResult(fixture('hint'));assert.equal(r.query.family,'reshape-generic-native');
  assert.equal(r.initial.directorCompatible,false);assert.ok(r.initial.normalizedDirectorResidual!>0);
  assert.notDeepEqual(r.initial.computedDirector,r.initial.requestedDirector);
  assert.equal(r.certification.finiteMetricVerified,true);
  reject('hint',x=>{x.initial.computedDirector=x.initial.requestedDirector!.slice();});
});
test('general queries enforce original dimensions, unit tangent, domain and safe source contracts',()=>{
  for(const q of [GENERIC_DARBOUX_FLATTEN_PRESET,GENERIC_DARBOUX_RESHAPE_PRESET])assert.deepEqual(validateGenericDarbouxQuery(q),q);
  for(const patch of [{director:['0','1']},{baseCurve:['s','0','__import__("os")']},{sigma:0},
    {initialParameter:2},{initialTangent:[2,0]},{segments:true},{rulingSegments:65},{extra:1}])
    assert.throws(()=>validateGenericDarbouxQuery({...GENERIC_DARBOUX_FLATTEN_PRESET,...patch}));
  assert.throws(()=>validateGenericDarbouxQuery({...GENERIC_DARBOUX_RESHAPE_PRESET,initialDirector:[1,0,0]}));
  assert.throws(()=>validateGenericDarbouxQuery({...GENERIC_DARBOUX_RESHAPE_PRESET,normalCurvature:'eval(s)'}));
  const odd=validateGenericDarbouxQuery({...GENERIC_DARBOUX_RESHAPE_PRESET,rulingSegments:3});assert.equal(odd.rulingSegments,3);
});
test('strict readback rejects source jets, corresponding geometry, altered initial point and false numerical trajectory',()=>{
  reject('flatten',r=>{r.sample.rows[3].normalizedSourceDirector[2]+=.01;});
  reject('reshape',r=>{r.grid[3].normalizedTarget[2][0]+=.01;});
  reject('reshape-interior',r=>{r.initial.point[0]+=.01;});
  reject('reshape',r=>{for(const row of r.sample.rows){
    row.normalizedTargetBase=row.normalizedSourceBase.slice();row.targetBase=row.sourceBase.slice();
    row.normalizedTargetBaseDerivative=row.normalizedSourceBaseDerivative.slice();row.targetBaseDerivative=row.sourceBaseDerivative.slice();
  }});
  reject('flatten',r=>{r.sample.rows[4].coefficients.normalizedQPrime+=.02;});
});
test('interval, source and ODE error claims cannot be promoted independently of their evidence',()=>{
  reject('flatten',r=>{r.source.directorNormalized=true as never;});
  reject('flatten',r=>{r.certification.integrationErrorIntervalCertified=true as never;});
  reject('unknown',r=>{r.certification.formalIsometryCertified=true;});
  reject('nondevelopable',r=>{r.certification.finiteMetricVerified=true;});
  reject('flatten',r=>{r.domain.cells[0].transverseLowerBound=100;});
  reject('flatten',r=>{r.domain.minimumSpeedLowerBound=100;});
  reject('unknown',r=>{r.domain.formalStripRegularity={status:'verified',orientation:1,minimumAbsoluteJacobianLowerBound:1,reason:null};
    r.certification.formalStripRegularityCertified=true;});
  reject('flatten',r=>{r.domain.cells[0].end-=.1;});
});
test('tiny world derivatives and tiny directors use their own physical scales instead of an absolute unit floor',()=>{
  reject('flatten-tiny',r=>{r.sample.rows[3].targetBaseDerivative[0]+=1e-10;});
  reject('reshape-tiny',r=>{r.sample.rows[2].targetDirector[0]+=1e-10;});
  const tiny=fixture('tiny-director');parseGenericDarbouxResult(tiny);
  assert.equal(tiny.sample.rows[0].targetDirector[1],1e-10);near(tiny.grid[0].targetEFG[0][2]/1e-20,1);
  reject('tiny-director',r=>{r.sample.rows[3].normalizedTargetDirector[1]*=2;});
  reject('tiny-director',r=>{r.sample.rows[3].targetDirector[1]*=2;});
  reject('tiny-director',r=>{r.sample.rows[3].coefficients.normalizedQ*=2;});
  reject('tiny-director',r=>{r.sample.rows[3].coefficients.q*=2;});
  reject('tiny-director',r=>{r.grid[3].targetEFG[0][2]*=2;});
});
test('independent source evaluator preserves nonunit ruling speed and the general p q metric',()=>{
  const r=fixture('reshape'),evaluate=makeGenericDarbouxEvaluator(r.query);
  for(const s of [0,.37,1]){const p=evaluate.evaluate(s),L=evaluate.normalization.scale;
    near((p.p*p.p+p.q*p.q)*L*L,(1+.1*s)**2);
    near(Math.hypot(...p.director)*L,1+.1*s);assert.ok(Math.abs(p.z)>0);
  }
});
test('raw near-unit flatten and reshape initial frames retain their real trajectory without an orthonormal-frame certificate',()=>{
  for(const name of ['flatten-near-frame','reshape-near-frame']){
    const r=parseGenericDarbouxResult(fixture(name));assert.equal(r.query.initialTangent[0],1+4.5e-11);
    assert.ok(r.initial.frameGramResidual>r.initial.frameCompatibilityTolerance);assert.equal(r.initial.frameCompatible,false);
    assert.equal(r.certification.initialFrameCompatible,false);assert.equal(r.certification.formalIsometryCertified,false);
    assert.equal(r.domain.certified,true);assert.equal(r.domain.formalStripRegularity.status,'unknown');
    reject(name,x=>{x.initial.frameGramResidual=0;});reject(name,x=>{x.initial.frameCompatible=true;});
    reject(name,x=>{x.certification.formalIsometryCertified=true;});}
});
test('the actual shared-worker busy response retries and returns the requested source result',async()=>{
  const original=globalThis.fetch,r=fixture('flatten');let calls=0;
  globalThis.fetch=async()=>new Response(JSON.stringify(++calls===1?
    {error:'已有镶嵌计算正在进行，请等待或取消后重试。'}:r),{status:calls===1?429:200,headers:{'Content-Type':'application/json'}});
  try{const result=await fetchGenericDarbouxWhenIdle(r.query,AbortSignal.timeout(5000));
    assert.equal(calls,2);assert.deepEqual(result.query,r.query);}
  finally{globalThis.fetch=original;}
});
