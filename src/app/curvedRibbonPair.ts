import {api} from './api';

export type Point2=[number,number];
export type Point3=[number,number,number];
export type CurvedRibbonPairQuery={
  radius:number;pitch:number;etaPi:number;orientation:-1|1;
  parameterStartPi:number;parameterEndPi:number;halfWidth:number;
  curveSegments:number;rulingSegments:number;
};
export type CurvedRibbonPairResult={
  family:'origamica-helix-ribbon-pair';query:CurvedRibbonPairQuery;
  source:{symbolicCell:'In[3855]';numericalCell:'In[3859]';
    symbolicFunction:'RibbonPair';numericalFunction:'NRibbonPair';
    machineReadableWolframOut:false};
  certification:{continuousIsometryAnalytic:true;surfaceDevelopableAnalytic:true;
    rulingWidthBeforeFocalSet:true;sampledChordsExactIsometry:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;
    deploymentPathChecked:false;selfCollisionChecked:false};
  sample:{parameters:[number,number][];flatSamples:Point2[];spaceSamples:Point3[];
    baseIndices:number[];focalDistance:number};
};

export const CURVED_RIBBON_PAIR_PRESET:CurvedRibbonPairQuery={
  radius:1,pitch:.5,etaPi:.35,orientation:1,
  parameterStartPi:0,parameterEndPi:1,halfWidth:.5,
  curveSegments:200,rulingSegments:20,
};

const keys=Object.keys(CURVED_RIBBON_PAIR_PRESET);
const object=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
function finite(value:unknown,name:string,low:number,high:number):number{
  if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)
    throw Error(`${name}须为 ${low} 至 ${high} 的有限数值。`);
  return value;
}
function integer(value:unknown,name:string,low:number,high:number):number{
  const n=finite(value,name,low,high);
  if(!Number.isInteger(n))throw Error(`${name}须为整数。`);
  return n;
}
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));

/** Only the certified constant-angle helical subdomain is accepted. */
export function validateCurvedRibbonPairQuery(value:unknown):CurvedRibbonPairQuery{
  if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))
    throw Error('直纹带请求须为只含支持参数的 JSON 对象。');
  const get=(key:keyof CurvedRibbonPairQuery)=>
    Object.prototype.hasOwnProperty.call(value,key)?value[key]:CURVED_RIBBON_PAIR_PRESET[key];
  const radius=finite(get('radius'),'空间螺旋半径',.25,4);
  const pitch=finite(get('pitch'),'每弧度螺距',.05,2);
  const etaPi=finite(get('etaPi'),'曲面角 η/π',.05,.45);
  const orientation=integer(get('orientation'),'母线朝向',-1,1);
  if(orientation!==-1&&orientation!==1)throw Error('母线朝向只能是 +1 或 −1。');
  const parameterStartPi=finite(get('parameterStartPi'),'起点 s₀/π',-2,2);
  const parameterEndPi=finite(get('parameterEndPi'),'终点 s₁/π',-2,2);
  if(!(parameterEndPi-parameterStartPi>1e-6&&parameterEndPi-parameterStartPi<=1))
    throw Error('参数区间须大于 0 且不超过 π。');
  const halfWidth=finite(get('halfWidth'),'带片半宽',.05,2);
  const curveSegments=integer(get('curveSegments'),'曲线段数',16,256);
  const rulingSegments=integer(get('rulingSegments'),'母线段数',2,20);
  if(rulingSegments%2)throw Error('母线段数须为偶数，以保留共同基线。');
  if((curveSegments+1)*(rulingSegments+1)>5000)throw Error('采样点不能超过 5000 个。');
  const speed=Math.hypot(radius,pitch),curvature=radius/(speed*speed);
  const torsion=pitch/(speed*speed),eta=etaPi*Math.PI;
  const sinRho=curvature*Math.sin(eta)/Math.hypot(curvature*Math.sin(eta),torsion);
  const focalDistance=speed*sinRho/((radius/speed)*Math.cos(eta));
  if(!(halfWidth<focalDistance))throw Error('带片半宽须位于焦线之前。');
  return {radius,pitch,etaPi,orientation:orientation as -1|1,parameterStartPi,
    parameterEndPi,halfWidth,curveSegments,rulingSegments};
}

function vector(value:unknown,length:number):value is number[]{
  return Array.isArray(value)&&value.length===length&&value.every(
    n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e4);
}

/** Reject forged certificates, wrong source identity, and mismatched sample grids. */
export function parseCurvedRibbonPairResult(raw:unknown,requested?:CurvedRibbonPairQuery):CurvedRibbonPairResult{
  if(!object(raw)||raw.family!=='origamica-helix-ribbon-pair'||!object(raw.query)||
    !object(raw.source)||!object(raw.certification)||!object(raw.sample)||
    Object.keys(raw).some(key=>!['family','query','source','certification','sample'].includes(key)))
    throw Error('服务器返回的直纹带格式异常。');
  const responseQuery=raw.query,query=validateCurvedRibbonPairQuery(responseQuery);
  if(Object.keys(responseQuery).length!==keys.length||keys.some(key=>responseQuery[key]!==query[key as keyof CurvedRibbonPairQuery])||
    requested&&keys.some(key=>query[key as keyof CurvedRibbonPairQuery]!==requested[key as keyof CurvedRibbonPairQuery]))
    throw Error('服务器返回的直纹带参数与请求不一致。');
  const source=raw.source;
  const expectedSource={symbolicCell:'In[3855]',numericalCell:'In[3859]',
    symbolicFunction:'RibbonPair',numericalFunction:'NRibbonPair',machineReadableWolframOut:false};
  if(Object.keys(source).length!==5||Object.entries(expectedSource).some(([key,entry])=>source[key]!==entry))
    throw Error('服务器返回的原版来源不一致。');
  const cert=raw.certification;
  for(const name of ['continuousIsometryAnalytic','surfaceDevelopableAnalytic','rulingWidthBeforeFocalSet'])
    if(cert[name]!==true)throw Error('直纹带连续曲面认证不完整。');
  for(const name of ['sampledChordsExactIsometry','exactStraightCreaseFOLD','adoptableCreasePattern',
    'deploymentPathChecked','selfCollisionChecked'])
    if(cert[name]!==false)throw Error('采样带片不能作为精确 FOLD 或可采用折痕图。');
  if(Object.keys(cert).length!==8)throw Error('直纹带认证字段异常。');
  const sample=raw.sample,n=query.curveSegments+1,row=query.rulingSegments+1,size=n*row;
  if(!Array.isArray(sample.parameters)||sample.parameters.length!==size||
    !Array.isArray(sample.flatSamples)||sample.flatSamples.length!==size||
    !Array.isArray(sample.spaceSamples)||sample.spaceSamples.length!==size||
    !Array.isArray(sample.baseIndices)||sample.baseIndices.length!==n||
    typeof sample.focalDistance!=='number'||!Number.isFinite(sample.focalDistance)||
    !(sample.focalDistance>query.halfWidth))
    throw Error('服务器返回的直纹带采样数量或焦线异常。');
  const start=query.parameterStartPi*Math.PI,end=query.parameterEndPi*Math.PI;
  const speed=Math.hypot(query.radius,query.pitch);
  const turn=(query.radius/speed)*Math.cos(query.etaPi*Math.PI);
  for(let i=0;i<n;i++){
    const s=start+(end-start)*i/query.curveSegments;
    const baseIndex=i*row+query.rulingSegments/2;
    if(sample.baseIndices[i]!==baseIndex)throw Error('共同基线索引异常。');
    const flatBase=sample.flatSamples[baseIndex],spaceBase=sample.spaceSamples[baseIndex];
    const a=turn*(s-start),flatExpected=[speed/turn*Math.sin(a),speed/turn*(1-Math.cos(a))];
    const spaceExpected=[query.radius*Math.cos(s),query.radius*Math.sin(s),query.pitch*s];
    if(!vector(flatBase,2)||!vector(spaceBase,3)||
      !flatBase.every((value:number,k:number)=>near(value,flatExpected[k]))||
      !spaceBase.every((value:number,k:number)=>near(value,spaceExpected[k])))
      throw Error('共同基线与保存输入不一致。');
    for(let j=0;j<row;j++){
      const index=i*row+j,parameter=sample.parameters[index];
      const v=query.halfWidth*(2*j/query.rulingSegments-1);
      if(!vector(parameter,2)||!near(parameter[0],s)||!near(parameter[1],v)||
        !vector(sample.flatSamples[index],2)||!vector(sample.spaceSamples[index],3))
        throw Error('二维／三维对应采样网格异常。');
    }
  }
  return raw as CurvedRibbonPairResult;
}

export async function fetchCurvedRibbonPair(input:unknown,signal?:AbortSignal):Promise<CurvedRibbonPairResult>{
  const query=validateCurvedRibbonPairQuery(input);
  return parseCurvedRibbonPairResult(await api('tessellation/curved-ribbon-pair',query,signal),query);
}

export function projectRibbonPoint(point:Point3,azimuthDeg:number):Point2{
  const az=azimuthDeg*Math.PI/180,elevation=28*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
}

export function ribbonCurves(result:CurvedRibbonPairResult,space:boolean,azimuthDeg=0){
  const {query,sample}=result,row=query.rulingSegments+1;
  const points=space?sample.spaceSamples:sample.flatSamples;
  const map=(index:number):Point2=>space?
    projectRibbonPoint(points[index] as Point3,azimuthDeg):points[index] as Point2;
  return {base:sample.baseIndices.map(map),minus:sample.baseIndices.map((_,i)=>map(i*row)),
    plus:sample.baseIndices.map((_,i)=>map(i*row+row-1))};
}
