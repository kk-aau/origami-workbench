import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CANONICAL_INPUT_PRESETS,canonicalInputFlatPoint,canonicalInputFrame,
  canonicalInputPoint,canonicalRawFrame,evaluateCanonicalInput,
  parseCanonicalInputResult,validateCanonicalInputQuery,type CanonicalInputQuery}
  from '../../src/app/curvedCanonicalParameterized';
import {sampleCanonical} from '../../src/app/curvedCanonicalConeCylinderIn3826';
const close=(a:number,b:number,tol=2e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`),
  dot=(a:number[],b:number[])=>a.reduce((sum,value,i)=>sum+value*b[i],0),
  distance=(a:number[],b:number[])=>Math.hypot(...a.map((value,i)=>value-b[i]));
const cylinder=CANONICAL_INPUT_PRESETS['cylinder-in3826'],cone=CANONICAL_INPUT_PRESETS['cone-in3830'];
const cases:CanonicalInputQuery[]=[cylinder,cone,
  {...cylinder,radius:.1,axialPitch:-4,directorLength:.1,rulingStart:.1,rulingEnd:.2} as CanonicalInputQuery,
  {...cylinder,radius:3,axialPitch:4,directorLength:6,rulingStart:2,rulingEnd:3} as CanonicalInputQuery,
  {...cone,angleDeg:15,apexZ:-3,directorLength:.1,rulingStart:.1,rulingEnd:.2} as CanonicalInputQuery,
  {...cone,angleDeg:75,apexZ:3,directorLength:6,rulingStart:2,rulingEnd:3} as CanonicalInputQuery];

test('parameterized source defaults retain both saved examples exactly',()=>{
  for(const q of [cylinder,cone]){
    const actual=evaluateCanonicalInput(q),old=sampleCanonical(q.kind);
    assert.equal(actual.source.matchesSavedInput,true);
    for(const key of ['uValues','vValues','rawBase','rawTip','canonicalBase','canonicalTip','canonicalGrid','flatGrid'] as const)
      assert.deepEqual(actual[key],old[key]);
    assert.equal(actual.source.definitionCell,q.kind==='cylinder-in3826'?'In[3825]':'In[3829]');
    assert.equal(actual.certification.regularClosedDomain,q.kind==='cylinder-in3826');
  }
});

test('general numeric source operations preserve infinite rulings and normalize length',()=>{
  for(const q of cases){
    const u=q.kind==='cylinder-in3826'?.3:.7,
      raw=canonicalRawFrame(q,u),canonical=canonicalInputFrame(q,u);
    close(Math.hypot(...raw.d),q.directorLength);
    close(Math.hypot(...canonical.d),1);
    if(q.kind==='cylinder-in3826')close(dot(canonical.b,canonical.d),0);
    for(const lambda of [-1,0,.4,1]){
      const rawPoint=raw.b.map((value,i)=>value+lambda*raw.d[i]),
        canonicalV=q.directorLength*lambda+(q.kind==='cylinder-in3826'?q.axialPitch*u:0),
        expected=canonical.b.map((value,i)=>value+canonicalV*canonical.d[i]);
      close(distance(rawPoint,expected),0);
    }
  }
  const a=evaluateCanonicalInput({...cylinder,axialPitch:-3,directorLength:.1}),
    b=evaluateCanonicalInput({...cylinder,axialPitch:4,directorLength:6});
  assert.deepEqual(a.canonicalGrid,b.canonicalGrid);
  assert.notDeepEqual(a.rawBase,b.rawBase);
  assert.notDeepEqual(a.rawTip,b.rawTip);
});

test('finite canonical and planar domains share all three metric coefficients',()=>{
  for(const q of cases){
    const u=.7,v=(q.rulingStart+q.rulingEnd)/2,h=1e-5,
      expectedE=q.kind==='cylinder-in3826'?q.radius**2:
        v**2*Math.sin(q.angleDeg*Math.PI/180)**2;
    for(const point of [canonicalInputPoint,canonicalInputFlatPoint]){
      const plusU=point(q,u+h,v),minusU=point(q,u-h,v),
        plusV=point(q,u,v+h),minusV=point(q,u,v-h),
        du=plusU.map((x,i)=>(x-minusU[i])/(2*h)),
        dv=plusV.map((x,i)=>(x-minusV[i])/(2*h));
      close(dot(du,du),expectedE);close(dot(du,dv),0);close(dot(dv,dv),1);
    }
    const result=evaluateCanonicalInput(q),regular=q.kind==='cylinder-in3826'||q.rulingStart>0;
    assert.equal(result.certification.regularClosedDomain,regular);
    assert.equal(result.certification.globalInjectiveClosedDomain,regular);
    assert.equal(result.certification.includesSingularApex,!regular);
    assert.equal(result.certification.sameFinitePatchAsRawInput,false);
    assert.equal(result.certification.sampledMeshExactFOLD,false);
  }
});

test('strict queries reject ignored fields, collapsed intervals and singular input functions',()=>{
  for(const query of [{...cone,angleDeg:0},{...cylinder,radius:0},
    {...cone,directorLength:0},{...cylinder,axialPitch:Infinity},
    {...cone,radius:1},{...cone,rulingStart:1,rulingEnd:1},
    {...cone,segments:16.5},{...cone,directorLength:'2'},
    {...cone,apexZ:true},{kind:'cone-in3830'}])
    assert.throws(()=>validateCanonicalInputQuery(query));
  assert.throws(()=>canonicalInputPoint(cone,.7,1.1));
});

test('finite source patch correspondence is true only when normalization and axial projection preserve its trim',()=>{
  assert.equal(evaluateCanonicalInput({...cone,directorLength:1}).certification.sameFinitePatchAsRawInput,true);
  assert.equal(evaluateCanonicalInput({...cylinder,axialPitch:0,directorLength:1}).certification.sameFinitePatchAsRawInput,true);
  assert.equal(evaluateCanonicalInput({...cylinder,axialPitch:.1,directorLength:1}).certification.sameFinitePatchAsRawInput,false);
  assert.equal(evaluateCanonicalInput({...cone,directorLength:1,rulingStart:.1}).certification.sameFinitePatchAsRawInput,false);
});

test('strict result readback rejects altered points, claims, fields and requested parameters',()=>{
  const original=evaluateCanonicalInput(cone);
  for(const mutate of [
    (x:any)=>x.canonicalGrid[2][3][1]+=.001,
    (x:any)=>x.flatGrid[2][3][0]+=.001,
    (x:any)=>x.rawTip[3][2]+=.001,
    (x:any)=>x.certification.regularClosedDomain=true,
    (x:any)=>x.certification.globalInjectiveClosedDomain=true,
    (x:any)=>x.certification.minimumJacobian=.1,
    (x:any)=>x.source.wolframNumericOut=true,
    (x:any)=>x.certification.extra=true,
    (x:any)=>x.flatGrid[2].pop(),
  ]){const corrupted=structuredClone(original);mutate(corrupted);
    assert.throws(()=>parseCanonicalInputResult(corrupted,cone));}
  assert.throws(()=>parseCanonicalInputResult(original,{...cone,directorLength:2.1}));
  assert.equal(parseCanonicalInputResult(original,cone),original);
});

test('independent Python procedural normalization passes strict TypeScript point-by-point readback',()=>{
  const program=`import json,sys\nfrom tessellation_curved_canonical_cone_cylinder import evaluate_input_query\nprint(json.dumps([evaluate_input_query(q) for q in json.load(sys.stdin)]))`;
  const queries=cases.map(q=>({...q,segments:16,rulingSteps:2}));
  const result=spawnSync('python',['-c',program],{
    cwd:fileURLToPath(new URL('../../backend/',import.meta.url)),
    input:JSON.stringify(queries),encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  const outputs=JSON.parse(result.stdout);
  assert.equal(outputs.length,queries.length);
  outputs.forEach((output:unknown,i:number)=>parseCanonicalInputResult(output,queries[i]));
});
