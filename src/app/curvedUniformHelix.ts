/** Origamica 15.0 section 45, In[3945]/In[3951]: smooth uniform-helix fold.
 * The returned curves and rulings are analytic. Sampled lines are a preview,
 * not an exact straight-crease FOLD graph or a deployment/collision proof.
 */

export type CurvedPoint2=[number,number];
export type CurvedPoint3=[number,number,number];

export type CurvedUniformHelixParams={
  family:'uniform-helix-curved-fold';
  radius:number;
  helicityAngleDeg:number;
  foldAngleDeg:number;
  parameterStart:number;
  parameterEnd:number;
  rulingLength:number;
  curveSegments:number;
  rulingSegments:number;
};

export type ValidatedCurvedUniformHelixParams=CurvedUniformHelixParams&{
  unfoldedCreaseRadius:number;
  rulingFocalDistance:number;
};

export type CurvedUniformHelixFrame={
  u:number;
  flatCrease:CurvedPoint2;
  foldedCrease:CurvedPoint3;
  flatLeftRuling:CurvedPoint2;
  flatRightRuling:CurvedPoint2;
  foldedLeftRuling:CurvedPoint3;
  foldedRightRuling:CurvedPoint3;
  foldAngleRad:number;
};

export type CurvedUniformHelixSample={
  params:ValidatedCurvedUniformHelixParams;
  frames:CurvedUniformHelixFrame[];
  flatLeftBoundary:CurvedPoint2[];
  flatRightBoundary:CurvedPoint2[];
  foldedLeftBoundary:CurvedPoint3[];
  foldedRightBoundary:CurvedPoint3[];
  rulingFrameIndices:number[];
  sourceFunctions:readonly ['CurvedFoldUniformHelix2D','CurvedFoldUniformHelix3D'];
  exactStraightCreaseFOLD:false;
  continuousIsometryAnalytic:true;
  deploymentPathChecked:false;
  selfCollisionChecked:false;
};

export type CurvedUniformHelixShapeSample={
  u:number;
  flatLeftCurvature:number;
  spatialCurvature:number;
  geodesicCurvature:number;
  torsion:number;
  flatLeftRulingAngleDeg:number;
  flatRightRulingAngleDeg:number;
  foldedLeftRulingAngleDeg:number;
  foldedRightRulingAngleDeg:number;
  foldAngleDeg:number;
};

export const CURVED_UNIFORM_HELIX_EXAMPLE:CurvedUniformHelixParams={
  family:'uniform-helix-curved-fold',radius:1,helicityAngleDeg:30,
  foldAngleDeg:90,parameterStart:0,parameterEnd:Math.PI,
  rulingLength:1,curveSegments:96,rulingSegments:4,
};

const numeric=(value:unknown,name:string):number=>{
  if(typeof value!=='number'||!Number.isFinite(value))throw Error(`${name}须为有限数值。`);
  return value;
};

/** Uses the same regular-domain and focal-width guards as the Python module. */
export function validateCurvedUniformHelixParams(input:unknown):ValidatedCurvedUniformHelixParams{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('均匀螺旋曲折参数无效。');
  const data=input as Record<string,unknown>;
  const allowed=new Set(['family','radius','helicityAngleDeg','foldAngleDeg',
    'parameterStart','parameterEnd','rulingLength','curveSegments','rulingSegments']);
  if(data.family!=='uniform-helix-curved-fold'||Object.keys(data).some(key=>!allowed.has(key)))
    throw Error('均匀螺旋曲折包含不支持的参数。');
  const radius=numeric(data.radius??1,'半径 r');
  const helicityAngleDeg=numeric(data.helicityAngleDeg??30,'螺旋角 θ');
  const foldAngleDeg=numeric(data.foldAngleDeg??90,'折角 γ');
  if(radius<=0||Math.abs(helicityAngleDeg)>=90||foldAngleDeg<=0||foldAngleDeg>=180)
    throw Error('须满足 r>0、|θ|<90°、0<γ<180°。');
  const parameterStart=numeric(data.parameterStart??0,'起点 u₀');
  const parameterEnd=numeric(data.parameterEnd??Math.PI,'终点 u₁');
  if(!(parameterEnd-parameterStart>1e-6&&parameterEnd-parameterStart<=2*Math.PI))
    throw Error('参数区间须大于 0 且不超过 2π。');
  const rulingLength=numeric(data.rulingLength??1,'母线长度');
  if(rulingLength<=0)throw Error('母线长度须大于 0。');
  const curveSegments=numeric(data.curveSegments??96,'曲线采样段数');
  const rulingSegments=numeric(data.rulingSegments??4,'母线采样段数');
  if(!Number.isInteger(curveSegments)||curveSegments<8||curveSegments>1024)
    throw Error('曲线采样段数须为 8–1024 的整数。');
  if(!Number.isInteger(rulingSegments)||rulingSegments<1||rulingSegments>32)
    throw Error('母线采样段数须为 1–32 的整数。');
  if((curveSegments+1)*(2*rulingSegments+1)>60000)
    throw Error('采样顶点数不能超过 60000。');
  const theta=helicityAngleDeg*Math.PI/180,gamma=foldAngleDeg*Math.PI/180;
  const c=Math.cos(theta),cg2=Math.cos(gamma/2),sg2=Math.sin(gamma/2);
  const h=Math.sqrt(1-(c*cg2)**2);
  if(!(h>0))throw Error('当前角度使母线表达式奇异。');
  const unfoldedCreaseRadius=radius/(cg2*c*c);
  const rulingFocalDistance=unfoldedCreaseRadius*c*sg2/h;
  if(!Number.isFinite(unfoldedCreaseRadius)||!Number.isFinite(rulingFocalDistance))
    throw Error('展开曲面超出有限数值范围。');
  if(rulingLength>=rulingFocalDistance*(1-1e-8))
    throw Error(`母线长度须小于焦线距离 ${rulingFocalDistance.toPrecision(5)}。`);
  return {family:'uniform-helix-curved-fold',radius,helicityAngleDeg,foldAngleDeg,
    parameterStart,parameterEnd,rulingLength,curveSegments,rulingSegments,
    unfoldedCreaseRadius,rulingFocalDistance};
}

/** Angles are radians. This is the direct simplification of the notebook boxes. */
export function curvedUniformHelixFrame(radius:number,theta:number,gamma:number,u:number):CurvedUniformHelixFrame{
  if(![radius,theta,gamma,u].every(Number.isFinite)||radius<=0||
    !(theta>-Math.PI/2&&theta<Math.PI/2)||!(gamma>0&&gamma<Math.PI))
    throw Error('均匀螺旋曲折的解析参数退化。');
  const c=Math.cos(theta),s=Math.sin(theta),cg2=Math.cos(gamma/2),sg2=Math.sin(gamma/2);
  const h=Math.sqrt(1-(c*cg2)**2);
  if(!(h>0))throw Error('均匀螺旋曲折的母线表达式奇异。');
  const k=c*cg2,unfoldedRadius=radius/(cg2*c*c);
  const angle=k*u,ca=Math.cos(angle),sa=Math.sin(angle),cu=Math.cos(u),su=Math.sin(u);
  const a2=c*sg2/h,b2=s/h;
  const a3=c*Math.sin(gamma)/(2*h),b3=c*(1+Math.cos(gamma))*s/(2*h);
  return {
    u,
    flatCrease:[1-2*unfoldedRadius*Math.sin(angle/2)**2,unfoldedRadius*sa],
    foldedCrease:[radius*cu,radius*su,radius*Math.tan(theta)*u],
    flatLeftRuling:[-a2*ca-b2*sa,-a2*sa+b2*ca],
    flatRightRuling:[a2*ca-b2*sa,a2*sa+b2*ca],
    foldedLeftRuling:[-a3*cu-b3*su,-a3*su+b3*cu,h],
    foldedRightRuling:[a3*cu-b3*su,a3*su+b3*cu,h],
    foldAngleRad:gamma,
  };
}

const offset2=(point:CurvedPoint2,direction:CurvedPoint2,length:number):CurvedPoint2=>
  [point[0]+length*direction[0],point[1]+length*direction[1]];
const offset3=(point:CurvedPoint3,direction:CurvedPoint3,length:number):CurvedPoint3=>
  [point[0]+length*direction[0],point[1]+length*direction[1],point[2]+length*direction[2]];

/** Samples continuous curves/rulings for preview, keeping the source contract explicit. */
export function sampleCurvedUniformHelix(input:unknown):CurvedUniformHelixSample{
  const params=validateCurvedUniformHelixParams(input);
  const {radius,helicityAngleDeg,foldAngleDeg,parameterStart,parameterEnd,
    rulingLength,curveSegments}=params;
  const theta=helicityAngleDeg*Math.PI/180,gamma=foldAngleDeg*Math.PI/180;
  const frames=Array.from({length:curveSegments+1},(_,i)=>curvedUniformHelixFrame(
    radius,theta,gamma,parameterStart+(parameterEnd-parameterStart)*i/curveSegments));
  const step=Math.max(1,Math.round(curveSegments/12));
  const rulingFrameIndices=frames.map((_,i)=>i).filter(i=>i===curveSegments||i%step===0);
  return {
    params,frames,
    flatLeftBoundary:frames.map(f=>offset2(f.flatCrease,f.flatLeftRuling,rulingLength)),
    flatRightBoundary:frames.map(f=>offset2(f.flatCrease,f.flatRightRuling,rulingLength)),
    foldedLeftBoundary:frames.map(f=>offset3(f.foldedCrease,f.foldedLeftRuling,rulingLength)),
    foldedRightBoundary:frames.map(f=>offset3(f.foldedCrease,f.foldedRightRuling,rulingLength)),
    rulingFrameIndices,
    sourceFunctions:['CurvedFoldUniformHelix2D','CurvedFoldUniformHelix3D'],
    exactStraightCreaseFOLD:false,continuousIsometryAnalytic:true,
    deploymentPathChecked:false,selfCollisionChecked:false,
  };
}

/** CurvedFoldShapePlots2D/3D, In[3957] analytic expressions.
 * In[3958] plots interpolated versions of these same source functions; this
 * deliberately reports the continuous expressions, not interpolation noise.
 */
export function curvedUniformHelixShapeSamples(sample:CurvedUniformHelixSample):CurvedUniformHelixShapeSample[]{
  const {radius,helicityAngleDeg,foldAngleDeg,unfoldedCreaseRadius}=sample.params;
  const theta=helicityAngleDeg*Math.PI/180;
  const c=Math.cos(theta),s=Math.sin(theta);
  const spatialCurvature=c*c/radius;
  const geodesicCurvature=spatialCurvature*Math.cos(foldAngleDeg*Math.PI/360);
  const torsion=c*s/radius;
  const dot2=(a:CurvedPoint2,b:CurvedPoint2)=>a[0]*b[0]+a[1]*b[1];
  const dot3=(a:CurvedPoint3,b:CurvedPoint3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const angle=(value:number)=>Math.acos(Math.max(-1,Math.min(1,value)))*180/Math.PI;
  return sample.frames.map(frame=>{
    const k=c*Math.cos(foldAngleDeg*Math.PI/360);
    const t2:CurvedPoint2=[-Math.sin(k*frame.u),Math.cos(k*frame.u)];
    const t3:CurvedPoint3=[-c*Math.sin(frame.u),c*Math.cos(frame.u),s];
    return {
      u:frame.u,
      flatLeftCurvature:1/unfoldedCreaseRadius,
      spatialCurvature,geodesicCurvature,torsion,
      flatLeftRulingAngleDeg:angle(dot2(frame.flatLeftRuling,t2)),
      flatRightRulingAngleDeg:angle(dot2(frame.flatRightRuling,t2)),
      foldedLeftRulingAngleDeg:angle(dot3(frame.foldedLeftRuling,t3)),
      foldedRightRulingAngleDeg:angle(dot3(frame.foldedRightRuling,t3)),
      foldAngleDeg,
    };
  });
}
