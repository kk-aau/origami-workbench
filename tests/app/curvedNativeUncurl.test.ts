import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseNativeUncurlResult,validateNativeUncurlQuery,makeNativeUncurlReference,UNCURL_NATIVE_PRESET,UNCURL_NATIVE_RULE_ORDER,fetchNativeUncurlWhenIdle} from '../../src/app/curvedNativeUncurl';
import {compileUncurlSource,UncurlSourceBudget,UncurlSourceUndefined} from '../../src/app/curvedUncurlSource';
import {uncurlTripleDivided} from '../../src/app/curvedUncurlCompensated';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`../fixtures/origamica-uncurl-generic-${name}.json`,import.meta.url),'utf8'));
const clone=<T>(x:T):T=>structuredClone(x);

test('replays every actual old Uncurl source jet, ordered rule and independent planar integration',()=>{
 const files=readdirSync(new URL('../fixtures/',import.meta.url)).filter(n=>/^origamica-uncurl-generic-.*\.json$/.test(n)&&!n.includes('independent'));assert.ok(files.length>=6);
 for(const file of files){const r=JSON.parse(readFileSync(new URL('../fixtures/'+file,import.meta.url),'utf8'));assert.doesNotThrow(()=>parseNativeUncurlResult(r,r.query),file);assert.deepEqual(Object.keys(r.sample.rows[0].rules),UNCURL_NATIVE_RULE_ORDER);}
});

test('literal old Darboux remains different from normalized or modern raw-normal formulas',()=>{
 const q={...UNCURL_NATIVE_PRESET,curve:['s','s**2','0'],normal:['1','s+.3','2'],parameterStart:0,parameterEnd:1,segments:8},ref=makeNativeUncurlReference(q),r=ref.rows[0].rules;
 assert.equal(r.NormalCurvature3D,.6);assert.equal(r.GeodesicCurvature3D,4);assert.ok(Math.abs((r.GeodesicTorsion3D as number)+2)<1e-12);
 // Modern -L·U'/v is -2 here too, so use a later point to expose the old
 // Frenet-curvature denominator with raw, nonorthogonal U.
 const later=ref.rows[4],s=later.s,T=later.rules.TangentVector3D as number[],U=[1,s+.3,2],L=[U[1]*T[2]-U[2]*T[1],U[2]*T[0]-U[0]*T[2],U[0]*T[1]-U[1]*T[0]],modern=-L[1]/(later.rules.Speed3D as number);
 assert.ok(Math.abs((later.rules.GeodesicTorsion3D as number)-modern)>.1);
});

test('compares all twenty rules to independent 80-digit primitives and literal formulas',()=>{
 const independent=fixture('independent-80digit');assert.equal(independent.precisionDigits,80);let cells=0;
 for(const scenario of independent.cases){const reference=makeNativeUncurlReference(scenario.query),targets=scenario.rows.map((r:any)=>Number(r.s)),states=reference.recover(targets);
  for(const row of scenario.rows){const s=Number(row.s),source=reference.rows.find(r=>r.s===s)!;assert.ok(source,scenario.name);const y=states.get(s),angle=y?.[2]??null,T=angle===null?null:[Math.cos(angle),Math.sin(angle)],L=T?[-T[1],T[0]]:null,v=source.rules.Speed3D,kg=source.rules.GeodesicCurvature3D as number|null;
   const rules={...source.rules,Curve2D:y?y.slice(0,2).map((x,j)=>scenario.query.initialPoint[j]+x*reference.normalization.recoveredScale):null,Speed2D:v,LeftCurvature2D:kg,Curvature2D:kg===null?null:Math.abs(kg),TangentVector2D:T,LeftNormalVector2D:L,NormalVector2D:L&&kg!==null?L.map(x=>x*Math.sign(kg)):null};
   const compare=(actual:any,expected:any,path:string)=>{if(expected===null){assert.equal(actual,null,path);return;}if(Array.isArray(expected)){assert.equal(actual.length,expected.length,path);expected.forEach((x,i)=>compare(actual[i],x,path+'/'+i));return;}const target=Number(expected);assert.ok(typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-target)<=3e-9*Math.max(1,Math.abs(target)),`${scenario.name} s=${s} ${path}: ${actual} vs ${target}`);cells++;};
   for(const key of UNCURL_NATIVE_RULE_ORDER)compare(rules[key as keyof typeof rules],row.rules[key],key);
  }
 }
 assert.ok(cells>=500);
});

test('fixed parameter-zero anchor and direction-only initial tangent are replayed independently',()=>{
 const a={...UNCURL_NATIVE_PRESET,parameterStart:1,parameterEnd:2,segments:8,initialPoint:[3,-2],initialTangent:[0,7]},b={...a,initialTangent:[0,1]},ra=makeNativeUncurlReference(a),rb=makeNativeUncurlReference(b),sa=ra.recover(ra.nodes),sb=rb.recover(rb.nodes);
 assert.deepEqual(sa,sb);const p=sa.get(1)!;assert.ok(Math.abs(p[0]*ra.normalization.recoveredScale+(1-Math.cos(1)))<1e-9);assert.ok(Math.abs(p[1]*ra.normalization.recoveredScale-Math.sin(1))<1e-9);assert.equal(ra.normalization.anchorParameter,0);
 const response=fixture('anchor-pole');assert.equal(parseNativeUncurlResult(response).domain.recoveryStatus,'undefined');assert.ok(response.sample.rows.every((r:any)=>r.sourceCurve&&r.recoveredCurve===null));
});

test('nonuniform straight parameters do not fabricate a Frenet frame, while tiny real bending is retained',()=>{
 const straight=makeNativeUncurlReference({...UNCURL_NATIVE_PRESET,curve:['s**2','2*s**2','3*s**2'],parameterStart:.1,parameterEnd:.2,segments:8});
 for(const row of straight.rows){assert.equal(row.rules.Curvature3D,0);assert.equal(row.rules.NormalVector3D,null);assert.equal(row.rules.BinormalVector3D,null);assert.equal(row.rules.Torsion3D,null);}
 const curved=makeNativeUncurlReference({...UNCURL_NATIVE_PRESET,curve:['s','1e-140*s**2','0'],segments:8});
 for(const row of curved.rows){assert.ok((row.rules.Curvature3D as number)>0);assert.deepEqual((row.rules.BinormalVector3D as number[]).map(x=>x||0),[0,0,1]);}
});

test('zero geodesic curvature keeps a zero planar normal without suppressing a tiny real signed curvature',()=>{
 const s=.3,c=Math.cos(s),z=Math.sin(s),cp=[-z,c,.5],cpp=[-c,-z,0],v=Math.hypot(...cp);
 assert.equal(uncurlTripleDivided([c,z,0],cp,cpp,v,3),0);
 const tiny=uncurlTripleDivided([c,z,1e-140],cp,cpp,v,3);assert.ok(tiny>0);assert.ok(Math.abs(tiny/(1e-140/v**3)-1)<1e-14);
 const scenario=JSON.parse(readFileSync(new URL('../fixtures/uncurl-native-boundary-responses.json',import.meta.url),'utf8')).find((c:any)=>c.name==='unit-radial-helix');
 const response=parseNativeUncurlResult(scenario.result);for(const row of response.sample.rows){assert.equal(row.rules.GeodesicCurvature3D,0);assert.deepEqual((row.rules.NormalVector2D as number[]).map(x=>x||0),[0,0]);}
});

test('source zeros retain values but cannot turn sampled vanishing jets into an identity proof',()=>{
 const budget=new UncurlSourceBudget(),zero=compileUncurlSource('sqrt(0)'),radical=compileUncurlSource('sqrt(s**4)'),cancelled=compileUncurlSource('sqrt(s-s)');
 for(let order=0;order<=3;order++)assert.equal(zero.jet(0,order,budget),0);
 assert.equal(radical.jet(0,0,budget),0);assert.equal(cancelled.jet(0,0,budget),0);
 for(let order=1;order<=3;order++){assert.throws(()=>radical.jet(0,order,budget),UncurlSourceUndefined);assert.throws(()=>cancelled.jet(0,order,budget),UncurlSourceUndefined);}
 assert.throws(()=>compileUncurlSource('sqrt(1/s-1/s)').jet(0,0,budget),UncurlSourceUndefined);
 assert.throws(()=>compileUncurlSource('log(s)').jet(-1,1,budget),UncurlSourceUndefined);
 for(let order=0;order<=3;order++)assert.equal(compileUncurlSource('(1e-160*1e-160)/(1e-160*1e-160)').jet(0,order,budget),order===0?1:0);
 for(let order=0;order<=3;order++){
  assert.equal(compileUncurlSource('0*sqrt(s**2)').jet(0,order,budget),0);
  assert.equal(compileUncurlSource('(sqrt(s**2))**0').jet(0,order,budget),order===0?1:0);
  assert.throws(()=>compileUncurlSource('0*log(-1)').jet(0,order,budget),UncurlSourceUndefined);
 }
 assert.throws(()=>compileUncurlSource('(1000000000+1/10**8-1000000000)*sqrt(s**2)').jet(0,1,budget),UncurlSourceUndefined);
 assert.equal(compileUncurlSource('(1000000000+1/10**8-1000000000)*s**2').jet(0,2,budget),2e-8);
});

test('replays partial domains, subnormal quotients, zero frames and translated tiny source geometry',()=>{
 const cases=JSON.parse(readFileSync(new URL('../fixtures/uncurl-native-boundary-responses.json',import.meta.url),'utf8'));assert.equal(cases.length,27);
 for(const c of cases){assert.ok(c.result,`${c.name}: ${c.error}`);assert.doesNotThrow(()=>parseNativeUncurlResult(c.result,c.result.query),c.name);}
 const tiny=cases.find((c:any)=>c.name==='translated-tiny-circle').result;
 assert.ok(tiny.sample.rows.some((r:any)=>r.normalizedSourceCurve.some((x:number)=>Math.abs(x)>.1)));
 const changed=clone(tiny);changed.sample.rows[0].normalizedSourceCurve[0]+=.001;assert.throws(()=>parseNativeUncurlResult(changed));
 const partial=cases.find((c:any)=>c.name==='undefined-normal-value').result;assert.equal(partial.certification.allSampledSourceValuesFinite,false);
 const logarithm=cases.find((c:any)=>c.name==='constant-tiny-log').result;assert.equal(logarithm.domain.recoveryStatus,'ready');
 const subnormal=cases.find((c:any)=>c.name==='subnormal-curvature-overflow').result;assert.equal(subnormal.domain.recoveryStatus,'undefined');
 const parallel=cases.find((c:any)=>c.name==='large-tangential-acceleration').result;
 for(const name of ['nondyadic-polynomial-straight','nondyadic-sine-straight','rational-straight']){
  const result=cases.find((c:any)=>c.name===name).result;
  for(const row of result.sample.rows){assert.equal(row.rules.Curvature3D,0);assert.equal(row.rules.GeodesicCurvature3D,0);assert.equal(row.rules.NormalVector3D,null);assert.equal(row.rules.Torsion3D,null);assert.notEqual(row.rules.NormalCurvature3D,0);assert.equal(Math.abs(row.rules.FrenetDarbouxAngle),Math.PI/2);}
 }
 const radical=cases.find((c:any)=>c.name==='straight-original-radical-domain').result;
 assert.equal(radical.sample.rows[0].sourceCurve,null);assert.equal(radical.sample.rows[0].rules.Curvature3D,null);assert.equal(radical.domain.recoveryStatus,'undefined');
 const realCurve=cases.find((c:any)=>c.name==='compensated-constant-real-curvature').result;
 assert.ok(realCurve.sample.rows.every((row:any)=>row.rules.Curvature3D>1e-8));
 for(const key of ['Curvature3D','GeodesicCurvature3D','LeftCurvature2D','Curvature2D']){assert.equal(parallel.sample.rows[0].rules[key],0);const fake=clone(parallel);fake.sample.rows[0].rules[key]=1;assert.throws(()=>parseNativeUncurlResult(fake),key+' cannot use an infinite acceleration tolerance');}
});

test('rejects changed source bindings, rule reordering, modern replacement, missing null rules and invented certificates',()=>{
 const actual=fixture('nonorthogonal-normal');
 for(const mutate of [
  (r:any)=>{r.source.ruleOrder.reverse();},
  (r:any)=>{delete r.sample.rows[0].rules.GeodesicTorsion3D;},
  (r:any)=>{r.sample.rows[0].rules.NormalCurvature3D+=.5;},
  (r:any)=>{r.sample.rows[0].sourceJets.curve[1][0]+=.2;},
  (r:any)=>{r.sample.rows[1].recoveredCurve[0]+=.01;},
  (r:any)=>{r.sample.rows[1].normalizedRecoveredCurve[0]+=.01;},
  (r:any)=>{r.normalization.anchorParameter=1;},
  (r:any)=>{r.certification.globalFoldingCertified=true;},
  (r:any)=>{r.diagnostics.initialTangentMagnitudePreserved=true;},
  (r:any)=>{r.domain.integrationInterval=[1,2];},
  (r:any)=>{r.diagnostics.budget.integrationEvaluations=0;},
 ]){const changed=clone(actual);mutate(changed);assert.throws(()=>parseNativeUncurlResult(changed,actual.query));}
 assert.throws(()=>parseNativeUncurlResult(actual,{...actual.query,initialPoint:[3,4]}));
 const straight=fixture('straight');assert.equal(straight.sample.rows[0].rules.Torsion3D,null);const changed=clone(straight);changed.sample.rows[0].rules.Torsion3D=0;assert.throws(()=>parseNativeUncurlResult(changed));
});

test('validates bounded six-source input without adding a movable initial parameter',()=>{
 for(const bad of [{...UNCURL_NATIVE_PRESET,initialParameter:1},{...UNCURL_NATIVE_PRESET,normal:['0','1']},{...UNCURL_NATIVE_PRESET,curve:['process.exit()','s','0']},{...UNCURL_NATIVE_PRESET,segments:129},{...UNCURL_NATIVE_PRESET,parameterEnd:NaN},{...UNCURL_NATIVE_PRESET,initialPoint:[Infinity,0]}])assert.throws(()=>validateNativeUncurlQuery(bad));
 assert.doesNotThrow(()=>validateNativeUncurlQuery({...UNCURL_NATIVE_PRESET,initialTangent:[0,0]}));
});

test('retries an actual busy response, aborts before fetch and never retries a mathematical failure',async()=>{
 const original=globalThis.fetch,good=fixture('plane');let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return calls===1?new Response(JSON.stringify({error:'已有镶嵌计算正在进行，请稍后重试。'}),{status:429}):new Response(JSON.stringify(good),{status:200});};
  const r=await fetchNativeUncurlWhenIdle(good.query);assert.equal(r.domain.recoveryStatus,'ready');assert.equal(calls,2);
  const controller=new AbortController();controller.abort();await assert.rejects(fetchNativeUncurlWhenIdle(good.query,controller.signal));assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'源导数超过预算'}),{status:422});};
  await assert.rejects(fetchNativeUncurlWhenIdle(good.query),/源导数超过预算/);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
