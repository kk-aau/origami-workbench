import {api} from './api';

export type Point2=[number,number];
export type Point3=[number,number,number];
export type TangentDevelopableSavedView='forward'|'reverse';
/** In[3914]/In[3919] use bb(0)=(-1,0,0), a rigid translation of In[3913]. */
export const REVERSE_TANGENT_DEVELOPABLE_SHIFT=Math.sqrt(3)/2-1;
export type TangentDevelopableQuery={
  family:'tangent-developable-in3913';curveSegments:number;
  rulingSegments:number;rulingEnd:number;
};
export type TangentDevelopableResult={
  family:'origamica-tangent-developable-pair';query:TangentDevelopableQuery;
  source:{definitionCell:'In[3912]';savedCell:'In[3913]';
    function:'ReshapeTandev3D';machineReadableWolframOut:false};
  invariants:{speed:1;curvature:number;sourceTorsion:-0.5;targetTorsion:0;
    orientation:1;branchSign:1};
  initialFrame:{sourceBase:Point3;sourceDirector:Point3;targetBase:Point3;
    targetDirector:Point3;targetNormal:Point3};
  certification:{commonFirstFundamentalForm:{E:string;F:string;G:string;determinant:string};
    continuousIsometryAnalytic:true;bothSurfacesDevelopableAnalytic:true;
    regularForPositiveRulingDistance:true;regressionEdgeSingularAtZero:true;
    regressionEdgeIsCrease:false;sampledMeshExactIsometry:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;
    deploymentPathChecked:false;selfCollisionChecked:false};
  sample:{parameterValues:number[];rulingDistances:number[];
    flatSamples:Point2[][];foldedSamples:Point3[][];
    regressionEdgeRow:0;flatMetricAtRulingEnd:[number,number,number,number]};
};

export const TANGENT_DEVELOPABLE_PRESET:TangentDevelopableQuery={
  family:'tangent-developable-in3913',curveSegments:64,rulingSegments:4,rulingEnd:1,
};

const object=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:string[])=>
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const near=(a:unknown,b:number)=>typeof a==='number'&&Number.isFinite(a)&&
  Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
const vector=(value:unknown,expected:number[])=>Array.isArray(value)&&
  value.length===expected.length&&expected.every((number,i)=>near(value[i],number));
function integer(value:unknown,name:string,low:number,high:number){
  if(typeof value!=='number'||!Number.isInteger(value)||value<low||value>high)
    throw Error(`${name}须为 ${low}–${high} 的整数。`);
  return value;
}

export function validateTangentDevelopableQuery(value:unknown):TangentDevelopableQuery{
  if(!object(value)||value.family!=='tangent-developable-in3913')
    throw Error('请选择 In[3913] 切线可展面保存例。');
  if(Object.keys(value).some(key=>![
    'family','curveSegments','rulingSegments','rulingEnd'].includes(key)))
    throw Error('请求包含不支持的字段。');
  const curveSegments=integer(value.curveSegments??64,'曲线采样段数',8,256);
  const rulingSegments=integer(value.rulingSegments??4,'母线采样段数',1,16);
  const rulingEnd=value.rulingEnd??1;
  if(typeof rulingEnd!=='number'||!Number.isFinite(rulingEnd)||
    rulingEnd<.05||rulingEnd>1)throw Error('母线终点须为 0.05–1 的有限数值。');
  if((curveSegments+1)*(rulingSegments+1)>4096)
    throw Error('对应采样点不能超过 4096 个。');
  return {family:'tangent-developable-in3913',curveSegments,rulingSegments,rulingEnd};
}

function expectedFlat(u:number,v:number):Point2{
  const a=Math.sqrt(3)/2,c=Math.cos(a*u),s=Math.sin(a*u);
  return [-1+(1-c)/a+v*s,s/a+v*c];
}
function expectedFolded(u:number,v:number):Point3{
  const a=Math.sqrt(3)/2,c=Math.cos(u),s=Math.sin(u);
  return [-a*c+v*a*s,a*s+v*a*c,u/2+v/2];
}

/** Saved analytic family: reject mismatched provenance, flags or sampled coordinates. */
export function parseTangentDevelopableResult(raw:unknown,requested?:TangentDevelopableQuery):TangentDevelopableResult{
  if(!object(raw)||!exactKeys(raw,['family','query','source','invariants','initialFrame',
    'certification','sample'])||raw.family!=='origamica-tangent-developable-pair'||
    !object(raw.query)||!object(raw.source)||!object(raw.invariants)||
    !object(raw.initialFrame)||!object(raw.certification)||!object(raw.sample))
    throw Error('服务器返回的切线可展面格式异常。');
  const rawQuery=raw.query,query=validateTangentDevelopableQuery(rawQuery);
  if(!exactKeys(rawQuery,Object.keys(query))||
    Object.entries(query).some(([key,entry])=>rawQuery[key]!==entry)||
    requested&&Object.entries(requested).some(([key,entry])=>
      query[key as keyof TangentDevelopableQuery]!==entry))
    throw Error('服务器返回的采样参数与请求不一致。');
  const source=raw.source;
  if(!exactKeys(source,['definitionCell','savedCell','function','machineReadableWolframOut'])||
    source.definitionCell!=='In[3912]'||source.savedCell!=='In[3913]'||
    source.function!=='ReshapeTandev3D'||source.machineReadableWolframOut!==false)
    throw Error('服务器返回的原版来源不一致。');
  const invariants=raw.invariants,curvature=Math.sqrt(3)/2;
  if(!exactKeys(invariants,['speed','curvature','sourceTorsion','targetTorsion',
    'orientation','branchSign'])||!near(invariants.speed,1)||
    !near(invariants.curvature,curvature)||!near(invariants.sourceTorsion,-.5)||
    !near(invariants.targetTorsion,0)||invariants.orientation!==1||
    invariants.branchSign!==1)throw Error('服务器返回的曲率、扭率或分支异常。');
  const initial=raw.initialFrame;
  if(!exactKeys(initial,['sourceBase','sourceDirector','targetBase',
    'targetDirector','targetNormal'])||
    !vector(initial.sourceBase,[-curvature,0,0])||
    !vector(initial.sourceDirector,[0,curvature,.5])||
    !vector(initial.targetBase,[-1,0,0])||
    !vector(initial.targetDirector,[0,1,0])||
    !vector(initial.targetNormal,[0,0,1]))
    throw Error('服务器返回的原版初始标架不一致。');
  const cert=raw.certification,form=cert.commonFirstFundamentalForm;
  if(!exactKeys(cert,['commonFirstFundamentalForm','continuousIsometryAnalytic',
    'bothSurfacesDevelopableAnalytic','regularForPositiveRulingDistance',
    'regressionEdgeSingularAtZero','regressionEdgeIsCrease','sampledMeshExactIsometry',
    'exactStraightCreaseFOLD','adoptableCreasePattern','deploymentPathChecked',
    'selfCollisionChecked'])||!object(form)||
    !exactKeys(form,['E','F','G','determinant'])||
    form.E!=='1 + 3 v^2 / 4'||form.F!=='1'||form.G!=='1'||
    form.determinant!=='3 v^2 / 4')
    throw Error('服务器返回的第一基本形式证书异常。');
  for(const key of ['continuousIsometryAnalytic','bothSurfacesDevelopableAnalytic',
    'regularForPositiveRulingDistance','regressionEdgeSingularAtZero'])
    if(cert[key]!==true)throw Error('服务器返回的连续曲面证书不完整。');
  for(const key of ['regressionEdgeIsCrease','sampledMeshExactIsometry',
    'exactStraightCreaseFOLD','adoptableCreasePattern','deploymentPathChecked',
    'selfCollisionChecked'])
    if(cert[key]!==false)throw Error('奇异回归边不可标为折痕、精确 FOLD 或可采用作品。');
  const sample=raw.sample,n=query.curveSegments+1,m=query.rulingSegments+1;
  if(!exactKeys(sample,['parameterValues','rulingDistances','flatSamples',
    'foldedSamples','regressionEdgeRow','flatMetricAtRulingEnd'])||
    !Array.isArray(sample.parameterValues)||sample.parameterValues.length!==n||
    !Array.isArray(sample.rulingDistances)||sample.rulingDistances.length!==m||
    !Array.isArray(sample.flatSamples)||sample.flatSamples.length!==n||
    !Array.isArray(sample.foldedSamples)||sample.foldedSamples.length!==n||
    sample.regressionEdgeRow!==0||
    !vector(sample.flatMetricAtRulingEnd,[1+.75*query.rulingEnd**2,1,1,
      .75*query.rulingEnd**2]))throw Error('服务器返回的配对采样网格异常。');
  for(let i=0;i<n;i++){
    const u=Math.PI*i/(n-1),flatRow=sample.flatSamples[i],foldedRow=sample.foldedSamples[i];
    if(!near(sample.parameterValues[i],u)||!Array.isArray(flatRow)||
      !Array.isArray(foldedRow)||flatRow.length!==m||foldedRow.length!==m)
      throw Error('服务器返回的共用参数网格异常。');
    for(let j=0;j<m;j++){
      const v=query.rulingEnd*j/(m-1);
      if(!near(sample.rulingDistances[j],v)||
        !vector(flatRow[j],expectedFlat(u,v))||
        !vector(foldedRow[j],expectedFolded(u,v)))
        throw Error('服务器返回的二维／三维对应点异常。');
    }
  }
  return raw as TangentDevelopableResult;
}

export async function fetchTangentDevelopable(input:unknown,signal?:AbortSignal){
  const query=validateTangentDevelopableQuery(input);
  return parseTangentDevelopableResult(
    await api('tessellation/curved-tangent-developable',query,signal),query);
}

export function projectTangentPoint(point:Point3,azimuthDeg:number):Point2{
  const az=azimuthDeg*Math.PI/180,elevation=26*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
}

export function tangentDevelopableCurves(result:TangentDevelopableResult,
    folded:boolean,azimuthDeg=0,view:TangentDevelopableSavedView='forward'){
  const samples=result.sample[folded?'foldedSamples':'flatSamples'];
  const map=(point:Point2|Point3)=>{
    if(!folded)return point as Point2;
    const spatial=point as Point3;
    return projectTangentPoint(view==='reverse'?
      [spatial[0]+REVERSE_TANGENT_DEVELOPABLE_SHIFT,spatial[1],spatial[2]]:
      spatial,azimuthDeg);
  };
  return {regression:samples.map(row=>map(row[0])),
    outer:samples.map(row=>map(row[row.length-1]))};
}
