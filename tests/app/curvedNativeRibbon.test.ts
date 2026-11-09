import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {GENERIC_RIBBON_PRESET,validateGenericRibbonQuery,parseGenericRibbonResult,makeGenericRibbonSource,makeGenericRibbonReference,
  fetchGenericRibbonWhenIdle,type GenericRibbonResult} from '../../src/app/curvedNativeRibbon';
const fixture=(name:string):GenericRibbonResult=>JSON.parse(readFileSync(`tests/fixtures/origamica-ribbon-generic-${name}.json`,'utf8'));
const names=['noncircular','circle','eta-negative','sigma-negative','interior','nonlinear','reverse','variable-helix','tiny','focus','unknown',
 'raw-frame','nonunit-frame','zero-frame','zero-ruling','zero-ruling-pi'];
const near=(a:number,b:number,scale=1)=>assert.ok(Math.abs(a-b)<=2e-10*Math.max(scale,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const reject=(name:string,change:(r:GenericRibbonResult)=>void)=>{const r=fixture(name);change(r);assert.throws(()=>parseGenericRibbonResult(r,r.query),/回读/);};

test('all sixteen actual RibbonPair four-source fixtures preserve the original curves, raw initials and independently replayed eta rulings',()=>{
 for(const name of names){const r=fixture(name);parseGenericRibbonResult(r,r.query);assert.equal(r.sample.rows.length,r.query.segments+1);
  assert.equal(r.certification.integrationErrorIntervalCertified,false);assert.equal(r.certification.adoptableCreasePattern,false);}
});
test('the true noncircular variable eta source has a closed spatial unit ruling and the original parabolic planar development',()=>{
 const r=fixture('noncircular'),ref=makeGenericRibbonReference(r.query,r.sample.rows.map(row=>row.s));
 for(const row of r.sample.rows){const s=row.s,p=ref.source(s),t=ref.target(s),L=ref.normalization.scale;
  row.sourceBase.forEach((v,i)=>near(v,[Math.sin(s),s*s/4,1-Math.cos(s)][i]));
  row.sourceDirector.forEach((v,i)=>near(v,[0,1,0][i]));row.targetBase.forEach((v,i)=>near(v,[s,s*s/4][i]));
  row.targetDirector.forEach((v,i)=>near(v,[0,1][i]));near(p.speed*L,Math.sqrt(1+s*s/4));
  near(p.curvature/L,.5*Math.sqrt(5+s*s)/(1+s*s/4)**1.5);near(p.torsion/L,-2*s/(5+s*s));
  t.base.forEach((v,i)=>near(v*L,[s,s*s/4][i]));}
});
test('sigma reverses physical source and target unit directors without reversing the original geometric frame or planar base',()=>{
 const positive=fixture('noncircular'),negative=fixture('sigma-negative');
 for(let i=0;i<positive.sample.rows.length;i++){const p=positive.sample.rows[i],n=negative.sample.rows[i];
  p.sourceDirector.forEach((v,k)=>near(v,-n.sourceDirector[k]));p.targetDirector.forEach((v,k)=>near(v,-n.targetDirector[k]));
  p.sourceTangent.forEach((v,k)=>near(v,n.sourceTangent[k]));p.targetBase.forEach((v,k)=>near(v,n.targetBase[k]));}
 assert.equal(negative.domain.sourceStripRegularity.orientation,-positive.domain.sourceStripRegularity.orientation!);
});
test('bilateral ui and arbitrary finite raw ci ti values are preserved, with independent frame compatibility instead of silent normalization',()=>{
 const interior=parseGenericRibbonResult(fixture('interior'));assert.ok(interior.query.initialParameter>interior.query.parameterStart);
 assert.ok(interior.diagnostics.integration.backwardEvaluations>0);assert.ok(interior.diagnostics.integration.forwardEvaluations>0);
 for(const name of ['raw-frame','nonunit-frame','zero-frame']){const r=parseGenericRibbonResult(fixture(name));
  assert.deepEqual(r.initial.tangent,r.query.initialTangent);assert.equal(r.initial.frameCompatible,false);
  assert.equal(r.certification.initialFrameCompatible,false);assert.equal(r.certification.formalIsometryCertified,false);
  assert.equal(r.domain.formalStripRegularity.status,'unknown');assert.equal(r.domain.sourceStripRegularity.status,'verified');}
 const zero=fixture('zero-frame');assert.deepEqual(zero.query.initialTangent,[0,0]);assert.equal(zero.certification.finiteMetricVerified,false);
 for(const row of zero.sample.rows)assert.deepEqual(row.targetBase,zero.query.initialPoint);
 const other=fixture('nonunit-frame');assert.deepEqual(other.query.initialTangent,[2,0]);assert.equal(other.certification.finiteUnitRulingsVerified,false);
});
test('constant eta zero and pi with H positive produce the original literal zero rulings, not division errors or normalized replacements',()=>{
 for(const name of ['zero-ruling','zero-ruling-pi']){const r=parseGenericRibbonResult(fixture(name)),ref=makeGenericRibbonSource(r.query);assert.equal(ref.zeroRuling,true);
  for(const row of r.sample.rows){assert.ok(row.coefficients.normalDerivativeLength>0);assert.equal(row.coefficients.normalTangentProjection,0);
   assert.deepEqual(row.sourceDirector,[0,0,0]);assert.deepEqual(row.targetDirector,[0,0]);assert.ok(row.sourceDirectorDerivative.every(v=>v===0));
   assert.ok(row.targetDirectorDerivative.every(v=>v===0));assert.equal(row.coefficients.p,0);assert.equal(row.coefficients.q,0);}
  assert.equal(r.certification.finiteMetricVerified,true);assert.equal(r.certification.finiteUnitRulingsVerified,false);
  assert.equal(r.certification.formalIsometryCertified,false);assert.equal(r.domain.sourceStripRegularity.status,'degenerate');
  assert.equal(r.domain.formalStripRegularity.status,'degenerate');assert.equal(r.domain.evaluations,1);}
 const q=fixture('zero-ruling').query;assert.throws(()=>makeGenericRibbonSource({...q,normalAngle:'s'}).evaluate(0),/一阶/);
 assert.throws(()=>makeGenericRibbonSource({...q,spaceCurve:['cos(s)','sin(s)','0']}).evaluate(0));
 for(const normalAngle of ['s-s','sin(s)-sin(s)','s+1-1-s','sin(s)**2+cos(s)**2-1']){
  const source=makeGenericRibbonSource({...q,normalAngle});assert.equal(source.zeroRuling,true);assert.deepEqual(source.evaluate(.37).director,[0,0,0]);}
 assert.throws(()=>makeGenericRibbonSource({...q,normalAngle:'s/s-1'}).evaluate(0));
});
test('genuine budget unknown and focused original widths preserve all source and target rows while keeping strip regularity distinct from isometry',()=>{
 const unknown=parseGenericRibbonResult(fixture('unknown'));assert.equal(unknown.domain.evaluations,1024);assert.equal(unknown.certification.sourceRegularityCertified,false);
 assert.equal(unknown.certification.formalIsometryCertified,false);assert.equal(unknown.certification.finiteMetricVerified,true);
 assert.equal(unknown.sample.rows.at(-1)!.s,unknown.query.parameterEnd);
 const focused=parseGenericRibbonResult(fixture('focus'));assert.equal(focused.domain.sourceStripRegularity.status,'degenerate');
 assert.equal(focused.domain.formalStripRegularity.status,'degenerate');assert.equal(focused.certification.formalIsometryCertified,true);
});
test('source-binding eta, original normals, physical derivatives, raw initial frame and target state reject plausible forged geometry',()=>{
 reject('noncircular',r=>{r.sample.rows[3].sourceSurfaceNormal[2]+=.01;});reject('noncircular',r=>{r.sample.rows[3].sourceBinormal[1]+=.01;});
 reject('noncircular',r=>{r.sample.rows[3].normalAngleDerivative+=.01;});reject('noncircular',r=>{r.sample.rows[3].coefficients.normalTangentProjection*=-1;});
 reject('noncircular',r=>{r.grid[3].normalizedTarget[1][0]+=.01;});reject('noncircular',r=>{r.sample.rows[3].normalizedSourceDirectorDerivative[0]+=.01;});
 reject('nonunit-frame',r=>{r.initial.frameGramResidual=0;});reject('zero-frame',r=>{r.certification.initialFrameCompatible=true;});
 reject('raw-frame',r=>{r.certification.formalIsometryCertified=true;});reject('noncircular',r=>{r.source.initialArgumentOrder=['ui','ti','ci'];});
});
test('tiny curves and exact zero rulings validate each physical jet and each E/F/G component at its own scale',()=>{
 const r=parseGenericRibbonResult(fixture('tiny'));assert.ok(r.normalization.scale<1e-7);near(Math.hypot(...r.sample.rows[3].sourceDirector),1);
 reject('tiny',r=>{r.sample.rows[3].sourceBaseDerivative[0]+=1e-10;});reject('tiny',r=>{r.grid[3].targetEFG[0][0]*=2;});
 reject('tiny',r=>{r.grid[3].sourceEFG[0][1]*=2;});reject('tiny',r=>{r.grid[3].targetEFG[0][2]*=2;});
 reject('zero-ruling',r=>{r.grid[3].targetEFG[0][2]=1e-16;});reject('zero-ruling-pi',r=>{r.sample.rows[3].sourceDirector[0]=.01;});
});
test('strict original query and interval signs distinguish safe complete sources, arbitrary raw ti, formal assertions and foreign source contracts',()=>{
 assert.deepEqual(validateGenericRibbonQuery(GENERIC_RIBBON_PRESET),GENERIC_RIBBON_PRESET);
 for(const initialTangent of [[2,0],[0,0],[1+4.5e-11,0]])validateGenericRibbonQuery({...GENERIC_RIBBON_PRESET,initialTangent});
 for(const change of [{spaceCurve:['s','0']},{normalAngle:'eval(s)'},{sigma:0},{initialFoldAngleRad:Math.PI},{initialTangent:[Infinity,0]},
  {initialParameter:-1},{rulingSegments:65}])assert.throws(()=>validateGenericRibbonQuery({...GENERIC_RIBBON_PRESET,...change}));
 reject('noncircular',r=>{r.domain.cells[0].sign*=-1;});reject('noncircular',r=>{r.domain.minimumCurvatureLowerBound=100;});
 reject('unknown',r=>{r.certification.sourceUnitRulingsAnalytic=true;});reject('focus',r=>{r.certification.formalStripRegularityCertified=true;});
});
test('busy API retries preserve all four Ribbon source expressions and raw planar recovery initial values',async()=>{
 const original=globalThis.fetch,r=fixture('nonunit-frame');let calls=0;
 globalThis.fetch=async(input,init)=>{assert.equal(String(input),'/api/tessellation/curved-ribbon-generic');assert.deepEqual(JSON.parse(String(init?.body)),r.query);
  return new Response(JSON.stringify(++calls===1?{error:'已有镶嵌计算正在进行，请稍后重试。'}:r),{status:calls===1?429:200,headers:{'Content-Type':'application/json'}});};
 try{const next=await fetchGenericRibbonWhenIdle(r.query,AbortSignal.timeout(5000));assert.equal(calls,2);assert.deepEqual(next.initial.tangent,[2,0]);}
 finally{globalThis.fetch=original;}
});
