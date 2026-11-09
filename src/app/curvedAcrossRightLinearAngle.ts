/** In[3984]/In[3987]: planar circle and linearly increasing fold angle.
 * Closed-form evaluation of FoldAcrossRight2D on the saved family.  The
 * numeric notebook example interpolates at 64 points; our samples evaluate
 * this analytic curve and do not reproduce Wolfram interpolation output.
 */

export type Point2=[number,number];
export type LinearAcrossParams={
  angleSlope:number;
  parameterStart:number;
  parameterEnd:number;
  leftWidth:number;
  rightWidth:number;
  curveSegments:number;
};
export type LinearAcrossFrame={
  u:number;
  crease:Point2;
  leftRuling:Point2;
  rightRuling:Point2;
  foldAngleRad:number;
  rightTangentCoefficient:number;
  rightLeftNormalCoefficient:number;
};
export type LinearAcrossSample={
  params:LinearAcrossParams;
  frames:LinearAcrossFrame[];
  leftBoundary:Point2[];
  rightBoundary:Point2[];
  sourceCells:readonly ['In[3984]','In[3987]'];
  originalNumericInterpolationPoints:64;
  exactStraightCreaseFOLD:false;
  pairedThreeDimensionalSurface:false;
};

export const LINEAR_ACROSS_SAVED:LinearAcrossParams={
  angleSlope:.5,parameterStart:.001,parameterEnd:Math.PI/2,
  leftWidth:.75,rightWidth:1,curveSegments:96,
};

function finite(value:unknown,name:string):number{
  if(typeof value!=='number'||!Number.isFinite(value))throw Error(`${name} 须为有限数字。`);
  return value;
}

export function validateLinearAcrossParams(value:unknown):LinearAcrossParams{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('二维曲折参数无效。');
  const data=value as Record<string,unknown>;
  const keys=['angleSlope','parameterStart','parameterEnd','leftWidth',
    'rightWidth','curveSegments'];
  if(Object.keys(data).some(key=>!keys.includes(key)))throw Error('包含不支持的二维曲折参数。');
  const angleSlope=finite(data.angleSlope,'折角斜率');
  const parameterStart=finite(data.parameterStart,'起点');
  const parameterEnd=finite(data.parameterEnd,'终点');
  const leftWidth=finite(data.leftWidth,'左宽');
  const rightWidth=finite(data.rightWidth,'右宽');
  const curveSegments=finite(data.curveSegments,'采样段数');
  if(angleSlope<.1||angleSlope>1)throw Error('折角斜率须在 0.1–1 之间。');
  if(parameterStart<.001||parameterStart>=parameterEnd||parameterEnd>Math.PI/2)
    throw Error('参数区间须在 [0.001, π/2] 内且起点小于终点。');
  if(leftWidth<=0||leftWidth>=1)throw Error('左宽须严格小于焦线距离 1。');
  if(rightWidth<=0||rightWidth>2)throw Error('右宽须在 (0, 2] 内。');
  if(!Number.isInteger(curveSegments)||curveSegments<16||curveSegments>256)
    throw Error('采样段数须为 16–256 的整数。');
  return {angleSlope,parameterStart,parameterEnd,leftWidth,rightWidth,curveSegments};
}

export function linearAcrossFrame(params:LinearAcrossParams,u:number):LinearAcrossFrame{
  const p=validateLinearAcrossParams(params);
  finite(u,'u');
  if(u<p.parameterStart||u>p.parameterEnd)throw Error('u 超出认证区间。');
  const tangent:Point2=[-Math.sin(u),Math.cos(u)];
  const left:Point2=[-Math.cos(u),-Math.sin(u)];
  const t=Math.tan(p.angleSlope*u/2);
  const d=Math.hypot(p.angleSlope,t);
  const alpha=-p.angleSlope/d,beta=-t/d;
  return {u,crease:[Math.cos(u),Math.sin(u)],leftRuling:left,
    rightRuling:[alpha*tangent[0]+beta*left[0],
      alpha*tangent[1]+beta*left[1]],
    foldAngleRad:p.angleSlope*u,rightTangentCoefficient:alpha,
    rightLeftNormalCoefficient:beta};
}

export function linearAcrossSignedJacobian(
  params:LinearAcrossParams,side:'left'|'right',u:number,v:number):number{
  const p=validateLinearAcrossParams(params);
  finite(u,'u');finite(v,'母线距离');
  if(u<p.parameterStart||u>p.parameterEnd||v<0||
      v>(side==='left'?p.leftWidth:p.rightWidth))throw Error('超出认证曲面范围。');
  if(side==='left')return 1-v;
  const t=Math.tan(p.angleSlope*u/2),d=Math.hypot(p.angleSlope,t);
  const deltaPrime=p.angleSlope**2*(1+t*t)/(2*d*d);
  return -t/d-v*(1+deltaPrime);
}

export function sampleLinearAcross(input:unknown):LinearAcrossSample{
  const params=validateLinearAcrossParams(input);
  const {parameterStart:u0,parameterEnd:u1,curveSegments:n}=params;
  const frames=Array.from({length:n+1},(_,i)=>linearAcrossFrame(params,
    i===n?u1:u0+(u1-u0)*i/n));
  const offset=(frame:LinearAcrossFrame,side:'left'|'right'):Point2=>{
    const ruling=side==='left'?frame.leftRuling:frame.rightRuling;
    const width=side==='left'?params.leftWidth:params.rightWidth;
    return [frame.crease[0]+width*ruling[0],
      frame.crease[1]+width*ruling[1]];
  };
  return {params,frames,leftBoundary:frames.map(f=>offset(f,'left')),
    rightBoundary:frames.map(f=>offset(f,'right')),
    sourceCells:['In[3984]','In[3987]'],originalNumericInterpolationPoints:64,
    exactStraightCreaseFOLD:false,pairedThreeDimensionalSurface:false};
}
