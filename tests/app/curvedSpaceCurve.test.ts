import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURVED_SPACE_CURVE_PRESETS,curvedSpaceBoundaries,fetchCurvedSpaceCurveQuery,
  parseCurvedSpaceCurveResult,projectCurvedSpacePoint,validateCurvedSpaceCurveQuery,
  type CurvedSpaceCurveQuery,
} from '../../src/app/curvedSpaceCurve';

function certified(query:CurvedSpaceCurveQuery){
  const frame={u:0,flatCrease:[1,0],foldedCrease:[1,0,0],
    flatLeftRuling:[0,1],flatRightRuling:[0,-1],
    foldedLeftRuling:[0,1,0],foldedRightRuling:[0,-1,0],foldAngleRad:Math.PI/2};
  return {family:'certified-space-curve-fold',query,
    sourceFunctions:['FoldSpaceCurve3D','FlattenFold2D','NSpaceCurveFold3D','NFlattenFold2D'],
    certification:{curveRegularOnClosedInterval:true,frenetCurvatureNonzeroOnClosedInterval:true,
      foldAngleInOpenRangeOnClosedInterval:true,
      bothSidesDevelopableAnalytic:true,pairedContinuousIsometryAnalytic:true,
      rulingWidthBeforeFocalSetCertified:true,sampledMeshExactIsometry:false,
      exactStraightCreaseFOLD:false,deploymentPathChecked:false,selfCollisionChecked:false},
    sample:{frames:Array.from({length:query.curveSegments+1},(_,i)=>({...frame,u:i*Math.PI/query.curveSegments})),
      continuousDevelopabilityCertified:true,continuousIsometryCertified:true,
      sampledMeshExactIsometry:false,deploymentPathChecked:false,selfCollisionChecked:false}};
}

test('closed JSON contract covers saved circle, saved helix, ellipse and variable-angle circle',()=>{
  for(const family of ['planar-circle','circular-helix','planar-ellipse'] as const){
    const query=validateCurvedSpaceCurveQuery(CURVED_SPACE_CURVE_PRESETS[family]);
    assert.equal(query.family,family);
    assert.equal(query.curveSegments,96);
  }
  const varying=validateCurvedSpaceCurveQuery({...CURVED_SPACE_CURVE_PRESETS['planar-circle'],
    parameterEndPi:.5,foldAngleStartDeg:90,foldAngleEndDeg:96,rulingWidth:.1});
  assert.equal(varying.foldAngleEndDeg,96);
  assert.deepEqual(Object.keys(varying).sort(),Object.keys(CURVED_SPACE_CURVE_PRESETS['planar-circle']).sort());
});

test('client rejects executable strings, foreign fields and out-of-domain values before fetch',()=>{
  const circle=CURVED_SPACE_CURVE_PRESETS['planar-circle'];
  for(const patch of [
    {radius:'__import__("os").system("x")'},{radius:NaN},{radius:Infinity},
    {radius:.2},{foldAngleStartDeg:0},{foldAngleEndDeg:180},
    {parameterStartPi:2},{parameterEndPi:0},{rulingWidth:0},
    {orientation:0},{curveSegments:7},{rulingSegments:17},{curveSegments:20.5},
    {curveSegments:512,rulingSegments:16},{expression:'sin(u)'},
  ])assert.throws(()=>validateCurvedSpaceCurveQuery({...circle,...patch}),JSON.stringify(patch));
  assert.throws(()=>validateCurvedSpaceCurveQuery({...CURVED_SPACE_CURVE_PRESETS['circular-helix'],
    foldAngleEndDeg:95}),/恒定折角/);
  assert.throws(()=>validateCurvedSpaceCurveQuery({...CURVED_SPACE_CURVE_PRESETS['planar-ellipse'],
    axisY:2}),/必须不同/);
  assert.throws(()=>validateCurvedSpaceCurveQuery({family:'Python'}));
});

test('response requires explicit analytic certificate and rejects false exact-FOLD claims',()=>{
  const source=certified(CURVED_SPACE_CURVE_PRESETS['planar-circle']);
  const parsed=parseCurvedSpaceCurveResult(source);
  assert.equal(parsed.sample.frames.length,97);
  assert.equal(parsed.certification.exactStraightCreaseFOLD,false);
  assert.throws(()=>parseCurvedSpaceCurveResult({...source,
    certification:{...source.certification,exactStraightCreaseFOLD:true}}),/认证/);
  assert.throws(()=>parseCurvedSpaceCurveResult({...source,
    certification:{...source.certification,curveRegularOnClosedInterval:false}}),/认证/);
  assert.throws(()=>parseCurvedSpaceCurveResult({...source,
    sample:{...source.sample,frames:[{...source.sample.frames[0],flatCrease:[NaN,0]}]}}));
  assert.throws(()=>parseCurvedSpaceCurveResult({...source,
    sample:{...source.sample,continuousIsometryCertified:false}}),/认证/);
});

test('paired preview uses the same width on both sides and orthographic projection',()=>{
  const result=parseCurvedSpaceCurveResult(certified(CURVED_SPACE_CURVE_PRESETS['planar-circle']));
  const flat=curvedSpaceBoundaries(result,false),folded=curvedSpaceBoundaries(result,true,0);
  assert.deepEqual(flat.crease[0],[1,0]);
  assert.deepEqual(flat.left[0],[1,1]);
  assert.deepEqual(flat.right[0],[1,-1]);
  assert.deepEqual(folded.left[0],projectCurvedSpacePoint([1,1,0],0));
  assert.deepEqual(folded.right[0],projectCurvedSpacePoint([1,-1,0],0));
});

test('fetch uses the dedicated read-only endpoint, forwards abort signal, and shows server errors',async()=>{
  const oldFetch=globalThis.fetch;
  const query=CURVED_SPACE_CURVE_PRESETS['circular-helix'];
  const controller=new AbortController();
  let seenUrl='',seenBody:unknown,seenSignal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      seenUrl=String(input);seenBody=JSON.parse(String(init?.body));
      seenSignal=init?.signal??undefined;
      return new Response(JSON.stringify(certified(query)),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const value=await fetchCurvedSpaceCurveQuery(query,controller.signal);
    assert.equal(seenUrl,'/api/tessellation/curved-space-curve');
    assert.deepEqual(seenBody,query);
    assert.equal(seenSignal,controller.signal);
    assert.equal(value.query.family,'circular-helix');
    globalThis.fetch=(async()=>new Response(JSON.stringify({error:'焦线宽度认证失败'}),
      {status:422,headers:{'Content-Type':'application/json'}})) as typeof fetch;
    await assert.rejects(fetchCurvedSpaceCurveQuery(query),/焦线宽度认证失败/);
  }finally{globalThis.fetch=oldFetch;}
});
