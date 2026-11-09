import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  TANGENT_DEVELOPABLE_PRESET,fetchTangentDevelopable,
  REVERSE_TANGENT_DEVELOPABLE_SHIFT,
  parseTangentDevelopableResult,projectTangentPoint,tangentDevelopableCurves,
  validateTangentDevelopableQuery,type TangentDevelopableQuery,
} from '../../src/app/curvedTangentDevelopable';

function response(query:TangentDevelopableQuery){
  const a=Math.sqrt(3)/2;
  const parameters=Array.from({length:query.curveSegments+1},(_,i)=>Math.PI*i/query.curveSegments);
  const distances=Array.from({length:query.rulingSegments+1},(_,j)=>
    query.rulingEnd*j/query.rulingSegments);
  const flat=parameters.map(u=>distances.map(v=>[
    -1+(1-Math.cos(a*u))/a+v*Math.sin(a*u),
    Math.sin(a*u)/a+v*Math.cos(a*u)]));
  const folded=parameters.map(u=>distances.map(v=>[
    -a*Math.cos(u)+v*a*Math.sin(u),
    a*Math.sin(u)+v*a*Math.cos(u),u/2+v/2]));
  return {family:'origamica-tangent-developable-pair',query,
    source:{definitionCell:'In[3912]',savedCell:'In[3913]',
      function:'ReshapeTandev3D',machineReadableWolframOut:false},
    invariants:{speed:1,curvature:a,sourceTorsion:-.5,targetTorsion:0,
      orientation:1,branchSign:1},
    initialFrame:{sourceBase:[-a,0,0],sourceDirector:[0,a,.5],
      targetBase:[-1,0,0],targetDirector:[0,1,0],targetNormal:[0,0,1]},
    certification:{commonFirstFundamentalForm:{E:'1 + 3 v^2 / 4',F:'1',G:'1',
      determinant:'3 v^2 / 4'},continuousIsometryAnalytic:true,
      bothSurfacesDevelopableAnalytic:true,regularForPositiveRulingDistance:true,
      regressionEdgeSingularAtZero:true,regressionEdgeIsCrease:false,
      sampledMeshExactIsometry:false,exactStraightCreaseFOLD:false,
      adoptableCreasePattern:false,deploymentPathChecked:false,
      selfCollisionChecked:false},
    sample:{parameterValues:parameters,rulingDistances:distances,
      flatSamples:flat,foldedSamples:folded,regressionEdgeRow:0,
      flatMetricAtRulingEnd:[1+.75*query.rulingEnd**2,1,1,.75*query.rulingEnd**2]}};
}

test('In[3913] query accepts only the bounded saved analytic family',()=>{
  assert.deepEqual(validateTangentDevelopableQuery({family:'tangent-developable-in3913'}),
    TANGENT_DEVELOPABLE_PRESET);
  for(const input of [null,{},[],
    {...TANGENT_DEVELOPABLE_PRESET,expression:'__import__("os")'},
    {...TANGENT_DEVELOPABLE_PRESET,curveSegments:true},
    {...TANGENT_DEVELOPABLE_PRESET,curveSegments:257},
    {...TANGENT_DEVELOPABLE_PRESET,rulingSegments:17},
    {...TANGENT_DEVELOPABLE_PRESET,rulingEnd:'1'},
    {...TANGENT_DEVELOPABLE_PRESET,rulingEnd:NaN},
    {...TANGENT_DEVELOPABLE_PRESET,rulingEnd:0},
    {...TANGENT_DEVELOPABLE_PRESET,curveSegments:256,rulingSegments:16},
  ])assert.throws(()=>validateTangentDevelopableQuery(input));
});

test('response verifies provenance, metric, singular edge and all paired samples',()=>{
  const query=validateTangentDevelopableQuery({...TANGENT_DEVELOPABLE_PRESET,
    curveSegments:16,rulingSegments:2,rulingEnd:.75});
  const parsed=parseTangentDevelopableResult(response(query),query);
  assert.equal(parsed.sample.flatSamples.length,17);
  assert.equal(parsed.sample.flatSamples[0].length,3);
  assert.equal(parsed.certification.regressionEdgeSingularAtZero,true);
  assert.equal(parsed.certification.regressionEdgeIsCrease,false);
  assert.equal(parsed.certification.exactStraightCreaseFOLD,false);
  assert.equal(parsed.source.machineReadableWolframOut,false);
  const curves=tangentDevelopableCurves(parsed,false);
  assert.deepEqual(curves.regression[0],[-1,0]);
  assert.deepEqual(curves.outer[0],[-1,.75]);
  const projected=tangentDevelopableCurves(parsed,true,0);
  assert.deepEqual(projected.regression[0],
    projectTangentPoint([-Math.sqrt(3)/2,0,0],0));
  assert.equal('faces_vertices' in parsed.sample,false);
});

test('In[3914]/In[3919] reverse view uses the saved absolute 3D initial point',()=>{
  const query=validateTangentDevelopableQuery({...TANGENT_DEVELOPABLE_PRESET,
    curveSegments:16,rulingSegments:2});
  const result=parseTangentDevelopableResult(response(query),query);
  const forward=tangentDevelopableCurves(result,true,0,'forward');
  const reverse=tangentDevelopableCurves(result,true,0,'reverse');
  assert.deepEqual(reverse.regression[0],projectTangentPoint([-1,0,0],0));
  for(const key of ['regression','outer'] as const)
    for(let i=0;i<forward[key].length;i++){
      assert.ok(Math.abs(reverse[key][i][0]-forward[key][i][0]-
        REVERSE_TANGENT_DEVELOPABLE_SHIFT)<1e-12);
      assert.ok(Math.abs(reverse[key][i][1]-forward[key][i][1])<1e-12);
    }
  assert.deepEqual(tangentDevelopableCurves(result,false,0,'reverse'),
    tangentDevelopableCurves(result,false,0,'forward'));
  assert.equal(result.source.savedCell,'In[3913]');
});

test('response rejects changed source, false certificate, grid and coordinates',()=>{
  const query=validateTangentDevelopableQuery({...TANGENT_DEVELOPABLE_PRESET,
    curveSegments:8,rulingSegments:1});
  const raw=response(query);
  assert.throws(()=>parseTangentDevelopableResult({...raw,
    source:{...raw.source,savedCell:'In[3914]'}}),/来源/);
  assert.throws(()=>parseTangentDevelopableResult({...raw,
    certification:{...raw.certification,regressionEdgeIsCrease:true}}),/折痕/);
  assert.throws(()=>parseTangentDevelopableResult({...raw,
    certification:{...raw.certification,exactStraightCreaseFOLD:true}}),/FOLD/);
  assert.throws(()=>parseTangentDevelopableResult({...raw,
    certification:{...raw.certification,regressionEdgeSingularAtZero:false}}),/证书/);
  assert.throws(()=>parseTangentDevelopableResult({...raw,
    certification:{...raw.certification,commonFirstFundamentalForm:{
      ...raw.certification.commonFirstFundamentalForm,E:'1'}}}),/第一基本形式/);
  assert.throws(()=>parseTangentDevelopableResult({...raw,
    sample:{...raw.sample,parameterValues:[.2,...raw.sample.parameterValues.slice(1)]}}),/网格/);
  assert.throws(()=>parseTangentDevelopableResult({...raw,
    sample:{...raw.sample,foldedSamples:[[[0,0,0],[0,0,0]],
      ...raw.sample.foldedSamples.slice(1)]}}),/对应点/);
  assert.throws(()=>parseTangentDevelopableResult({...raw,fold:{vertices_coords:[]}}),/格式/);
  assert.throws(()=>parseTangentDevelopableResult(raw,{...query,rulingEnd:.5}),/参数/);
});

test('request uses dedicated read-only route and carries abort signal',async()=>{
  const old=globalThis.fetch,query=validateTangentDevelopableQuery({...TANGENT_DEVELOPABLE_PRESET,
    curveSegments:8,rulingSegments:1});
  const controller=new AbortController();
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(response(query)),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchTangentDevelopable(query,controller.signal);
    assert.equal(url,'/api/tessellation/curved-tangent-developable');
    assert.deepEqual(body,query);
    assert.equal(signal,controller.signal);
    assert.equal(result.source.savedCell,'In[3913]');
  }finally{globalThis.fetch=old;}
});

test('actual bounded Python result satisfies the exact frontend contract',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const query=validateTangentDevelopableQuery({...TANGENT_DEVELOPABLE_PRESET,
    curveSegments:16,rulingSegments:2});
  const code='import json,sys;sys.path.insert(0,"backend");'+
    'from tessellation_curved_tangent_developable_query import query_tangent_developable;'+
    'print(json.dumps(query_tangent_developable(json.load(sys.stdin))))';
  const run=spawnSync(python,['-c',code],{cwd:root,input:JSON.stringify(query),
    encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.stderr||String(run.error));
  const result=parseTangentDevelopableResult(JSON.parse(run.stdout),query);
  assert.equal(result.sample.flatSamples.length,17);
  assert.equal(result.certification.adoptableCreasePattern,false);
});
