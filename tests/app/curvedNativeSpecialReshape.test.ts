import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {GENERIC_SPECIAL_CONE_PRESET,GENERIC_SPECIAL_TANDEV_PRESET,validateGenericSpecialReshapeQuery,makeGenericSpecialReshapeSource,makeGenericSpecialReshapeReference,
 parseGenericSpecialReshapeResult,fetchGenericSpecialReshapeWhenIdle,type GenericSpecialReshapeQuery,type GenericSpecialReshapeResult} from '../../src/app/curvedNativeSpecialReshape';
const names=['cone-noncircular','tandev-noncircular','cone-variable-beta','tandev-variable-torsion','cone-interior','tandev-interior','tandev-nonlinear','tandev-reverse','cone-tiny','tandev-tiny',
 'cone-nonconstant-base','cone-nonunit-director','tandev-nonunit-director','cone-raw-frame','tandev-zero-frame','cone-constant-director','cone-apex','tandev-edge','cone-unknown'];
const fixture=(name:string):GenericSpecialReshapeResult=>JSON.parse(readFileSync(`tests/fixtures/origamica-special-reshape-generic-${name}.json`,'utf8'));
const reject=(name:string,change:(r:GenericSpecialReshapeResult)=>void)=>{const r=fixture(name);change(r);assert.throws(()=>parseGenericSpecialReshapeResult(r,r.query),/回读/);};
const near=(a:number,b:number,scale=1)=>assert.ok(Math.abs(a-b)<2e-9*Math.max(Math.abs(a),Math.abs(b),scale),`${a} != ${b}`);
test('arbitrary source and raw initial vectors survive dedicated query validation without unit or cone substitutes',()=>{
 const q=validateGenericSpecialReshapeQuery({...GENERIC_SPECIAL_CONE_PRESET,baseCurve:['s','0','0'],initialDirector:[0,0,0],initialNormal:[2,0,0]});
 assert.deepEqual(q.baseCurve,['s','0','0']);assert.deepEqual(q.initialDirector,[0,0,0]);assert.deepEqual(q.initialNormal,[2,0,0]);
 assert.throws(()=>validateGenericSpecialReshapeQuery({...q,initialTangent:[1,0,0]}));assert.throws(()=>validateGenericSpecialReshapeQuery({...q,beta:'__import__(s)'}));
});
test('cone recovery discards the recovered cross curve and obeys the saved curl constant coefficient closed solution',()=>{
 const beta=.7,q:GenericSpecialReshapeQuery={...GENERIC_SPECIAL_CONE_PRESET,beta:String(beta),director:['-cos(s)','sin(s)','0'],initialDirector:[-1,0,0],initialNormal:[0,0,1]},
  nodes=[0,.1,.3,.8,1],ref=makeGenericSpecialReshapeReference(q,nodes),K=Math.hypot(1,beta),L=ref.normalization.scale;
 for(const s of nodes){const r=ref.target(s),oneMinusCos=1-Math.cos(K*s),expected=[-1+oneMinusCos/K**2,Math.sin(K*s)/K,beta*oneMinusCos/K**2];
  assert.deepEqual(r.base,[0,0,0]);assert.deepEqual(r.basePrime,[0,0,0]);r.director.forEach((x,i)=>near(x*L,expected[i]));}
});
test('constant cone directors retain the original computed construction with zero auxiliary frame instead of undefined normalizing',()=>{
 const q={...GENERIC_SPECIAL_CONE_PRESET,director:['0','0','2'],beta:'0',initialDirector:[0,0,2],initialNormal:[0,1,0]} as GenericSpecialReshapeQuery,
  ref=makeGenericSpecialReshapeReference(q,[0,.5,1]),source=ref.source(.5);assert.equal(source.frameDefined,false);assert.ok(source.g===0);
 assert.deepEqual(ref.target(.5).director.map(x=>x*ref.normalization.scale),[0,0,2]);assert.notEqual(source.sourceCompatibility,0);
 assert.throws(()=>makeGenericSpecialReshapeSource({...GENERIC_SPECIAL_TANDEV_PRESET,director:['0','0','2']}),/Normalize\(d′\)/);
});
test('tandev default returns the real noncircular arbitrary curve with original zeta, not a generic transverse ruler',()=>{
 const nodes=[0,.2,.5,1],ref=makeGenericSpecialReshapeReference(GENERIC_SPECIAL_TANDEV_PRESET,nodes),L=ref.normalization.scale;
 near(ref.initial.zeta!,1);for(const s of nodes){const r=ref.target(s),original=ref.source(s);
  r.base.forEach((x,i)=>near(x*L,[Math.sin(s),s*s/4,1-Math.cos(s)][i]));
  r.director.forEach((x,i)=>near(x,original.director[i],1/L));}
});
test('tandev raw nonunit d changes zeta and reconstructed director without normalization',()=>{
 const base=GENERIC_SPECIAL_TANDEV_PRESET,q={...base,director:base.director.map(x=>`2*(${x})`),initialDirector:[3,0,0]} as GenericSpecialReshapeQuery,
  ref=makeGenericSpecialReshapeReference(q,[0,.4]);near(ref.initial.zeta!,2);assert.deepEqual(ref.initial.tangent,[6,0,0]);
 near(ref.target(0).director[0]*ref.normalization.scale,12);assert.equal(ref.target(0).director[1],0);
});
test('literal sigma and psi signs remain in cone curvature and tandev auxiliary normal instead of hidden orientation normalizing',()=>{
 for(const sigma of [1,-1]as const)for(const psi of [1,-1]as const){const q={...GENERIC_SPECIAL_CONE_PRESET,sigma,psi},r=makeGenericSpecialReshapeReference(q,[0]),p=r.source(0),t=r.target(0),L=r.normalization.scale;
  near(p.g,-sigma*psi*p.sourceDirectorPrimeSpeed);t.director.forEach((x,i)=>near(x*L,q.initialDirector[i]));
  const d=makeGenericSpecialReshapeSource({...GENERIC_SPECIAL_TANDEV_PRESET,sigma,psi}).evaluate(.3),a=makeGenericSpecialReshapeSource(GENERIC_SPECIAL_TANDEV_PRESET).evaluate(.3);
  d.normal.forEach((x,i)=>near(x,a.normal[i]*(-sigma*psi)));near(d.g,a.g*(-sigma*psi));}
});
test('nineteen actual source fixtures retain the original domains and independently replay all original frames and grids',()=>{
 for(const name of names){const r=fixture(name);parseGenericSpecialReshapeResult(r,r.query);assert.equal(r.sample.rows.length,r.query.segments+1);
  assert.equal(r.certification.integrationErrorIntervalCertified,false);assert.equal(r.certification.adoptableCreasePattern,false);}
});
test('interior ui integrates both directions and cone ignores source b solely in the original returned geometry',()=>{
 for(const name of ['cone-interior','tandev-interior']){const r=parseGenericSpecialReshapeResult(fixture(name));assert.ok(r.diagnostics.integration.backwardEvaluations>0);assert.ok(r.diagnostics.integration.forwardEvaluations>0);}
 const q=GENERIC_SPECIAL_CONE_PRESET,nodes=[0,.3,1],a=makeGenericSpecialReshapeReference(q,nodes),b=makeGenericSpecialReshapeReference({...q,baseCurve:['s','.3*s**2','1+s']},nodes);
 for(const s of nodes)a.target(s).director.forEach((x,i)=>near(x*a.normalization.scale,b.target(s).director[i]*b.normalization.scale));
 const r=parseGenericSpecialReshapeResult(fixture('cone-nonconstant-base'));assert.equal(r.certification.sourceCompatibilityAnalytic,false);assert.equal(r.certification.formalIsometryCertified,false);
});
test('reversed nonlinear tandev retains zeta minus one and the correctly oriented original torsion without absolute-speed substitution',()=>{
 const r=parseGenericSpecialReshapeResult(fixture('tandev-reverse')),ref=makeGenericSpecialReshapeReference(r.query,r.sample.rows.map(row=>row.s));near(ref.initial.zeta!,-1);
 for(const row of r.sample.rows){const p=ref.source(row.s),t=ref.target(row.s);t.base.forEach((x,i)=>near(x,p.base[i]));t.director.forEach((x,i)=>near(x,p.director[i]));}
});
test('raw and zero initial frames keep true incompatible geometry and distinct source identity and formal gates',()=>{
 for(const name of ['cone-raw-frame','tandev-zero-frame','tandev-nonunit-director']){const r=parseGenericSpecialReshapeResult(fixture(name));assert.equal(r.initial.frameCompatible,false);assert.equal(r.certification.formalIsometryCertified,false);assert.equal(r.domain.formalStripRegularity.status,'unknown');}
 const r=fixture('tandev-zero-frame');for(const row of r.sample.rows){assert.ok(row.targetDirector.every(x=>x===0));assert.ok(row.targetBase.every((x,i)=>x===r.query.initialPoint[i]));}
});
test('apex and regression edge domains are preserved while a genuine interval budget unknown is never reported as whole paper regular',()=>{
 for(const name of ['cone-apex','tandev-edge']){const r=parseGenericSpecialReshapeResult(fixture(name));assert.equal(r.domain.sourceStripRegularity.status,'degenerate');assert.equal(r.domain.formalStripRegularity.status,'degenerate');assert.equal(r.certification.formalIsometryCertified,true);}
 const r=parseGenericSpecialReshapeResult(fixture('cone-unknown'));assert.equal(r.domain.evaluations,1024);assert.equal(r.domain.certified,false);assert.equal(r.certification.formalIsometryCertified,false);assert.equal(r.sample.rows.at(-1)!.s,r.query.parameterEnd);
});
test('source conventions, raw zeta, recovery rows, interval bounds and tiny metric components reject plausible forged data',()=>{
 reject('cone-noncircular',r=>{r.source.discardedRecoveredCrossCurve=false;});reject('tandev-noncircular',r=>{r.initial.zeta=-1;});
 reject('cone-noncircular',r=>{r.sample.rows[2].targetBase[0]+=.01;});reject('tandev-noncircular',r=>{r.sample.rows[2].sourceAuxiliaryNormal[0]+=.01;});
 reject('cone-noncircular',r=>{r.domain.cells[0].gBounds=[3,4];});reject('cone-tiny',r=>{r.grid[0].sourceEFG[0][2]*=1.01;});
 reject('tandev-tiny',r=>{r.grid[0].sourceEFG[0][0]*=1.01;});reject('tandev-zero-frame',r=>{r.grid[0].targetEFG[0][2]=1e-20;});
 reject('cone-unknown',r=>{r.certification.sourceDefinitionCertified=true;});reject('cone-raw-frame',r=>{r.initial.frameCompatibilityTolerance=1;});
});
test('busy authorized API retries retain exact seven source expressions and arbitrary raw original frame coordinates',async()=>{
 const savedFetch=globalThis.fetch;let calls=0;const r=fixture('tandev-nonunit-director');globalThis.fetch=async(_input,options)=>{calls++;assert.deepEqual(JSON.parse(String(options?.body)),r.query);
  return new Response(JSON.stringify(calls===1?{error:'已有镶嵌计算正在进行'}:r),{status:calls===1?409:200,headers:{'content-type':'application/json'}});};
 try{assert.deepEqual((await fetchGenericSpecialReshapeWhenIdle(r.query)).query,r.query);assert.equal(calls,2);}finally{globalThis.fetch=savedFetch;}
});
