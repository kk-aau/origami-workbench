/** Origamica 15.0 section 45, In[4046]–In[4057].
 * Exact evaluation of the two saved smooth ruled-surface examples. A sampled
 * preview is not an exact straight-crease FOLD graph or a collision proof.
 */

export type SurfacePoint2=[number,number];
export type SurfacePoint3=[number,number,number];
export type SurfaceSide='first'|'second';
export type SurfaceConversionKind='cylinder-to-cone'|'cone-to-cylinder';

export type SurfaceConversionParams={
  kind:SurfaceConversionKind;
  parameterStart:number;
  parameterEnd:number;
  curveSegments:number;
  coneAngleDeg:number;
  cylinderAxisOffset:number;
};

export type SurfaceConversionFrame={
  u:number;
  b1:SurfacePoint2;d1:SurfacePoint2;bb1:SurfacePoint3;dd1:SurfacePoint3;
  b2:SurfacePoint2;d2:SurfacePoint2;bb2:SurfacePoint3;dd2:SurfacePoint3;
  f:SurfacePoint2;ff:SurfacePoint3;
  sourceRulingParameter:number;
};

export type SurfaceConversionSample={
  params:SurfaceConversionParams;
  frames:SurfaceConversionFrame[];
  rulingFrameIndices:number[];
  singularBoundary:readonly [SurfaceSide,0|1];
  sourceFunctions:readonly [string,string];
  continuousIsometryAnalytic:true;
  exactStraightCreaseFOLD:false;
  selfCollisionChecked:false;
  deploymentPathChecked:false;
};

export const CYLINDER_TO_CONE_EXAMPLE:SurfaceConversionParams={
  kind:'cylinder-to-cone',parameterStart:-Math.PI/3,parameterEnd:Math.PI,
  curveSegments:96,coneAngleDeg:30,cylinderAxisOffset:.25,
};
export const CONE_TO_CYLINDER_EXAMPLE:SurfaceConversionParams={
  kind:'cone-to-cylinder',parameterStart:0,parameterEnd:Math.PI,
  curveSegments:96,coneAngleDeg:30,cylinderAxisOffset:.25,
};

const finite=(value:unknown,name:string):number=>{
  if(typeof value!=='number'||!Number.isFinite(value))throw Error(`${name}须为有限数值。`);
  return value;
};
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const sub2=(a:SurfacePoint2,b:SurfacePoint2):SurfacePoint2=>[a[0]-b[0],a[1]-b[1]];
const sub3=(a:SurfacePoint3,b:SurfacePoint3):SurfacePoint3=>
  [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add2=(a:SurfacePoint2,d:SurfacePoint2,v:number):SurfacePoint2=>
  [a[0]+v*d[0],a[1]+v*d[1]];
const add3=(a:SurfacePoint3,d:SurfacePoint3,v:number):SurfacePoint3=>
  [a[0]+v*d[0],a[1]+v*d[1],a[2]+v*d[2]];
const unit2=(point:SurfacePoint2):SurfacePoint2=>{
  const length=Math.hypot(...point);
  if(!(length>1e-12&&Number.isFinite(length)))throw Error('圆锥母线到达奇异点。');
  return [point[0]/length,point[1]/length];
};
const unit3=(point:SurfacePoint3):SurfacePoint3=>{
  const length=Math.hypot(...point);
  if(!(length>1e-12&&Number.isFinite(length)))throw Error('圆锥母线到达奇异点。');
  return [point[0]/length,point[1]/length,point[2]/length];
};

/** Deliberately narrow regular domains proven for the source examples. */
export function validateSurfaceConversionParams(input:unknown):SurfaceConversionParams{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('曲面转换参数无效。');
  const data=input as Record<string,unknown>;
  const allowed=new Set(['kind','parameterStart','parameterEnd','curveSegments',
    'coneAngleDeg','cylinderAxisOffset']);
  if(Object.keys(data).some(key=>!allowed.has(key))||
    (data.kind!=='cylinder-to-cone'&&data.kind!=='cone-to-cylinder'))
    throw Error('曲面转换包含不支持的构造或参数。');
  const kind=data.kind;
  const sample=kind==='cylinder-to-cone'?CYLINDER_TO_CONE_EXAMPLE:CONE_TO_CYLINDER_EXAMPLE;
  const parameterStart=finite(data.parameterStart??sample.parameterStart,'起点 u₀');
  const parameterEnd=finite(data.parameterEnd??sample.parameterEnd,'终点 u₁');
  const curveSegments=finite(data.curveSegments??96,'曲线采样段数');
  const coneAngleDeg=finite(data.coneAngleDeg??30,'锥面半角 φ');
  const cylinderAxisOffset=finite(data.cylinderAxisOffset??.25,'柱轴偏移 ε');
  if(!Number.isInteger(curveSegments)||curveSegments<16||curveSegments>512)
    throw Error('曲线采样段数须为 16–512 的整数。');
  if(kind==='cylinder-to-cone'){
    if(!(parameterStart>=-Math.PI/3&&parameterStart<parameterEnd&&
         parameterEnd<=Math.PI))
      throw Error('柱到锥的参数区间须在 −π/3 至 π 内。');
    if(coneAngleDeg!==30||cylinderAxisOffset!==.25)
      throw Error('柱到锥保存示例不使用锥角或轴偏移参数。');
  }else{
    if(!(parameterStart>=0&&parameterStart<parameterEnd&&parameterEnd<=Math.PI))
      throw Error('锥到柱的参数区间须在 0 至 π 内。');
    if(coneAngleDeg<5||coneAngleDeg>30)
      throw Error('已验证锥面半角须在 5°–30° 内。');
    if(cylinderAxisOffset<=0||cylinderAxisOffset>2)
      throw Error('柱轴偏移须大于 0 且不超过 2。');
  }
  return {kind,parameterStart,parameterEnd,curveSegments,coneAngleDeg,
    cylinderAxisOffset};
}

/** The original six-function contract plus the prescribed first surface. */
export function surfaceConversionFrame(params:SurfaceConversionParams,u:number):SurfaceConversionFrame{
  const p=validateSurfaceConversionParams(params);
  finite(u,'u');
  if(u<p.parameterStart||u>p.parameterEnd)throw Error('u 超出已验证参数区间。');
  if(p.kind==='cylinder-to-cone'){
    const b1:SurfacePoint2=[-1,u],d1:SurfacePoint2=[1,0];
    const bb1:SurfacePoint3=[Math.cos(u),Math.sin(u),-1],dd1:SurfacePoint3=[0,0,1];
    const b2:SurfacePoint2=[2,0],bb2:SurfacePoint3=[2,0,1];
    const a=sub2(b2,b1),aa=sub3(bb2,bb1);
    const v=(dot(a,a)-dot(aa,aa))/(2*(dot(a,d1)-dot(aa,dd1)));
    const f=add2(b1,d1,v),ff=add3(bb1,dd1,v);
    return {u,b1,d1,bb1,dd1,b2,d2:unit2(sub2(b2,f)),
      bb2,dd2:unit3(sub3(bb2,ff)),f,ff,sourceRulingParameter:v};
  }
  const phi=p.coneAngleDeg*Math.PI/180,epsilon=p.cylinderAxisOffset;
  const c=Math.cos(phi),q=Math.sin(phi);
  const b1:SurfacePoint2=[0,0],bb1:SurfacePoint3=[0,0,0];
  const d1:SurfacePoint2=[Math.cos(q*u),Math.sin(q*u)];
  const dd1:SurfacePoint3=[c,-q*Math.cos(u),q*Math.sin(u)];
  const axis2:SurfacePoint2=[1+epsilon,0],d2:SurfacePoint2=[-1,0];
  const axis3:SurfacePoint3=[(1-epsilon)*c,-(1+epsilon)*q,0];
  const dd2:SurfacePoint3=[c,q,0];
  const numerator=dot(sub2(axis2,b1),d2)-dot(sub3(axis3,bb1),dd2);
  const denominator=dot(d1,d2)-dot(dd1,dd2);
  const v=numerator/denominator;
  const f=add2(b1,d1,v),ff=add3(bb1,dd1,v);
  const projection2=dot(sub2(f,axis2),d2);
  const projection3=dot(sub3(ff,axis3),dd2);
  const b2=add2(f,d2,-projection2),bb2=add3(ff,dd2,-projection3);
  return {u,b1,d1,bb1,dd1,b2,d2,bb2,dd2,f,ff,sourceRulingParameter:v};
}

export function surfaceConversionPoint(frame:SurfaceConversionFrame,side:SurfaceSide,
  t:number,folded:false):SurfacePoint2;
export function surfaceConversionPoint(frame:SurfaceConversionFrame,side:SurfaceSide,
  t:number,folded:true):SurfacePoint3;
export function surfaceConversionPoint(frame:SurfaceConversionFrame,side:SurfaceSide,
  t:number,folded:boolean):SurfacePoint2|SurfacePoint3;
export function surfaceConversionPoint(frame:SurfaceConversionFrame,side:SurfaceSide,
  t:number,folded:boolean):SurfacePoint2|SurfacePoint3{
  finite(t,'t');
  if(t<0||t>1)throw Error('面片参数 t 须在 0 至 1 内。');
  if(side!=='first'&&side!=='second')throw Error('面片侧别无效。');
  if(folded){
    const a=side==='first'?frame.bb1:frame.ff;
    const b=side==='first'?frame.ff:frame.bb2;
    return add3(a,sub3(b,a),t);
  }
  const a=side==='first'?frame.b1:frame.f;
  const b=side==='first'?frame.f:frame.b2;
  return add2(a,sub2(b,a),t);
}

export function sampleSurfaceConversion(input:unknown):SurfaceConversionSample{
  const params=validateSurfaceConversionParams(input);
  const frames=Array.from({length:params.curveSegments+1},(_,i)=>
    surfaceConversionFrame(params,params.parameterStart+
      (params.parameterEnd-params.parameterStart)*i/params.curveSegments));
  const stride=Math.max(1,Math.round(params.curveSegments/12));
  const rulingFrameIndices=frames.map((_,i)=>i).filter(i=>i===params.curveSegments||i%stride===0);
  return {params,frames,rulingFrameIndices,
    singularBoundary:params.kind==='cylinder-to-cone'?['second',1]:['first',0],
    sourceFunctions:params.kind==='cylinder-to-cone'
      ?['FoldSurfaceToCone','NFoldSurfaceToCone']
      :['FoldSurfaceToCylinder','NFoldSurfaceToCylinder'],
    continuousIsometryAnalytic:true,exactStraightCreaseFOLD:false,
    selfCollisionChecked:false,deploymentPathChecked:false};
}
