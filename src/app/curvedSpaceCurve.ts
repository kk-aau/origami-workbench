import {api} from './api';

/** Closed, JSON-only query accepted by the section 45 read-only endpoint. */
export type CurvedSpaceCurveFamily='planar-circle'|'circular-helix'|'planar-ellipse';
export type Point2=[number,number];
export type Point3=[number,number,number];
export type CurvedSpaceCurveQuery={
  family:CurvedSpaceCurveFamily;
  parameterStartPi:number;parameterEndPi:number;
  foldAngleStartDeg:number;foldAngleEndDeg:number;
  orientation:-1|1;rulingWidth:number;
  curveSegments:number;rulingSegments:number;
  radius?:number;pitchPerRadian?:number;axisX?:number;axisY?:number;
};
export type CurvedSpaceCurveFrame={
  u:number;flatCrease:Point2;foldedCrease:Point3;
  flatLeftRuling:Point2;flatRightRuling:Point2;
  foldedLeftRuling:Point3;foldedRightRuling:Point3;
  foldAngleRad:number;
};
export type CurvedSpaceCurveResult={
  family:'certified-space-curve-fold';query:CurvedSpaceCurveQuery;
  sourceFunctions:string[];
  certification:{curveRegularOnClosedInterval:true;frenetCurvatureNonzeroOnClosedInterval:true;
    foldAngleInOpenRangeOnClosedInterval:true;
    bothSidesDevelopableAnalytic:true;pairedContinuousIsometryAnalytic:true;
    rulingWidthBeforeFocalSetCertified:true;sampledMeshExactIsometry:false;
    exactStraightCreaseFOLD:false;deploymentPathChecked:false;selfCollisionChecked:false};
  sample:{frames:CurvedSpaceCurveFrame[];continuousDevelopabilityCertified:true;
    continuousIsometryCertified:true;sampledMeshExactIsometry:false;
    deploymentPathChecked:false;selfCollisionChecked:false};
};

export const CURVED_SPACE_CURVE_PRESETS:Record<CurvedSpaceCurveFamily,CurvedSpaceCurveQuery>={
  'planar-circle':{family:'planar-circle',parameterStartPi:0,parameterEndPi:1,
    foldAngleStartDeg:120,foldAngleEndDeg:120,orientation:1,rulingWidth:1,
    curveSegments:96,rulingSegments:4,radius:1},
  'circular-helix':{family:'circular-helix',parameterStartPi:0,parameterEndPi:1,
    foldAngleStartDeg:90,foldAngleEndDeg:90,orientation:1,rulingWidth:1,
    curveSegments:96,rulingSegments:4,radius:1,pitchPerRadian:.5},
  'planar-ellipse':{family:'planar-ellipse',parameterStartPi:0,parameterEndPi:1,
    foldAngleStartDeg:120,foldAngleEndDeg:120,orientation:1,rulingWidth:.5,
    curveSegments:96,rulingSegments:4,axisX:2,axisY:1},
};

const common=new Set(['family','parameterStartPi','parameterEndPi','foldAngleStartDeg',
  'foldAngleEndDeg','orientation','rulingWidth','curveSegments','rulingSegments']);
const familyFields:Record<CurvedSpaceCurveFamily,Set<string>>={
  'planar-circle':new Set(['radius']),
  'circular-helix':new Set(['radius','pitchPerRadian']),
  'planar-ellipse':new Set(['axisX','axisY']),
};
const names:Record<string,string>={parameterStartPi:'起点 u₀/π',parameterEndPi:'终点 u₁/π',
  foldAngleStartDeg:'起始折角',foldAngleEndDeg:'终止折角',orientation:'朝向',
  rulingWidth:'母线宽度',curveSegments:'曲线采样段数',rulingSegments:'母线采样段数',
  radius:'半径',pitchPerRadian:'每弧度螺距',axisX:'长轴参数 a',axisY:'短轴参数 b'};

function finite(value:unknown,key:string,low:number,high:number,strictLow=false,strictHigh=false):number{
  if(typeof value!=='number'||!Number.isFinite(value))throw Error(`${names[key]}须为有限数值。`);
  if((strictLow?value<=low:value<low)||(strictHigh?value>=high:value>high))
    throw Error(`${names[key]}须在${strictLow?'(':'['}${low}, ${high}${strictHigh?')':']'}内。`);
  return value;
}
function integer(value:unknown,key:string,low:number,high:number):number{
  const n=finite(value,key,low,high);
  if(!Number.isInteger(n))throw Error(`${names[key]}须为整数。`);
  return n;
}

/** Mirrors only the safe JSON/range contract; geometry is certified by Python. */
export function validateCurvedSpaceCurveQuery(value:unknown):CurvedSpaceCurveQuery{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('曲线折痕请求须为 JSON 对象。');
  const data=value as Record<string,unknown>,family=data.family;
  if(family!=='planar-circle'&&family!=='circular-helix'&&family!=='planar-ellipse')
    throw Error('请选择圆、螺旋或椭圆曲线族。');
  if(Object.keys(data).some(key=>!common.has(key)&&!familyFields[family].has(key)))
    throw Error('请求包含不支持的字段。');
  const defaults=CURVED_SPACE_CURVE_PRESETS[family];
  const get=(key:keyof CurvedSpaceCurveQuery)=>data[key]??defaults[key];
  const parameterStartPi=finite(get('parameterStartPi'),'parameterStartPi',-2,2);
  const parameterEndPi=finite(get('parameterEndPi'),'parameterEndPi',-2,2);
  if(!(parameterEndPi-parameterStartPi>1e-6&&parameterEndPi-parameterStartPi<=2))
    throw Error('参数区间须大于 0 且不超过 2π。');
  const foldAngleStartDeg=finite(get('foldAngleStartDeg'),'foldAngleStartDeg',0,180,true,true);
  const foldAngleEndDeg=finite(data.foldAngleEndDeg??foldAngleStartDeg,'foldAngleEndDeg',0,180,true,true);
  if(family!=='planar-circle'&&foldAngleEndDeg!==foldAngleStartDeg)
    throw Error('螺旋与椭圆仅支持恒定折角。');
  const orientation=integer(get('orientation'),'orientation',-1,1);
  if(orientation!==-1&&orientation!==1)throw Error('朝向须为 +1 或 −1。');
  const rulingWidth=finite(get('rulingWidth'),'rulingWidth',0,4,true);
  const curveSegments=integer(get('curveSegments'),'curveSegments',8,512);
  const rulingSegments=integer(get('rulingSegments'),'rulingSegments',1,16);
  if((curveSegments+1)*(2*rulingSegments+1)>16000)throw Error('采样顶点数不能超过 16000。');
  const query:CurvedSpaceCurveQuery={family,parameterStartPi,parameterEndPi,
    foldAngleStartDeg,foldAngleEndDeg,orientation,rulingWidth,curveSegments,rulingSegments};
  if(family==='planar-circle'||family==='circular-helix')
    query.radius=finite(get('radius'),'radius',.25,4);
  if(family==='circular-helix')
    query.pitchPerRadian=finite(get('pitchPerRadian'),'pitchPerRadian',-4,4);
  if(family==='planar-ellipse'){
    query.axisX=finite(get('axisX'),'axisX',.25,4);
    query.axisY=finite(get('axisY'),'axisY',.25,4);
    if(query.axisX===query.axisY)throw Error('椭圆的两轴参数必须不同。');
  }
  return query;
}

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const vector=(v:unknown,n:number):boolean=>Array.isArray(v)&&v.length===n&&
  v.every(x=>typeof x==='number'&&Number.isFinite(x));
function flag(data:Record<string,unknown>,name:string,expected:boolean){
  if(data[name]!==expected)throw Error('服务器返回的曲折认证信息不完整。');
}

/** Fail closed if the response does not actually carry the claimed certificate. */
export function parseCurvedSpaceCurveResult(raw:unknown):CurvedSpaceCurveResult{
  if(!record(raw)||raw.family!=='certified-space-curve-fold'||!record(raw.query)||
    !record(raw.certification)||!record(raw.sample)||!Array.isArray(raw.sourceFunctions))
    throw Error('服务器返回的曲线折痕格式异常。');
  const query=validateCurvedSpaceCurveQuery(raw.query),cert=raw.certification,sample=raw.sample;
  for(const name of ['curveRegularOnClosedInterval','frenetCurvatureNonzeroOnClosedInterval',
    'foldAngleInOpenRangeOnClosedInterval',
    'bothSidesDevelopableAnalytic','pairedContinuousIsometryAnalytic',
    'rulingWidthBeforeFocalSetCertified'])flag(cert,name,true);
  for(const name of ['sampledMeshExactIsometry','exactStraightCreaseFOLD',
    'deploymentPathChecked','selfCollisionChecked'])flag(cert,name,false);
  for(const name of ['continuousDevelopabilityCertified','continuousIsometryCertified'])flag(sample,name,true);
  for(const name of ['sampledMeshExactIsometry','deploymentPathChecked','selfCollisionChecked'])flag(sample,name,false);
  if(!Array.isArray(sample.frames)||sample.frames.length!==query.curveSegments+1)
    throw Error('服务器返回的曲线采样数量异常。');
  for(const frame of sample.frames){
    if(!record(frame)||!vector(frame.flatCrease,2)||!vector(frame.foldedCrease,3)||
      !vector(frame.flatLeftRuling,2)||!vector(frame.flatRightRuling,2)||
      !vector(frame.foldedLeftRuling,3)||!vector(frame.foldedRightRuling,3)||
      typeof frame.u!=='number'||!Number.isFinite(frame.u)||
      typeof frame.foldAngleRad!=='number'||!Number.isFinite(frame.foldAngleRad))
      throw Error('服务器返回的曲线采样坐标异常。');
  }
  return raw as CurvedSpaceCurveResult;
}

export async function fetchCurvedSpaceCurveQuery(input:unknown,signal?:AbortSignal):Promise<CurvedSpaceCurveResult>{
  const query=validateCurvedSpaceCurveQuery(input);
  return parseCurvedSpaceCurveResult(await api('tessellation/curved-space-curve',query,signal));
}

export function projectCurvedSpacePoint(point:Point3,azimuthDeg:number):Point2{
  const az=azimuthDeg*Math.PI/180,elevation=28*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
}

export function curvedSpaceBoundaries(result:CurvedSpaceCurveResult,folded:boolean,azimuthDeg=0){
  const width=result.query.rulingWidth;
  const map=(crease:Point2|Point3,ruling:Point2|Point3):Point2=>{
    const p=crease.map((x,i)=>x+width*ruling[i]) as Point2|Point3;
    return folded?projectCurvedSpacePoint(p as Point3,azimuthDeg):p as Point2;
  };
  return {
    crease:result.sample.frames.map(f=>folded?projectCurvedSpacePoint(f.foldedCrease,azimuthDeg):f.flatCrease),
    left:result.sample.frames.map(f=>folded?map(f.foldedCrease,f.foldedLeftRuling):map(f.flatCrease,f.flatLeftRuling)),
    right:result.sample.frames.map(f=>folded?map(f.foldedCrease,f.foldedRightRuling):map(f.flatCrease,f.flatRightRuling)),
  };
}
