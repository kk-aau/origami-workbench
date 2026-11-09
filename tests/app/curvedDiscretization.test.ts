import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURVED_DISCRETIZATION_PRESETS,fetchCurvedDiscretizationQuery,
  parseCurvedDiscretizationResult,validateCurvedDiscretizationQuery,
} from '../../src/app/curvedDiscretization';

const base='origamica-curved-discretization';
const source=(cell:string,fn:string,origin='saved-input')=>({inputCell:cell,
  function:fn,origin,wolframNumericOutAvailable:false});

function in4088(){
  const ts=[0,.25,.5,.75,1];
  return {family:base,query:{example:'in-4088'},source:source('In[4088]','DiscretizeSystem'),
    sample:{parameterValues:ts,system:[
      {key:'Curve2D',values:ts.map(t=>[t,t*t])},
      {key:'Curve3D',values:ts.map(t=>[t,t*t,0])},
    ]}};
}
function in4090(){
  const ts=[0,.1833166695788211,.3912747668690163,.6518280204275406,1];
  const points=ts.map(t=>[-t*t,t]);
  const chords=points.slice(1).map((p,i)=>{
    const vector=[p[0]-points[i][0],p[1]-points[i][1]];
    const length=Math.hypot(...vector);
    return {index:i+1,vector,length,unit:vector.map(v=>v/length)};
  });
  const directionResiduals=ts.slice(1,-1).map((t,j)=>{
    const i=j+1,tangent=[-2*t,1];
    const residual=(chords[i-1].unit[0]-chords[i].unit[0])*tangent[0]+
      chords[i-1].unit[1]-chords[i].unit[1];
    return {vertex:i+1,parameter:t,tangent,residual,
      normalizedResidual:residual/Math.hypot(...tangent)};
  });
  return {family:base,query:{example:'in-4090',divisions:4},
    source:source('In[4090]','DiscretizeCurveUniformly'),
    sample:{curve:'(-t², t)',interval:[0,1],parameterValues:ts,points,chords,
      directionResiduals,maximumAbsoluteResidual:Math.max(...directionResiduals.map(
        row=>Math.abs(row.residual))),initialGuess:[0,.25,.5,.75,1],
      increasingRootFromEqualParameterGuess:true}};
}
function multiplier(){
  const ray=(deg:number)=>[Math.cos(deg*Math.PI/180),Math.sin(deg*Math.PI/180)];
  const c=Math.cos(20*Math.PI/180),s=Math.sin(20*Math.PI/180);
  const magnitude=Math.sin(80*Math.PI/180)/Math.sin(20*Math.PI/180);
  return {family:base,query:{example:'multiplier-fixture'},
    source:source('In[4092]','FoldAngleMultipliers2D','verification-fixture'),
    sample:{foldPoints:[[-c,s],[0,0],[c,s]],leftRulings:[ray(100),ray(100),ray(100)],
      rightRulings:[ray(260),ray(260),ray(260)],multipliers:[magnitude,-magnitude,magnitude],
      interiorKawasakiResidualDeg:[0],locallyFlatFoldable:true,
      globalFoldingCertified:false,in4093EllipseReproduced:false}};
}
function in4093(n:3|5|8=5){
  const parameters:Record<3|5|8,number[]>={
    3:[0,.44401733479534494,.9500583811971695,Math.PI/2],
    5:[0,.2629664193510232,.5393249747062812,.8420671644978813,
      1.1829450411818616,Math.PI/2],
    8:[0,.16362574680400346,.33051473247190105,.5039022193665953,
      .6869515623906673,.8826779660569668,1.093823793772668,
      1.322672350205072,Math.PI/2],
  };
  const ts=parameters[n];
  const fold=(t:number)=>{const c=Math.cos(t);return [-2+4*c/(3-c),4*Math.sin(t)/(3-c)];};
  const left=(t:number)=>[-2+.5*Math.cos(t),.5*Math.sin(t)];
  const rightDirector=(t:number)=>{const q=Math.tan(t/2),d=1+4*q*q;
    return [1-2/d,-4*q/d];};
  const right=(t:number)=>{const q=Math.tan(t/2),d=1+4*q*q;
    return [-3+4/d,8*q/d];};
  const functions:[string,(t:number)=>number[]][]=[
    ['CurvedFold2D',fold],['DirectrixLeft2D',()=>[-2,0]],
    ['DirectorLeft2D',t=>[-Math.cos(t),-Math.sin(t)]],
    ['CrossCurveLeft2D',()=>[-2,0]],['SecondCrossCurveLeft2D',left],
    ['DirectrixRight2D',()=>[-1,0]],['DirectorRight2D',rightDirector],
    ['CrossCurveRight2D',()=>[-1,0]],['SecondCrossCurveRight2D',right],
  ];
  const system=functions.map(([key,fn])=>({key,values:ts.map(fn)}));
  const foldPoints=ts.map(fold),leftSecondCrossPoints=ts.map(left),
    rightSecondCrossPoints=ts.map(right);
  const leftRulings=foldPoints.map((p,i)=>leftSecondCrossPoints[i].map((x,j)=>x-p[j]));
  const rightRulings=foldPoints.map((p,i)=>rightSecondCrossPoints[i].map((x,j)=>x-p[j]));
  const chords=foldPoints.slice(1).map((p,i)=>{
    const vector=p.map((x,j)=>x-foldPoints[i][j]),length=Math.hypot(...vector);
    return {index:i+1,vector,length,unit:vector.map(x=>x/length)};
  });
  const directionResiduals=ts.slice(1,-1).map((t,j)=>{
    const i=j+1,c=Math.cos(t),d=(3-c)**2,tangent=[-12*Math.sin(t)/d,4*(3*c-1)/d];
    const residual=(chords[i-1].unit[0]-chords[i].unit[0])*tangent[0]+
      (chords[i-1].unit[1]-chords[i].unit[1])*tangent[1];
    return {vertex:i+1,parameter:t,tangent,residual,
      normalizedResidual:residual/Math.hypot(...tangent)};
  });
  const magnitudes:Record<3|5|8,number>={3:-3.1180921244660214,
    5:-5.13933129892938,8:-8.191754175458618};
  const multipliers=ts.map(()=>magnitudes[n]);
  return {family:base,query:{example:'in-4093',divisions:n},
    source:{...source('In[4093]','ConicSection2DSystem'),definitionCell:'In[4019]',
      savedDivisions:5,parameterStatus:n===5?'saved-input':'bounded-local-extension',
      functionChain:['ConicSection2DSystem','DiscretizeCurveUniformly',
        'DiscretizeSystem','FoldAngleMultipliers2D']},
    sample:{conicParameters:{leftFocus:-2,rightFocus:-1,leftDirectrix:-1.5,
      rightDirectrix:1,simplification:'Simplify'},intervalRad:[0,Math.PI/2],divisions:n,
      parameterValuesRad:ts,parameterValuesDeg:ts.map(t=>t*180/Math.PI),system,
      foldPoints,leftSecondCrossPoints,rightSecondCrossPoints,leftRulings,rightRulings,
      chords,directionResiduals,maximumAbsoluteResidual:Math.max(...directionResiduals.map(
        row=>Math.abs(row.residual))),multipliers,maximumMultiplierDeviation:0,
      maximumEllipseEquationResidual:Math.max(...foldPoints.map(
        p=>Math.abs(8*(p[0]+1.5)**2+9*p[1]**2-18))),
      increasingRootFromEqualParameterGuess:true}};
}

test('the bounded query accepts only saved choices and integer parabola divisions',()=>{
  assert.deepEqual(validateCurvedDiscretizationQuery({example:'in-4090'}),
    CURVED_DISCRETIZATION_PRESETS['in-4090']);
  for(const invalid of [null,[],{},
    {example:'in-4090',divisions:'4'},{example:'in-4090',divisions:null},
    {example:'in-4090',divisions:1},
    {example:'in-4090',divisions:17},{example:'in-4090',divisions:NaN},
    {example:'in-4088',divisions:4},{example:'in-4093',divisions:-1},
    {example:'in-4093',divisions:0},{example:'in-4093',divisions:1},
    {example:'in-4093',divisions:17},{example:'in-4093',divisions:3.5},
    {example:'in-4093',divisions:'5'},
    {example:'in-4093',expression:'Cos[t]'},
    {example:'multiplier-fixture',expression:'sin(t)'},
    {example:'in-4090',curve:'__import__("os")'}]){
    assert.throws(()=>validateCurvedDiscretizationQuery(invalid));
  }
});

test('saved system and multiplier fixture parse only with honest source metadata',()=>{
  const system=parseCurvedDiscretizationResult(in4088());
  assert.equal(system.source.wolframNumericOutAvailable,false);
  const fixture=parseCurvedDiscretizationResult(multiplier());
  assert.equal(fixture.source.origin,'verification-fixture');
  assert.throws(()=>parseCurvedDiscretizationResult({...in4088(),
    source:{...source('In[4090]','DiscretizeSystem')}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...multiplier(),
    sample:{...multiplier().sample,in4093EllipseReproduced:true}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...in4088(),
    sample:{...in4088().sample,system:[{key:'Curve2D',values:[[0,0]]}]}}));
});

test('uniform sample rechecks chord geometry and equation residual before display',()=>{
  const valid=in4090();
  const parsed=parseCurvedDiscretizationResult(valid);
  assert.equal(parsed.query.example,'in-4090');
  assert.throws(()=>parseCurvedDiscretizationResult({...valid,
    sample:{...valid.sample,chords:valid.sample.chords.map((row,i)=>
      i===0?{...row,length:1}:row)}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...valid,
    sample:{...valid.sample,parameterValues:[0,.6,.4,.8,1]}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...valid,
    sample:{...valid.sample,directionResiduals:valid.sample.directionResiduals.map((row,i)=>
      i===1?{...row,residual:.1}:row)}}));
});

test('saved In[4093] ellipse requires original conic parameters and complete function chain',()=>{
  const saved=in4093();
  const parsed=parseCurvedDiscretizationResult(saved);
  assert.equal(parsed.query.example,'in-4093');
  assert.equal(parsed.source.wolframNumericOutAvailable,false);
  assert.deepEqual(validateCurvedDiscretizationQuery({example:'in-4093'}),
    {example:'in-4093',divisions:5});
  for(const n of [3,8] as const){
    const local=parseCurvedDiscretizationResult(in4093(n));
    assert.equal(local.source.parameterStatus,'bounded-local-extension');
    assert.equal(local.sample.multipliers.length,n+1);
  }
  assert.throws(()=>parseCurvedDiscretizationResult({...saved,
    source:{...saved.source,definitionCell:'In[4090]'}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...in4093(8),
    source:{...in4093(8).source,parameterStatus:'saved-input'}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...saved,
    sample:{...saved.sample,conicParameters:{...saved.sample.conicParameters,leftFocus:-3}}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...saved,
    sample:{...saved.sample,system:saved.sample.system.map((row,i)=>
      i===4?{...row,key:'CrossCurveLeft2D'}:row)}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...saved,
    sample:{...saved.sample,rightSecondCrossPoints:saved.sample.rightSecondCrossPoints.map(
      (p,i)=>i===3?[p[0]+.1,p[1]]:p)}}));
  assert.throws(()=>parseCurvedDiscretizationResult({...saved,
    sample:{...saved.sample,multipliers:saved.sample.multipliers.map((x,i)=>i===2?x+.1:x)}}));
});

test('fetch submits only the closed JSON query to the dedicated endpoint',async()=>{
  const oldFetch=globalThis.fetch;
  let url='',body:unknown,signal:AbortSignal|undefined;
  const controller=new AbortController();
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(in4090()),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    await fetchCurvedDiscretizationQuery({example:'in-4090'},controller.signal);
    assert.equal(url,'/api/tessellation/curved-discretization');
    assert.deepEqual(body,{example:'in-4090',divisions:4});
    assert.equal(signal,controller.signal);
    await assert.rejects(fetchCurvedDiscretizationQuery({example:'in-4090',divisions:5}),
      /不一致/);
  }finally{globalThis.fetch=oldFetch;}
});
