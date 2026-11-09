import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURVED_RIBBON_PAIR_PRESET,fetchCurvedRibbonPair,parseCurvedRibbonPairResult,
  ribbonCurves,validateCurvedRibbonPairQuery,
  type CurvedRibbonPairQuery,
} from '../../src/app/curvedRibbonPair';

function structuredResponse(query:CurvedRibbonPairQuery){
  const row=query.rulingSegments+1,start=query.parameterStartPi*Math.PI;
  const end=query.parameterEndPi*Math.PI,speed=Math.hypot(query.radius,query.pitch);
  const turn=(query.radius/speed)*Math.cos(query.etaPi*Math.PI);
  const parameters:[number,number][]=[],flatSamples:[number,number][]=[],
    spaceSamples:[number,number,number][]=[],baseIndices:number[]=[];
  for(let i=0;i<=query.curveSegments;i++){
    const s=start+(end-start)*i/query.curveSegments,a=turn*(s-start);
    const flatBase:[number,number]=[speed/turn*Math.sin(a),speed/turn*(1-Math.cos(a))];
    const spaceBase:[number,number,number]=[
      query.radius*Math.cos(s),query.radius*Math.sin(s),query.pitch*s];
    baseIndices.push(i*row+query.rulingSegments/2);
    for(let j=0;j<row;j++){
      const v=query.halfWidth*(2*j/query.rulingSegments-1);
      parameters.push([s,v]);
      flatSamples.push([flatBase[0]+v,flatBase[1]]);
      spaceSamples.push([spaceBase[0]+v,spaceBase[1],spaceBase[2]]);
    }
  }
  return {family:'origamica-helix-ribbon-pair',query,
    source:{symbolicCell:'In[3855]',numericalCell:'In[3859]',
      symbolicFunction:'RibbonPair',numericalFunction:'NRibbonPair',machineReadableWolframOut:false},
    certification:{continuousIsometryAnalytic:true,surfaceDevelopableAnalytic:true,
      rulingWidthBeforeFocalSet:true,sampledChordsExactIsometry:false,
      exactStraightCreaseFOLD:false,adoptableCreasePattern:false,
      deploymentPathChecked:false,selfCollisionChecked:false},
    sample:{parameters,flatSamples,spaceSamples,baseIndices,focalDistance:2.40113300438}};
}

test('closed helical query preserves saved parameters and rejects executable or unsafe inputs',()=>{
  assert.deepEqual(validateCurvedRibbonPairQuery({}),CURVED_RIBBON_PAIR_PRESET);
  for(const patch of [
    {radius:'__import__("os")'},{radius:null},{radius:NaN},{radius:true},
    {pitch:0},{etaPi:.5},{orientation:0},{orientation:1.5},
    {parameterStartPi:1},{parameterEndPi:2},{etaPi:.05,halfWidth:.5},
    {curveSegments:15},{curveSegments:20.5},{curveSegments:256,rulingSegments:20},
    {rulingSegments:3},
    {rulingSegments:21},{expression:'sin(s)'},
  ])assert.throws(()=>validateCurvedRibbonPairQuery({...CURVED_RIBBON_PAIR_PRESET,...patch}),JSON.stringify(patch));
});

test('paired response verifies saved source, aligned grid and explicit non-FOLD certificate',()=>{
  const query={...CURVED_RIBBON_PAIR_PRESET,curveSegments:16,rulingSegments:2};
  const raw=structuredResponse(query);
  const parsed=parseCurvedRibbonPairResult(raw,query);
  assert.equal(parsed.sample.baseIndices.length,17);
  assert.equal(parsed.sample.baseIndices[0],1);
  assert.equal(parsed.certification.exactStraightCreaseFOLD,false);
  const flat=ribbonCurves(parsed,false),space=ribbonCurves(parsed,true);
  assert.deepEqual(flat.base[0],[0,0]);
  assert.deepEqual(flat.minus[0],[-.5,0]);
  assert.equal(space.base.length,17);
  assert.throws(()=>parseCurvedRibbonPairResult({...raw,source:{...raw.source,symbolicCell:'In[1]'}}),/来源/);
  assert.throws(()=>parseCurvedRibbonPairResult({...raw,certification:{...raw.certification,
    exactStraightCreaseFOLD:true}}),/精确 FOLD/);
  assert.throws(()=>parseCurvedRibbonPairResult({...raw,certification:{...raw.certification,
    deploymentPathChecked:true}}),/精确 FOLD/);
  assert.throws(()=>parseCurvedRibbonPairResult({...raw,sample:{...raw.sample,
    baseIndices:[0,...raw.sample.baseIndices.slice(1)]}}),/索引/);
  assert.throws(()=>parseCurvedRibbonPairResult({...raw,sample:{...raw.sample,
    spaceSamples:[...raw.sample.spaceSamples.slice(0,-1),[NaN,0,0]]}}),/采样/);
  assert.throws(()=>parseCurvedRibbonPairResult(raw,{...query,pitch:.6}),/参数/);
});

test('read-only endpoint forwards a bounded JSON query and abort signal',async()=>{
  const oldFetch=globalThis.fetch,controller=new AbortController();
  const query={...CURVED_RIBBON_PAIR_PRESET,curveSegments:16,rulingSegments:2};
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(structuredResponse(query)),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const result=await fetchCurvedRibbonPair(query,controller.signal);
    assert.equal(url,'/api/tessellation/curved-ribbon-pair');
    assert.deepEqual(body,query);
    assert.equal(signal,controller.signal);
    assert.equal(result.sample.flatSamples.length,51);
  }finally{globalThis.fetch=oldFetch;}
});
