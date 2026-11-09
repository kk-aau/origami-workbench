import {api} from './api';

/** No expression fields: these saved or fixed choices are the entire read-only API. */
export type CurvedDiscretizationExample='in-4088'|'in-4090'|'in-4093'|'multiplier-fixture';
export type CurvedDiscretizationQuery=
  {example:'in-4088'|'multiplier-fixture'}|
  {example:'in-4090'|'in-4093';divisions:number};
export type Point2=[number,number];
export type Point3=[number,number,number];
type Source={inputCell:'In[4088]'|'In[4090]'|'In[4092]'|'In[4093]';
  function:'DiscretizeSystem'|'DiscretizeCurveUniformly'|'FoldAngleMultipliers2D'|'ConicSection2DSystem';
  origin:'saved-input'|'verification-fixture';wolframNumericOutAvailable:false;
  definitionCell?:'In[4019]';functionChain?:string[];savedDivisions?:5;
  parameterStatus?:'saved-input'|'bounded-local-extension'};
type Base={family:'origamica-curved-discretization';source:Source};
export type SystemResult=Base&{query:{example:'in-4088'};sample:{parameterValues:number[];
  system:[{key:'Curve2D';values:Point2[]},{key:'Curve3D';values:Point3[]}]}};
export type Chord={index:number;vector:Point2;length:number;unit:Point2};
export type DirectionResidual={vertex:number;parameter:number;tangent:Point2;
  residual:number;normalizedResidual:number};
export type UniformResult=Base&{query:{example:'in-4090';divisions:number};sample:{
  curve:'(-t², t)';interval:[0,1];parameterValues:number[];points:Point2[];
  chords:Chord[];directionResiduals:DirectionResidual[];maximumAbsoluteResidual:number;
  initialGuess:number[];increasingRootFromEqualParameterGuess:true}};
export type MultiplierResult=Base&{query:{example:'multiplier-fixture'};sample:{
  foldPoints:Point2[];leftRulings:Point2[];rightRulings:Point2[];
  multipliers:number[];interiorKawasakiResidualDeg:number[];
  locallyFlatFoldable:true;globalFoldingCertified:false;in4093EllipseReproduced:false}};
export type EllipseResult=Base&{query:{example:'in-4093';divisions:number};sample:{
  conicParameters:{leftFocus:-2;rightFocus:-1;leftDirectrix:-1.5;
    rightDirectrix:1;simplification:'Simplify'};
  intervalRad:[0,number];divisions:number;parameterValuesRad:number[];parameterValuesDeg:number[];
  system:{key:string;values:Point2[]}[];foldPoints:Point2[];
  leftSecondCrossPoints:Point2[];rightSecondCrossPoints:Point2[];
  leftRulings:Point2[];rightRulings:Point2[];chords:Chord[];
  directionResiduals:DirectionResidual[];maximumAbsoluteResidual:number;
  multipliers:number[];maximumMultiplierDeviation:number;
  maximumEllipseEquationResidual:number;increasingRootFromEqualParameterGuess:true}};
export type CurvedDiscretizationResult=SystemResult|UniformResult|MultiplierResult|EllipseResult;

export const CURVED_DISCRETIZATION_PRESETS:Record<CurvedDiscretizationExample,CurvedDiscretizationQuery>={
  'in-4088':{example:'in-4088'},
  'in-4090':{example:'in-4090',divisions:4},
  'in-4093':{example:'in-4093',divisions:5},
  'multiplier-fixture':{example:'multiplier-fixture'},
};

function record(value:unknown):value is Record<string,unknown>{
  return !!value&&typeof value==='object'&&!Array.isArray(value);
}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const vector=(value:unknown,n:number):value is number[]=>
  Array.isArray(value)&&value.length===n&&value.every(finite);
const near=(a:number,b:number,tolerance=1e-8)=>Math.abs(a-b)<=tolerance;
const ellipseFold=(t:number):Point2=>{
  const cosine=Math.cos(t),sine=Math.sin(t);
  return [-2+4*cosine/(3-cosine),4*sine/(3-cosine)];
};
const ellipseDerivative=(t:number):Point2=>{
  const cosine=Math.cos(t),sine=Math.sin(t),denominator=(3-cosine)**2;
  return [-12*sine/denominator,4*(3*cosine-1)/denominator];
};
const ellipseLeft=(t:number):Point2=>[-2+.5*Math.cos(t),.5*Math.sin(t)];
const ellipseRight=(t:number):Point2=>{
  const q=Math.tan(t/2),denominator=1+4*q*q;
  return [-3+4/denominator,8*q/denominator];
};
const ellipseRightDirector=(t:number):Point2=>{
  const q=Math.tan(t/2),denominator=1+4*q*q;
  return [1-2/denominator,-4*q/denominator];
};
const samePoint=(value:unknown,expected:Point2):boolean=>vector(value,2)&&
  near(value[0],expected[0])&&near(value[1],expected[1]);
function signedRotation(first:Point2,second:Point2):number{
  const angle=Math.atan2(first[0]*second[1]-first[1]*second[0],
    first[0]*second[0]+first[1]*second[1]);
  return angle===-Math.PI?Math.PI:angle;
}
function expectedMultiplier(points:Point2[],left:Point2[],right:Point2[],i:number):number{
  const previous=i>0?[points[i-1][0]-points[i][0],points[i-1][1]-points[i][1]] as Point2:null;
  const following=i<points.length-1?
    [points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]] as Point2:null;
  const a1=previous?signedRotation(left[i],previous):null;
  const a2=previous?signedRotation(previous,right[i]):null;
  const a3=following?signedRotation(right[i],following):null;
  const a4=following?signedRotation(following,left[i]):null;
  if(i>0&&i<points.length-1)
    shape(Math.abs((a1 as number)-(a2 as number)+(a3 as number)-(a4 as number))<=1e-8);
  const numerator=i===0?Math.sin(((a4 as number)+(a3 as number))/2):
    Math.sin(((a1 as number)+(a2 as number))/2);
  const denominator=i===0?Math.sin(((a4 as number)-(a3 as number))/2):
    Math.sin(((a1 as number)-(a2 as number))/2);
  shape(Math.abs(denominator)>1e-12);
  return numerator/denominator;
}
function shape(condition:unknown):asserts condition{
  if(!condition)throw Error('服务器返回的曲折离散化数据异常。');
}

export function validateCurvedDiscretizationQuery(value:unknown):CurvedDiscretizationQuery{
  if(!record(value))throw Error('离散化查询须为 JSON 对象。');
  const example=value.example;
  if(example!=='in-4088'&&example!=='in-4090'&&example!=='in-4093'&&
    example!=='multiplier-fixture')
    throw Error('请选择受支持的第 45 节样例。');
  if(Object.keys(value).some(key=>key!=='example'&&
    ((example!=='in-4090'&&example!=='in-4093')||key!=='divisions')))
    throw Error('离散化查询包含不支持的字段。');
  if(example!=='in-4090'&&example!=='in-4093')return {example};
  const divisions='divisions' in value?value.divisions:example==='in-4090'?4:5;
  if(!finite(divisions)||!Number.isInteger(divisions)||divisions<2||divisions>16)
    throw Error('分段数须为 2–16 的整数。');
  return {example,divisions};
}

/** Rejects a mismatched source claim or a result outside the bounded sample contract. */
export function parseCurvedDiscretizationResult(raw:unknown):CurvedDiscretizationResult{
  shape(record(raw)&&raw.family==='origamica-curved-discretization'&&record(raw.source)&&record(raw.sample));
  const query=validateCurvedDiscretizationQuery(raw.query),source=raw.source,sample=raw.sample;
  const expected=query.example==='in-4088'?['In[4088]','DiscretizeSystem','saved-input']:
    query.example==='in-4090'?['In[4090]','DiscretizeCurveUniformly','saved-input']:
      query.example==='in-4093'?['In[4093]','ConicSection2DSystem','saved-input']:
        ['In[4092]','FoldAngleMultipliers2D','verification-fixture'];
  shape(source.inputCell===expected[0]&&source.function===expected[1]&&
    source.origin===expected[2]&&source.wolframNumericOutAvailable===false);
  if(query.example==='in-4088'){
    shape(Array.isArray(sample.parameterValues)&&sample.parameterValues.length===5&&
      sample.parameterValues.every((t:unknown,i:number)=>finite(t)&&near(t,i/4))&&
      Array.isArray(sample.system)&&sample.system.length===2);
    for(const [row,key,dim] of [[sample.system[0],'Curve2D',2],[sample.system[1],'Curve3D',3]] as const){
      shape(record(row)&&row.key===key&&Array.isArray(row.values)&&row.values.length===5);
      shape(row.values.every((p:unknown,i:number)=>vector(p,dim)&&
        near((p as number[])[0],i/4)&&near((p as number[])[1],(i/4)**2)&&
        (dim===2||near((p as number[])[2],0))));
    }
  }else if(query.example==='in-4090'){
    const n=query.divisions;
    shape(sample.curve==='(-t², t)'&&Array.isArray(sample.interval)&&
      sample.interval.length===2&&sample.interval[0]===0&&sample.interval[1]===1&&
      sample.increasingRootFromEqualParameterGuess===true&&
      Array.isArray(sample.parameterValues)&&sample.parameterValues.length===n+1&&
      Array.isArray(sample.points)&&sample.points.length===n+1&&
      Array.isArray(sample.chords)&&sample.chords.length===n&&
      Array.isArray(sample.directionResiduals)&&sample.directionResiduals.length===n-1&&
      Array.isArray(sample.initialGuess)&&sample.initialGuess.length===n+1&&
      sample.initialGuess.every((t:unknown,i:number)=>finite(t)&&near(t,i/n))&&
      finite(sample.maximumAbsoluteResidual)&&sample.maximumAbsoluteResidual<=1e-8);
    const ts=sample.parameterValues as unknown[],points=sample.points as unknown[];
    shape(ts.every((t,i)=>finite(t)&&t>=0&&t<=1&&
      (i===0?near(t,0):t>(ts[i-1] as number))&&
      vector(points[i],2)&&near((points[i] as number[])[0],-t*t)&&
      near((points[i] as number[])[1],t))&&near(ts[n] as number,1));
    const units:Point2[]=[];
    for(let i=0;i<n;i++){
      const chord=sample.chords[i];
      shape(record(chord)&&chord.index===i+1&&vector(chord.vector,2)&&
        finite(chord.length)&&chord.length>0&&vector(chord.unit,2));
      const p=points[i] as Point2,q=points[i+1] as Point2;
      const dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
      shape(near(chord.vector[0],dx)&&near(chord.vector[1],dy)&&
        near(chord.length,length)&&near(chord.unit[0],dx/length)&&near(chord.unit[1],dy/length));
      units.push(chord.unit as Point2);
    }
    for(let i=1;i<n;i++){
      const row=sample.directionResiduals[i-1],t=ts[i] as number;
      shape(record(row)&&row.vertex===i+1&&finite(row.parameter)&&near(row.parameter,t)&&
        vector(row.tangent,2)&&near(row.tangent[0],-2*t)&&near(row.tangent[1],1)&&
        finite(row.residual)&&finite(row.normalizedResidual));
      const residual=(units[i-1][0]-units[i][0])*(-2*t)+units[i-1][1]-units[i][1];
      shape(near(row.residual,residual)&&near(row.normalizedResidual,residual/Math.hypot(-2*t,1))&&
        Math.abs(row.residual)<=1e-8);
    }
    shape(near(sample.maximumAbsoluteResidual,Math.max(...sample.directionResiduals.map(
      (row:DirectionResidual)=>Math.abs(row.residual)))));
  }else if(query.example==='in-4093'){
    const n=query.divisions;
    const conic=sample.conicParameters;
    shape(source.definitionCell==='In[4019]'&&
      source.savedDivisions===5&&
      source.parameterStatus===(n===5?'saved-input':'bounded-local-extension')&&
      Array.isArray(source.functionChain)&&
      JSON.stringify(source.functionChain)===JSON.stringify([
        'ConicSection2DSystem','DiscretizeCurveUniformly',
        'DiscretizeSystem','FoldAngleMultipliers2D'])&&
      record(conic)&&conic.leftFocus===-2&&conic.rightFocus===-1&&
      conic.leftDirectrix===-1.5&&conic.rightDirectrix===1&&
      conic.simplification==='Simplify'&&sample.divisions===n&&
      Array.isArray(sample.intervalRad)&&sample.intervalRad.length===2&&
      sample.intervalRad[0]===0&&near(sample.intervalRad[1],Math.PI/2)&&
      sample.increasingRootFromEqualParameterGuess===true&&
      Array.isArray(sample.parameterValuesRad)&&sample.parameterValuesRad.length===n+1&&
      Array.isArray(sample.parameterValuesDeg)&&sample.parameterValuesDeg.length===n+1&&
      Array.isArray(sample.system)&&sample.system.length===9&&
      Array.isArray(sample.foldPoints)&&sample.foldPoints.length===n+1&&
      Array.isArray(sample.leftSecondCrossPoints)&&sample.leftSecondCrossPoints.length===n+1&&
      Array.isArray(sample.rightSecondCrossPoints)&&sample.rightSecondCrossPoints.length===n+1&&
      Array.isArray(sample.leftRulings)&&sample.leftRulings.length===n+1&&
      Array.isArray(sample.rightRulings)&&sample.rightRulings.length===n+1&&
      Array.isArray(sample.chords)&&sample.chords.length===n&&
      Array.isArray(sample.directionResiduals)&&sample.directionResiduals.length===n-1&&
      Array.isArray(sample.multipliers)&&sample.multipliers.length===n+1&&
      sample.multipliers.every(finite)&&finite(sample.maximumAbsoluteResidual)&&
      finite(sample.maximumMultiplierDeviation)&&
      finite(sample.maximumEllipseEquationResidual)&&
      sample.maximumAbsoluteResidual<=1e-8&&
      sample.maximumMultiplierDeviation<=1e-8&&
      sample.maximumEllipseEquationResidual<=1e-8);
    const keys=['CurvedFold2D','DirectrixLeft2D','DirectorLeft2D',
      'CrossCurveLeft2D','SecondCrossCurveLeft2D','DirectrixRight2D',
      'DirectorRight2D','CrossCurveRight2D','SecondCrossCurveRight2D'];
    const ts=sample.parameterValuesRad as unknown[];
    const values=sample.system as unknown[];
    shape(values.every((row,i)=>record(row)&&row.key===keys[i]&&
      Array.isArray(row.values)&&row.values.length===n+1&&row.values.every((p:unknown)=>vector(p,2))));
    for(let i=0;i<=n;i++){
      const t=ts[i];
      shape(finite(t)&&t>=0&&t<=Math.PI/2&&
        (i===0?near(t,0):t>(ts[i-1] as number))&&
        finite(sample.parameterValuesDeg[i])&&
        near(sample.parameterValuesDeg[i],t*180/Math.PI)&&
        samePoint(sample.foldPoints[i],ellipseFold(t))&&
        samePoint(sample.leftSecondCrossPoints[i],ellipseLeft(t))&&
        samePoint(sample.rightSecondCrossPoints[i],ellipseRight(t)));
      const fold=sample.foldPoints[i] as Point2,
        left=sample.leftSecondCrossPoints[i] as Point2,
        right=sample.rightSecondCrossPoints[i] as Point2;
      shape(samePoint(sample.leftRulings[i],[left[0]-fold[0],left[1]-fold[1]])&&
        samePoint(sample.rightRulings[i],[right[0]-fold[0],right[1]-fold[1]])&&
        samePoint((values[0] as {values:Point2[]}).values[i],fold)&&
        samePoint((values[1] as {values:Point2[]}).values[i],[-2,0])&&
        samePoint((values[2] as {values:Point2[]}).values[i],[-Math.cos(t),-Math.sin(t)])&&
        samePoint((values[3] as {values:Point2[]}).values[i],[-2,0])&&
        samePoint((values[4] as {values:Point2[]}).values[i],left)&&
        samePoint((values[5] as {values:Point2[]}).values[i],[-1,0])&&
        samePoint((values[6] as {values:Point2[]}).values[i],ellipseRightDirector(t))&&
        samePoint((values[7] as {values:Point2[]}).values[i],[-1,0])&&
        samePoint((values[8] as {values:Point2[]}).values[i],right)&&
        near(8*(fold[0]+1.5)**2+9*fold[1]**2,18));
    }
    shape(near(ts[n] as number,Math.PI/2));
    const units:Point2[]=[];
    for(let i=0;i<n;i++){
      const chord=sample.chords[i];
      shape(record(chord)&&chord.index===i+1&&vector(chord.vector,2)&&
        finite(chord.length)&&chord.length>0&&vector(chord.unit,2));
      const a=sample.foldPoints[i] as Point2,b=sample.foldPoints[i+1] as Point2;
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      shape(near(chord.vector[0],dx)&&near(chord.vector[1],dy)&&
        near(chord.length,length)&&near(chord.unit[0],dx/length)&&near(chord.unit[1],dy/length));
      units.push(chord.unit as Point2);
    }
    for(let i=1;i<n;i++){
      const t=ts[i] as number,row=sample.directionResiduals[i-1],
        tangent=ellipseDerivative(t);
      shape(record(row)&&row.vertex===i+1&&finite(row.parameter)&&
        near(row.parameter,t)&&samePoint(row.tangent,tangent)&&
        finite(row.residual)&&finite(row.normalizedResidual));
      const residual=(units[i-1][0]-units[i][0])*tangent[0]+
        (units[i-1][1]-units[i][1])*tangent[1];
      shape(near(row.residual,residual)&&
        near(row.normalizedResidual,residual/Math.hypot(...tangent))&&
        Math.abs(row.residual)<=1e-8);
    }
    const multipliers=sample.multipliers as number[];
    const points=sample.foldPoints as Point2[],
      leftRulings=sample.leftRulings as Point2[],
      rightRulings=sample.rightRulings as Point2[];
    shape(near(sample.maximumAbsoluteResidual,Math.max(...sample.directionResiduals.map(
      (row:DirectionResidual)=>Math.abs(row.residual))))&&
      near(sample.maximumMultiplierDeviation,Math.max(...multipliers.map(
        value=>Math.abs(value-multipliers[0]))))&&
      near(sample.maximumEllipseEquationResidual,Math.max(...sample.foldPoints.map(
        (point:Point2)=>Math.abs(8*(point[0]+1.5)**2+9*point[1]**2-18))))&&
      multipliers.every((value,i)=>near(value,
        expectedMultiplier(points,leftRulings,rightRulings,i),1e-7)));
  }else{
    shape(sample.locallyFlatFoldable===true&&sample.globalFoldingCertified===false&&
      sample.in4093EllipseReproduced===false&&
      Array.isArray(sample.foldPoints)&&sample.foldPoints.length===3&&
      Array.isArray(sample.leftRulings)&&sample.leftRulings.length===3&&
      Array.isArray(sample.rightRulings)&&sample.rightRulings.length===3&&
      Array.isArray(sample.multipliers)&&sample.multipliers.length===3&&
      sample.foldPoints.every((p:unknown)=>vector(p,2))&&
      sample.leftRulings.every((p:unknown)=>vector(p,2))&&
      sample.rightRulings.every((p:unknown)=>vector(p,2))&&
      sample.multipliers.every(finite)&&
      Array.isArray(sample.interiorKawasakiResidualDeg)&&
      sample.interiorKawasakiResidualDeg.length===1&&
      finite(sample.interiorKawasakiResidualDeg[0])&&
      Math.abs(sample.interiorKawasakiResidualDeg[0])<=1e-8);
    const magnitude=Math.sin(80*Math.PI/180)/Math.sin(20*Math.PI/180);
    shape(sample.multipliers.every((m:number,i:number)=>near(m,(i===1?-1:1)*magnitude)));
  }
  return raw as CurvedDiscretizationResult;
}

export async function fetchCurvedDiscretizationQuery(value:unknown,signal?:AbortSignal){
  const query=validateCurvedDiscretizationQuery(value);
  const result=parseCurvedDiscretizationResult(
    await api<unknown>('tessellation/curved-discretization',query,signal));
  if(JSON.stringify(result.query)!==JSON.stringify(query))
    throw Error('服务器返回的离散化查询与请求不一致。');
  return result;
}
