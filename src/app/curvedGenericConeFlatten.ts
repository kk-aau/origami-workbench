import {api} from './api';

export type Point2=[number,number];
export type Point3=[number,number,number];
export type GenericConeFlattenQuery={family:'generic-cone-flatten-in3886';
  angleDeg:number;curveSegments:number;rulingSegments:number;rulingEnd:number};
export type GenericConeFlattenResult={
  family:'origamica-generic-cone-flatten-pair';query:GenericConeFlattenQuery;
  source:{definitionCell:'In[3885]';savedCell:'In[3886]';
    function:'NFlattenGeneric2D';machineReadableWolframOut:false;
    sampledSurfaceExactFOLD:false};
  initial:{parameter:0;flatBase:Point2;flatTangent:Point2;orientation:1;
    sourceDirectorIsNegativeBase:true};
  invariants:{sinTheta:number;cosTheta:number;planarTurningRate:number;
    geodesicCurvature:1;commonMetric:{E:string;F:'0';G:'1';determinant:string}};
  certification:{continuousIsometryAnalytic:true;
    bothSurfacesDevelopableAnalytic:true;regularExactlyForVLessThanOne:true;
    apexAtVOneSingular:true;sampleIncludesApex:boolean;
    sampledSurfaceExactFOLD:false;adoptableCreasePattern:false;
    deploymentPathChecked:false;selfIntersectionChecked:false};
  sample:{parameterValues:number[];rulingValues:number[];
    flatSamples:Point2[][];foldedSamples:Point3[][];
    flatBaseCurve:Point2[];foldedBaseCurve:Point3[]};
};
export const GENERIC_CONE_FLATTEN_PRESET:GenericConeFlattenQuery={
  family:'generic-cone-flatten-in3886',angleDeg:30,curveSegments:64,
  rulingSegments:8,rulingEnd:1,
};
const object=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:string[])=>
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const near=(value:unknown,expected:number)=>typeof value==='number'&&
  Number.isFinite(value)&&Math.abs(value-expected)<=
  1e-8*Math.max(1,Math.abs(value),Math.abs(expected));
const vector=(value:unknown,expected:number[])=>Array.isArray(value)&&
  value.length===expected.length&&expected.every((number,i)=>near(value[i],number));

export function validateGenericConeFlattenQuery(value:unknown):GenericConeFlattenQuery{
  if(!object(value)||value.family!=='generic-cone-flatten-in3886')
    throw Error('请选择 In[3886] 圆锥展开保存例。');
  if(Object.keys(value).some(key=>!['family','angleDeg','curveSegments',
    'rulingSegments','rulingEnd'].includes(key)))throw Error('请求包含不支持的字段。');
  const angleDeg=value.angleDeg??30,rulingEnd=value.rulingEnd??1;
  const curveSegments=value.curveSegments??64,rulingSegments=value.rulingSegments??8;
  if(typeof angleDeg!=='number'||!Number.isFinite(angleDeg)||
    angleDeg<15||angleDeg>60)throw Error('锥半角须为 15–60° 的有限数值。');
  if(typeof rulingEnd!=='number'||!Number.isFinite(rulingEnd)||
    rulingEnd<.2||rulingEnd>1)throw Error('母线终点须为 0.2–1 的有限数值。');
  if(typeof curveSegments!=='number'||!Number.isInteger(curveSegments)||
    curveSegments<16||curveSegments>256)throw Error('曲线段数须为 16–256 的整数。');
  if(typeof rulingSegments!=='number'||!Number.isInteger(rulingSegments)||
    rulingSegments<2||rulingSegments>16)throw Error('母线段数须为 2–16 的整数。');
  return {family:'generic-cone-flatten-in3886',angleDeg,curveSegments,
    rulingSegments,rulingEnd};
}

export function genericConePoints(u:number,v:number,angleDeg:number){
  const a=Math.sin(angleDeg*Math.PI/180),c=Math.cos(angleDeg*Math.PI/180),r=1-v;
  return {flat:[r*Math.cos(a*u),r*Math.sin(a*u)] as Point2,
    space:[r*c,-r*a*Math.cos(u),r*a*Math.sin(u)] as Point3};
}

/** Reject mismatched provenance, singular claims and any altered corresponding point. */
export function parseGenericConeFlattenResult(raw:unknown,
    requested?:GenericConeFlattenQuery):GenericConeFlattenResult{
  if(!object(raw)||!exactKeys(raw,['family','query','source','initial',
    'invariants','certification','sample'])||
    raw.family!=='origamica-generic-cone-flatten-pair'||
    !object(raw.query)||!object(raw.source)||!object(raw.initial)||
    !object(raw.invariants)||!object(raw.certification)||!object(raw.sample))
    throw Error('服务器返回的圆锥展开格式异常。');
  const rawQuery=raw.query,query=validateGenericConeFlattenQuery(rawQuery);
  if(!exactKeys(rawQuery,Object.keys(query))||
    Object.entries(query).some(([key,value])=>rawQuery[key]!==value)||
    requested&&Object.entries(requested).some(([key,value])=>
      query[key as keyof GenericConeFlattenQuery]!==value))
    throw Error('服务器返回的圆锥参数与请求不一致。');
  const source=raw.source;
  if(!exactKeys(source,['definitionCell','savedCell','function',
    'machineReadableWolframOut','sampledSurfaceExactFOLD'])||
    source.definitionCell!=='In[3885]'||source.savedCell!=='In[3886]'||
    source.function!=='NFlattenGeneric2D'||
    source.machineReadableWolframOut!==false||
    source.sampledSurfaceExactFOLD!==false)
    throw Error('服务器返回的原版来源或 FOLD 标记异常。');
  const initial=raw.initial;
  if(!exactKeys(initial,['parameter','flatBase','flatTangent','orientation',
    'sourceDirectorIsNegativeBase'])||initial.parameter!==0||
    !vector(initial.flatBase,[1,0])||!vector(initial.flatTangent,[0,1])||
    initial.orientation!==1||initial.sourceDirectorIsNegativeBase!==true)
    throw Error('服务器返回的保存初值异常。');
  const invariants=raw.invariants,metric=invariants.commonMetric;
  const a=Math.sin(query.angleDeg*Math.PI/180),c=Math.cos(query.angleDeg*Math.PI/180);
  if(!exactKeys(invariants,['sinTheta','cosTheta','planarTurningRate',
    'geodesicCurvature','commonMetric'])||!near(invariants.sinTheta,a)||
    !near(invariants.cosTheta,c)||!near(invariants.planarTurningRate,a)||
    !near(invariants.geodesicCurvature,1)||!object(metric)||
    !exactKeys(metric,['E','F','G','determinant'])||
    metric.E!=='sin(theta)^2 * (1-v)^2'||metric.F!=='0'||metric.G!=='1'||
    metric.determinant!=='sin(theta)^2 * (1-v)^2')
    throw Error('服务器返回的达布标架或第一基本形式异常。');
  const cert=raw.certification;
  if(!exactKeys(cert,['continuousIsometryAnalytic','bothSurfacesDevelopableAnalytic',
    'regularExactlyForVLessThanOne','apexAtVOneSingular','sampleIncludesApex',
    'sampledSurfaceExactFOLD','adoptableCreasePattern','deploymentPathChecked',
    'selfIntersectionChecked'])||cert.continuousIsometryAnalytic!==true||
    cert.bothSurfacesDevelopableAnalytic!==true||
    cert.regularExactlyForVLessThanOne!==true||cert.apexAtVOneSingular!==true||
    cert.sampleIncludesApex!==(query.rulingEnd===1)||
    cert.sampledSurfaceExactFOLD!==false||cert.adoptableCreasePattern!==false||
    cert.deploymentPathChecked!==false||cert.selfIntersectionChecked!==false)
    throw Error('锥顶奇异边不可标为正则、精确 FOLD 或可采用折痕。');
  const sample=raw.sample,n=query.curveSegments+1,m=query.rulingSegments+1;
  const arrays=['parameterValues','rulingValues','flatSamples','foldedSamples',
    'flatBaseCurve','foldedBaseCurve'];
  if(!exactKeys(sample,arrays)||arrays.some(key=>!Array.isArray(sample[key]))||
    (sample.parameterValues as unknown[]).length!==n||
    (sample.rulingValues as unknown[]).length!==m||
    (sample.flatSamples as unknown[]).length!==n||
    (sample.foldedSamples as unknown[]).length!==n||
    (sample.flatBaseCurve as unknown[]).length!==n||
    (sample.foldedBaseCurve as unknown[]).length!==n)
    throw Error('服务器返回的二维／三维采样数量异常。');
  const checked=sample as unknown as GenericConeFlattenResult['sample'];
  for(let i=0;i<n;i++){
    const u=Math.PI*i/query.curveSegments;
    const base=genericConePoints(u,0,query.angleDeg);
    if(!near(checked.parameterValues[i],u)||
      !vector(checked.flatBaseCurve[i],base.flat)||
      !vector(checked.foldedBaseCurve[i],base.space)||
      !Array.isArray(checked.flatSamples[i])||checked.flatSamples[i].length!==m||
      !Array.isArray(checked.foldedSamples[i])||checked.foldedSamples[i].length!==m)
      throw Error('服务器返回的共同曲线参数或基线异常。');
    for(let j=0;j<m;j++){
      const v=-1+(query.rulingEnd+1)*j/query.rulingSegments;
      const expected=genericConePoints(u,v,query.angleDeg);
      if(!near(checked.rulingValues[j],v)||
        !vector(checked.flatSamples[i][j],expected.flat)||
        !vector(checked.foldedSamples[i][j],expected.space))
        throw Error('服务器返回的二维／三维对应点不满足保存方程。');
    }
  }
  return raw as GenericConeFlattenResult;
}

export async function fetchGenericConeFlatten(input:unknown,signal?:AbortSignal){
  const query=validateGenericConeFlattenQuery(input);
  return parseGenericConeFlattenResult(
    await api('tessellation/curved-generic-cone-flatten',query,signal),query);
}

/** Opening during the workspace's initial calculation can temporarily return 429. */
export async function fetchGenericConeFlattenWhenIdle(input:unknown,signal?:AbortSignal){
  const query=validateGenericConeFlattenQuery(input);
  for(let attempt=0;;attempt++){
    try{return await fetchGenericConeFlatten(query,signal);}
    catch(cause){
      if(signal?.aborted||attempt>=7||
        !(cause instanceof Error)||!cause.message.includes('已有镶嵌计算正在进行'))
        throw cause;
      await new Promise<void>((resolve,reject)=>{
        if(signal?.aborted){reject(signal.reason??new DOMException('查询已取消。','AbortError'));return;}
        const abort=()=>{clearTimeout(timer);reject(signal?.reason??
          new DOMException('查询已取消。','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},
          Math.min(1200,350+attempt*170));
        signal?.addEventListener('abort',abort,{once:true});
      });
    }
  }
}

export function projectGenericConePoint(point:Point3,azimuthDeg:number):Point2{
  const az=azimuthDeg*Math.PI/180,elevation=25*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
}
