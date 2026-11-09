import {api} from './api';

export type CurvedSavedPairFamily='cone-across-right'|'planar-circle-to-curved-fold-3d';
export type Point2=[number,number];
export type Point3=[number,number,number];
export type CurvedSavedPairQuery={
  family:CurvedSavedPairFamily;curveSegments:number;rulingSegments:number;
  leftWidth:number;rightWidth:number;
  thetaDeg?:number;parameterStartPi?:number;parameterEndPi?:number;
  orientation?:-1|1;
};
export type CurvedSavedPairResult={
  family:'origamica-curved-saved-pair';query:CurvedSavedPairQuery;
  source:{symbolicCell:string;numericalCell:string;symbolicFunction:string;numericalFunction:string};
  foldAngleDeg:number;
  certification:{continuousIsometryAnalytic:true;bothSidesDevelopableAnalytic:true;
    rulingWidthBeforeFocalSet:true;sampledChordsExactIsometry:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;
    deploymentPathChecked:false;selfCollisionChecked:false};
  sample:{parameterValues:number[];rulingDistances:{left:number[];right:number[]};
    flatSamples:Point2[];foldedSamples:Point3[];creaseIndices:number[];
    sideRows:{left:number[][];right:number[][]}};
};

export const CURVED_SAVED_PAIR_PRESETS:Record<CurvedSavedPairFamily,CurvedSavedPairQuery>={
  'cone-across-right':{family:'cone-across-right',thetaDeg:30,
    parameterStartPi:-.5,parameterEndPi:.5,leftWidth:.75,rightWidth:.75,
    curveSegments:64,rulingSegments:4},
  'planar-circle-to-curved-fold-3d':{family:'planar-circle-to-curved-fold-3d',
    orientation:1,leftWidth:1,rightWidth:1,curveSegments:64,rulingSegments:4},
};

const object=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const vector=(value:unknown,size:number):boolean=>Array.isArray(value)&&value.length===size&&
  value.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e4);
function finite(value:unknown,name:string,low:number,high:number):number{
  if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)
    throw Error(`${name}须为 ${low} 至 ${high} 的有限数值。`);
  return value;
}
function integer(value:unknown,name:string,low:number,high:number):number{
  const number=finite(value,name,low,high);
  if(!Number.isInteger(number))throw Error(`${name}须为整数。`);
  return number;
}

export function validateCurvedSavedPairQuery(value:unknown):CurvedSavedPairQuery{
  if(!object(value))throw Error('曲折保存例请求须为 JSON 对象。');
  const family=value.family;
  if(family!=='cone-across-right'&&family!=='planar-circle-to-curved-fold-3d')
    throw Error('请选择圆锥或平面圆弧保存例。');
  const allowed=new Set(['family','leftWidth','rightWidth','curveSegments','rulingSegments',
    ...(family==='cone-across-right'?['thetaDeg','parameterStartPi','parameterEndPi']:['orientation'])]);
  if(Object.keys(value).some(key=>!allowed.has(key)))throw Error('请求包含不支持的字段。');
  const defaults=CURVED_SAVED_PAIR_PRESETS[family];
  const get=(key:keyof CurvedSavedPairQuery)=>Object.hasOwn(value,key)?value[key]:defaults[key];
  const curveSegments=integer(get('curveSegments'),'曲线采样段数',16,256);
  const rulingSegments=integer(get('rulingSegments'),'母线采样段数',1,8);
  if((curveSegments+1)*(2*rulingSegments+1)>4000)throw Error('采样点不能超过 4000 个。');
  const query:CurvedSavedPairQuery={family,curveSegments,rulingSegments,leftWidth:0,rightWidth:0};
  if(family==='cone-across-right'){
    query.thetaDeg=finite(get('thetaDeg'),'圆锥半角',5,85);
    query.parameterStartPi=finite(get('parameterStartPi'),'起点 u/π',-2,2);
    query.parameterEndPi=finite(get('parameterEndPi'),'终点 u/π',-2,2);
    if(!(query.parameterEndPi-query.parameterStartPi>1e-6&&
      query.parameterEndPi-query.parameterStartPi<=1))throw Error('圆锥参数区间须大于 0 且不超过 π。');
    query.leftWidth=finite(get('leftWidth'),'左侧母线宽度',.05,.95);
    query.rightWidth=finite(get('rightWidth'),'右侧母线宽度',.05,4);
  }else{
    const orientation=integer(get('orientation'),'折角符号',-1,1);
    if(orientation!==-1&&orientation!==1)throw Error('折角符号只能是 +1 或 −1。');
    query.orientation=orientation;
    query.leftWidth=finite(get('leftWidth'),'左侧母线宽度',.05,1.8);
    query.rightWidth=finite(get('rightWidth'),'右侧母线宽度',.05,1.8);
  }
  return query;
}

function expectedSource(query:CurvedSavedPairQuery):CurvedSavedPairResult['source']{
  return query.family==='cone-across-right'?
    {symbolicCell:'In[3999]',numericalCell:'In[4002]',symbolicFunction:'FoldAcrossRightBoth',numericalFunction:'NFoldAcrossRightBoth'}:
    {symbolicCell:query.orientation===1?'In[3973]':'In[3974]',
      numericalCell:query.orientation===1?'In[3978]':'In[3979]',
      symbolicFunction:'FoldCurvedFold3D',numericalFunction:'NFoldCurvedFold3D'};
}
function sameNumbers(a:number,b:number){return Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));}

/** Fail closed on mismatched source, geometry indices, or an exact-FOLD claim. */
export function parseCurvedSavedPairResult(raw:unknown,requested?:CurvedSavedPairQuery):CurvedSavedPairResult{
  if(!object(raw)||raw.family!=='origamica-curved-saved-pair'||!object(raw.query)||
    !object(raw.source)||!object(raw.certification)||!object(raw.sample)||
    Object.keys(raw).some(key=>!['family','query','source','foldAngleDeg','certification','sample'].includes(key)))
    throw Error('服务器返回的曲折保存例格式异常。');
  const rawQuery=raw.query,rawSource=raw.source;
  const query=validateCurvedSavedPairQuery(rawQuery);
  if(Object.keys(rawQuery).length!==Object.keys(query).length||
    Object.entries(query).some(([key,entry])=>rawQuery[key]!==entry)||
    requested&&Object.entries(requested).some(([key,entry])=>query[key as keyof CurvedSavedPairQuery]!==entry))
    throw Error('服务器返回的曲折参数与请求不一致。');
  const source=expectedSource(query);
  if(Object.keys(rawSource).length!==4||
    Object.entries(source).some(([key,entry])=>rawSource[key]!==entry))
    throw Error('服务器返回的原版保存例来源不一致。');
  const angle=query.family==='cone-across-right'?180-2*query.thetaDeg!:120*query.orientation!;
  if(typeof raw.foldAngleDeg!=='number'||!sameNumbers(raw.foldAngleDeg,angle))
    throw Error('服务器返回的折角与输入不一致。');
  const cert=raw.certification;
  if(Object.keys(cert).length!==8||Object.keys(cert).some(key=>![
    'continuousIsometryAnalytic','bothSidesDevelopableAnalytic','rulingWidthBeforeFocalSet',
    'sampledChordsExactIsometry','exactStraightCreaseFOLD','adoptableCreasePattern',
    'deploymentPathChecked','selfCollisionChecked'].includes(key)))
    throw Error('服务器返回的连续曲面认证格式异常。');
  for(const key of ['continuousIsometryAnalytic','bothSidesDevelopableAnalytic','rulingWidthBeforeFocalSet'])
    if(cert[key]!==true)throw Error('服务器返回的连续曲面认证不完整。');
  for(const key of ['sampledChordsExactIsometry','exactStraightCreaseFOLD',
    'adoptableCreasePattern','deploymentPathChecked','selfCollisionChecked'])
    if(cert[key]!==false)throw Error('采样曲面不可作为精确 FOLD 或可采用折痕。');
  const sample=raw.sample,n=query.curveSegments+1,m=query.rulingSegments+1;
  if(Object.keys(sample).length!==6||Object.keys(sample).some(key=>![
    'parameterValues','rulingDistances','flatSamples','foldedSamples','creaseIndices',
    'sideRows'].includes(key)))throw Error('服务器返回的曲面采样格式异常。');
  if(!Array.isArray(sample.parameterValues)||sample.parameterValues.length!==n||
    !Array.isArray(sample.flatSamples)||!Array.isArray(sample.foldedSamples)||
    sample.flatSamples.length!==n*(2*m-1)||sample.foldedSamples.length!==sample.flatSamples.length||
    !Array.isArray(sample.creaseIndices)||sample.creaseIndices.length!==n||
    !object(sample.sideRows)||!object(sample.rulingDistances)||
    Object.keys(sample.sideRows).length!==2||Object.keys(sample.rulingDistances).length!==2)
    throw Error('服务器返回的配对曲面采样数量异常。');
  const start=query.family==='cone-across-right'?query.parameterStartPi!*Math.PI:0;
  const end=query.family==='cone-across-right'?query.parameterEndPi!*Math.PI:Math.PI;
  for(let i=0;i<n;i++){
    const u=sample.parameterValues[i];
    if(typeof u!=='number'||!sameNumbers(u,start+(end-start)*i/(n-1))||
      sample.creaseIndices[i]!==i)throw Error('服务器返回的折痕参数网格异常。');
  }
  for(let i=0;i<sample.flatSamples.length;i++)
    if(!vector(sample.flatSamples[i],2)||!vector(sample.foldedSamples[i],3))
      throw Error('服务器返回的曲面坐标异常。');
  for(const side of ['left','right'] as const){
    const rows=sample.sideRows[side],distances=sample.rulingDistances[side];
    if(!Array.isArray(rows)||rows.length!==m||!Array.isArray(distances)||distances.length!==m)
      throw Error('服务器返回的两侧母线网格异常。');
    const width=query[side==='left'?'leftWidth':'rightWidth'];
    for(let j=0;j<m;j++){
      if(!Array.isArray(rows[j])||rows[j].length!==n||
        !sameNumbers(distances[j],width*j/(m-1)))
        throw Error('服务器返回的母线距离异常。');
      for(let i=0;i<n;i++){
        const expected=j===0?i:n*(1+(side==='left'?j-1:(m-1)+j-1))+i;
        if(rows[j][i]!==expected)throw Error('服务器返回的配对采样索引异常。');
      }
    }
  }
  return raw as CurvedSavedPairResult;
}

export async function fetchCurvedSavedPair(input:unknown,signal?:AbortSignal):Promise<CurvedSavedPairResult>{
  const query=validateCurvedSavedPairQuery(input);
  return parseCurvedSavedPairResult(await api('tessellation/curved-saved-pair',query,signal),query);
}

export function projectSavedPairPoint(point:Point3,azimuthDeg:number):Point2{
  const az=azimuthDeg*Math.PI/180,elevation=28*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
}

export function savedPairCurves(result:CurvedSavedPairResult,folded:boolean,azimuthDeg=0){
  const points=result.sample[folded?'foldedSamples':'flatSamples'];
  const map=(indices:number[])=>indices.map(index=>folded?
    projectSavedPairPoint(points[index] as Point3,azimuthDeg):points[index] as Point2);
  return {crease:map(result.sample.creaseIndices),
    left:map(result.sample.sideRows.left.at(-1)!),
    right:map(result.sample.sideRows.right.at(-1)!)};
}
