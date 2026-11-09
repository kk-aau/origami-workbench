/** Exact smooth isometric motion ending at Origamica In[3992]'s saved 3D fold. */
export type Point2=[number,number];
export type Point3=[number,number,number];
export type MotionParameters={arcEnd:number;leftWidth:number;rightWidth:number};
export const SAVED_TARGET_ANGLE=2*Math.PI/3;
export const DEFAULT_MOTION_PARAMETERS:MotionParameters={
  arcEnd:Math.PI,leftWidth:1,rightWidth:1};

export function validateMotionParameters(parameters:MotionParameters){
  const {arcEnd,leftWidth,rightWidth}=parameters;
  if(!Number.isFinite(arcEnd)||arcEnd<Math.PI/8||arcEnd>Math.PI)
    throw Error('圆弧须在 [π/8,π] 的已证明区间。');
  if(!Number.isFinite(leftWidth)||leftWidth<.1||leftWidth>1.5)
    throw Error('左宽须在 [0.1,1.5]，严格停在内侧焦点前。');
  if(!Number.isFinite(rightWidth)||rightWidth<.1||rightWidth>2)
    throw Error('右宽须在 [0.1,2]。');
  return parameters;
}
function check(progress:number,s:number,w:number,parameters:MotionParameters){
  validateMotionParameters(parameters);
  if(!Number.isFinite(progress)||progress<0||progress>1)
    throw Error('运动参数须在 [0,1]。');
  if(!Number.isFinite(s)||s<0||s>parameters.arcEnd)
    throw Error('弧长参数超出有限纸张。');
  if(!Number.isFinite(w)||w< -parameters.leftWidth||w>parameters.rightWidth)
    throw Error('横向参数超出有限纸张。');
}
export function motionAngle(progress:number){
  if(!Number.isFinite(progress)||progress<0||progress>1)
    throw Error('运动参数须在 [0,1]。');
  return SAVED_TARGET_ANGLE*progress;
}
function halfAngleTrig(progress:number){
  const half=motionAngle(progress)/2;
  // Preserve the source's algebraic saved endpoint rather than accumulating
  // the floating-point cos(π/3) error in the subsequent angular division.
  return progress===1?{c:.5,h:Math.sqrt(3)/2}:
    {c:Math.cos(half),h:Math.sin(half)};
}
/** A conservative enclosing cylinder for the complete motion, not one frame. */
export function motionEnvelope(parameters=DEFAULT_MOTION_PARAMETERS){
  validateMotionParameters(parameters);
  return {radialRadius:2+parameters.rightWidth,
    minimumHeight:0,
    maximumHeight:Math.sqrt(3)/2*
      Math.max(parameters.leftWidth,parameters.rightWidth)};
}
export function paperPoint(s:number,w:number,
  parameters=DEFAULT_MOTION_PARAMETERS):Point2{
  check(0,s,w,parameters);
  const theta=s/2,r=2+w;
  return [r*Math.cos(theta),r*Math.sin(theta)];
}
export function motionPoint(progress:number,s:number,w:number,
  parameters=DEFAULT_MOTION_PARAMETERS):Point3{
  check(progress,s,w,parameters);
  const {c,h}=halfAngleTrig(progress),
    phi=s/(2*c),r=c*(2+w);
  return [r*Math.cos(phi),r*Math.sin(phi),h*Math.abs(w)];
}
/**
 * Recover material coordinates from a complete spatial frame, including the
 * flat frame. This inverse also makes the global injectivity proof explicit:
 * positive projected radius gives w uniquely, and an angular sweep below 2π
 * gives s uniquely. Height is checked rather than divided by sin(γ/2).
 */
export function inverseMotionPoint(progress:number,point:Point3,
  parameters=DEFAULT_MOTION_PARAMETERS):{s:number;w:number}{
  validateMotionParameters(parameters);
  const {c,h}=halfAngleTrig(progress);
  if(point.length!==3||point.some(value=>!Number.isFinite(value)))
    throw Error('空间点须含三个有限坐标。');
  const [x,y,z]=point,r=Math.hypot(x,y),
    tolerance=2e-10*Math.max(1,r,Math.abs(z));
  if(r<=0)throw Error('空间点位于纸张正则域外。');
  let phi=Math.atan2(y,x);
  // atan2's negative-side roundoff at the closed start boundary is not a
  // complete turn of the material paper.
  if(phi<0&&Math.abs(phi)<tolerance)phi=0;
  else if(phi<0)phi+=2*Math.PI;
  const s=2*c*phi,w=r/c-2;
  if(s< -tolerance||s>parameters.arcEnd+tolerance||
    w< -parameters.leftWidth-tolerance||w>parameters.rightWidth+tolerance||
    Math.abs(z-h*Math.abs(w))>tolerance)
    throw Error('空间点不在当前有限纸张曲面上。');
  return {s:Math.max(0,Math.min(parameters.arcEnd,s)),
    w:Math.max(-parameters.leftWidth,Math.min(parameters.rightWidth,w))};
}
/** One-sided derivative at w=0 is selected by side. */
export function motionPartials(progress:number,s:number,w:number,side:-1|1,
  parameters=DEFAULT_MOTION_PARAMETERS){
  check(progress,s,w,parameters);
  if(side!==-1&&side!==1)throw Error('只支持左右两侧。');
  if(w!==0&&Math.sign(w)!==side)throw Error('曲面侧别与横向参数不符。');
  const {c,h}=halfAngleTrig(progress),
    phi=s/(2*c),q=(2+w)/2;
  return {ds:[-q*Math.sin(phi),q*Math.cos(phi),0] as Point3,
    dw:[c*Math.cos(phi),c*Math.sin(phi),side*h] as Point3};
}
export function firstFundamentalForm(w:number){
  if(!Number.isFinite(w)||w< -1.5||w>2)
    throw Error('第一基本形式只定义在有界纸张横向范围。');
  return {E:(1+w/2)**2,F:0,G:1,jacobian:1+w/2};
}
export function creaseFrame(progress:number,s:number,
  parameters=DEFAULT_MOTION_PARAMETERS){
  check(progress,s,0,parameters);
  const {c,h}=halfAngleTrig(progress),
    phi=s/(2*c),er:Point3=[Math.cos(phi),Math.sin(phi),0],
    tangent:Point3=[-Math.sin(phi),Math.cos(phi),0];
  return {point:motionPoint(progress,s,0,parameters),tangent,
    leftRuling:[-c*er[0],-c*er[1],h] as Point3,
    rightRuling:[c*er[0],c*er[1],h] as Point3,
    leftNormal:[-h*er[0],-h*er[1],-c] as Point3,
    rightNormal:[h*er[0],h*er[1],-c] as Point3};
}
/** Analytic proof bounds, not a sampling-based collision estimate. */
export function certifySmoothMotion(parameters=DEFAULT_MOTION_PARAMETERS){
  validateMotionParameters(parameters);
  const cMin=.5,
    minimumRadialRadius=cMin*(2-parameters.leftWidth),
    minimumJacobian=1-parameters.leftWidth/2,
    maximumAzimuthSweep=parameters.arcEnd/(2*cMin);
  if(minimumRadialRadius<=0||minimumJacobian<=0||maximumAzimuthSweep>=2*Math.PI)
    throw Error('有限纸张超出全路径全局单射证明域。');
  return {savedCell:'In[3992]',numericCell:'In[3995]',
    targetGammaDeg:120,sourceCreaseArc:[0,Math.PI] as [number,number],
    finiteTrim:{...parameters},minimumRadialRadius,minimumJacobian,
    minimumProjectedJacobian:cMin*minimumJacobian,
    maximumAzimuthSweep,
    metricIndependentOfProgress:true,focusFree:true,
    globalInjectiveEveryFrame:true,selfCollisionFreeEveryFrame:true,
    smoothContinuousMotion:true,exactOriginalTargetAtProgressOne:true,
    completeClosedMaterialDomain:true,includesFlatFrame:true,
    analyticMaterialInverse:true,paperThickness:0,
    polyhedralRigidPathChecked:false,exactStraightCreaseFOLD:false,
    wolframNumericOutAvailable:false};
}

/** Floating-point audit of the notebook's explicit endpoint F, rL and rR. */
export function savedEndpointResidual(parameters=DEFAULT_MOTION_PARAMETERS){
  validateMotionParameters(parameters);
  let maximum=0;
  for(let i=0;i<=8;i++){
    const s=parameters.arcEnd*i/8,er=[Math.cos(s),Math.sin(s)],
      h=Math.sqrt(3)/2;
    for(const w of [-parameters.leftWidth,0,parameters.rightWidth]){
      const spatial=motionPoint(1,s,w,parameters),
        source=[(1+w/2)*er[0],(1+w/2)*er[1],h*Math.abs(w)];
      maximum=Math.max(maximum,Math.hypot(...spatial.map((x,j)=>x-source[j])));
    }
  }
  return {maximum,comparison:'In[3992] 的显式 F、rL 与源分支 rR；非 Wolfram 数值 Out'};
}
