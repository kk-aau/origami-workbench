import {api} from './api';

export type Point2=[number,number];
export type ConstantWidthQuery={family:'constant-width-circle-in3879';width:number;segments:number};
export type ConstantWidthResult={
  family:'origamica-constant-width-circle-band';query:ConstantWidthQuery;
  source:{definitionCell:'In[3878]';savedCell:'In[3879]';
    function:'NConstantWidthScale2D';actualEquationUsesUnextendedCurve:true;
    declaredTangentExtensionUnused:true;machineReadableWolframOut:false};
  domain:{start:0;end:number;director:Point2};
  certification:{perpendicularDistanceAnalytic:true;actualFootCanExceedDomain:true;
    endpointTangentExtrapolationImplemented:false;sampledBandExactFOLD:false;
    adoptableCreasePattern:false;selfIntersectionChecked:false};
  diagnostic:{leftFootLeavesDomainAt:number;leftEndFootParameter:number;
    rightEndFootParameter:number;actualCircleEndpointWidth:number;
    unusedTangentEndpointWidth:number};
  sample:{parameterValues:number[];sourceCurve:Point2[];leftBoundary:Point2[];
    rightBoundary:Point2[];dashedLeftDirector:Point2[];dashedRightDirector:Point2[];
    leftWidthValues:number[];rightWidthValues:number[];
    leftFootParameters:number[];rightFootParameters:number[];
    leftFootPoints:Point2[];rightFootPoints:Point2[]};
};

export const CONSTANT_WIDTH_END=.35*Math.PI;
export const CONSTANT_WIDTH_PRESET:ConstantWidthQuery={
  family:'constant-width-circle-in3879',width:.1,segments:80,
};
const object=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:string[])=>
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const near=(a:unknown,b:number)=>typeof a==='number'&&Number.isFinite(a)&&
  Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
const vector=(value:unknown,expected:number[])=>Array.isArray(value)&&
  value.length===expected.length&&expected.every((number,i)=>near(value[i],number));

export function validateConstantWidthQuery(value:unknown):ConstantWidthQuery{
  if(!object(value)||value.family!=='constant-width-circle-in3879')
    throw Error('请选择 In[3879] 的恒宽圆弧保存例。');
  if(Object.keys(value).some(key=>!['family','width','segments'].includes(key)))
    throw Error('恒宽查询包含不支持的字段。');
  const width=value.width??.1,segments=value.segments??80;
  if(typeof width!=='number'||!Number.isFinite(width)||width<.02||width>.105)
    throw Error('垂直半宽须为 0.02–0.105 的有限数值。');
  if(typeof segments!=='number'||!Number.isInteger(segments)||segments<16||segments>256)
    throw Error('采样段数须为 16–256 的整数。');
  return {family:'constant-width-circle-in3879',width,segments};
}

export function constantWidthAt(s:number,offset:number){
  const radius=1-offset,sin=Math.sin(s);
  const foot=Math.asin(sin/radius);
  const width=Math.cos(s)-Math.sqrt(radius*radius-sin*sin);
  return {width,foot,point:[Math.cos(s)-width,sin] as Point2,
    footPoint:[Math.cos(foot),Math.sin(foot)] as Point2};
}

function tangentEndpointWidth(offset:number){
  const sin=Math.sin(CONSTANT_WIDTH_END),cos=Math.cos(CONSTANT_WIDTH_END);
  return cos-(1-offset-sin*sin)/cos;
}

/** Check every returned point against the saved root equation and source claims. */
export function parseConstantWidthResult(raw:unknown,requested?:ConstantWidthQuery):ConstantWidthResult{
  if(!object(raw)||!exactKeys(raw,['family','query','source','domain','certification',
    'diagnostic','sample'])||raw.family!=='origamica-constant-width-circle-band'||
    !object(raw.query)||!object(raw.source)||!object(raw.domain)||
    !object(raw.certification)||!object(raw.diagnostic)||!object(raw.sample))
    throw Error('服务器返回的恒宽带格式异常。');
  const rawQuery=raw.query,query=validateConstantWidthQuery(rawQuery);
  if(!exactKeys(rawQuery,Object.keys(query))||
    Object.entries(query).some(([key,value])=>rawQuery[key]!==value)||
    requested&&Object.entries(requested).some(([key,value])=>
      query[key as keyof ConstantWidthQuery]!==value))
    throw Error('服务器返回的恒宽参数与请求不一致。');
  const source=raw.source;
  if(!exactKeys(source,['definitionCell','savedCell','function',
    'actualEquationUsesUnextendedCurve','declaredTangentExtensionUnused',
    'machineReadableWolframOut'])||source.definitionCell!=='In[3878]'||
    source.savedCell!=='In[3879]'||source.function!=='NConstantWidthScale2D'||
    source.actualEquationUsesUnextendedCurve!==true||
    source.declaredTangentExtensionUnused!==true||
    source.machineReadableWolframOut!==false)
    throw Error('服务器返回的原版来源声明不一致。');
  const domain=raw.domain;
  if(!exactKeys(domain,['start','end','director'])||domain.start!==0||
    !near(domain.end,CONSTANT_WIDTH_END)||!vector(domain.director,[-1,0]))
    throw Error('服务器返回的原版圆弧定义域或水平母线异常。');
  const cert=raw.certification;
  if(!exactKeys(cert,['perpendicularDistanceAnalytic','actualFootCanExceedDomain',
    'endpointTangentExtrapolationImplemented','sampledBandExactFOLD',
    'adoptableCreasePattern','selfIntersectionChecked'])||
    cert.perpendicularDistanceAnalytic!==true||cert.actualFootCanExceedDomain!==true||
    cert.endpointTangentExtrapolationImplemented!==false||
    cert.sampledBandExactFOLD!==false||cert.adoptableCreasePattern!==false||
    cert.selfIntersectionChecked!==false)
    throw Error('恒宽诊断不能宣称端点切线外推、精确 FOLD 或可采用折痕。');
  const diagnostic=raw.diagnostic;
  const endLeft=constantWidthAt(CONSTANT_WIDTH_END,query.width);
  const endRight=constantWidthAt(CONSTANT_WIDTH_END,-query.width);
  if(!exactKeys(diagnostic,['leftFootLeavesDomainAt','leftEndFootParameter',
    'rightEndFootParameter','actualCircleEndpointWidth','unusedTangentEndpointWidth'])||
    !near(diagnostic.leftFootLeavesDomainAt,
      Math.asin((1-query.width)*Math.sin(CONSTANT_WIDTH_END)))||
    !near(diagnostic.leftEndFootParameter,endLeft.foot)||
    !near(diagnostic.rightEndFootParameter,endRight.foot)||
    !near(diagnostic.actualCircleEndpointWidth,endLeft.width)||
    !near(diagnostic.unusedTangentEndpointWidth,tangentEndpointWidth(query.width)))
    throw Error('服务器返回的端点外推诊断异常。');
  const sample=raw.sample,n=query.segments+1;
  const arrays=['parameterValues','sourceCurve','leftBoundary','rightBoundary',
    'dashedLeftDirector','dashedRightDirector','leftWidthValues',
    'rightWidthValues','leftFootParameters','rightFootParameters',
    'leftFootPoints','rightFootPoints'];
  if(!exactKeys(sample,arrays)||arrays.some(key=>
    !Array.isArray(sample[key])||sample[key].length!==n))
    throw Error('服务器返回的恒宽采样数量异常。');
  const checked=sample as unknown as ConstantWidthResult['sample'];
  for(let i=0;i<n;i++){
    const s=CONSTANT_WIDTH_END*i/query.segments,x=Math.cos(s),y=Math.sin(s);
    const left=constantWidthAt(s,query.width),right=constantWidthAt(s,-query.width);
    if(!near(checked.parameterValues[i],s)||!vector(checked.sourceCurve[i],[x,y])||
      !vector(checked.leftBoundary[i],left.point)||
      !vector(checked.rightBoundary[i],right.point)||
      !vector(checked.dashedLeftDirector[i],[x-query.width,y])||
      !vector(checked.dashedRightDirector[i],[x+query.width,y])||
      !near(checked.leftWidthValues[i],left.width)||
      !near(checked.rightWidthValues[i],right.width)||
      !near(checked.leftFootParameters[i],left.foot)||
      !near(checked.rightFootParameters[i],right.foot)||
      !vector(checked.leftFootPoints[i],left.footPoint)||
      !vector(checked.rightFootPoints[i],right.footPoint))
      throw Error('恒宽采样点不满足 In[3878] 实际方程。');
  }
  return raw as ConstantWidthResult;
}

export async function fetchConstantWidth(input:unknown,signal?:AbortSignal){
  const query=validateConstantWidthQuery(input);
  return parseConstantWidthResult(
    await api('tessellation/curved-constant-width',query,signal),query);
}

/** The workspace may still own the one warm tessellation worker on first open. */
export async function fetchConstantWidthWhenIdle(input:unknown,signal?:AbortSignal){
  const query=validateConstantWidthQuery(input);
  for(let attempt=0;;attempt++){
    try{return await fetchConstantWidth(query,signal);}
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
