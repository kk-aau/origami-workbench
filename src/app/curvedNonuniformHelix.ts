/** Origamica section 45, In[3959]/[3963]/[3966]/[3968].
 * Fixed saved input: the spatial rulings are source-derived analytic functions;
 * the planar crease is evaluated by numerical quadrature of its exact tangent.
 */

export type Point2=[number,number];
export type Point3=[number,number,number];

const PI=Math.PI;
const THETA=PI/6;
const COS_THETA=Math.cos(THETA);
const SIN_THETA=Math.sin(THETA);
const GAMMA_PRIME=1/3;
const SPEED=1/COS_THETA;
const WIDTH=0.5;
const POINTS=128;

export const NONUNIFORM_HELIX_IN3968={
  sourceCell:'In[3968]',source3D:'In[3959]/In[3963]',source2D:'In[3966]',
  radius:1,helicityAngleDeg:30,foldAngleStartDeg:60,foldAngleEndDeg:120,
  parameterStart:0,parameterEnd:PI,originalInterpolationPoints:128,
  localPreviewPoints:POINTS,localRibbonWidth:WIDTH,
} as const;

export type NonuniformHelixFrame={
  u:number;foldAngleRad:number;
  flatCrease:Point2;foldedCrease:Point3;
  flatLeftRuling:Point2;flatRightRuling:Point2;
  foldedLeftRuling:Point3;foldedRightRuling:Point3;
};

export type NonuniformHelixSample={
  source:typeof NONUNIFORM_HELIX_IN3968;
  frames:NonuniformHelixFrame[];
  flatLeftBoundary:Point2[];flatRightBoundary:Point2[];
  foldedLeftBoundary:Point3[];foldedRightBoundary:Point3[];
  rulingFrameIndices:number[];
  diagnostics:{
    sourceLeftDenominatorSquaredLowerBound:number;
    sourceRightDenominatorSquaredLowerBound:number;
    leftJacobianLowerBound:number;
    rightJacobianMagnitudeLowerBound:number;
    unitLeftFocalDistanceAtStart:number;
    original2DInterpolationOptionForwarded:false;
  };
  exactStraightCreaseFOLD:false;
  sampledMeshExactIsometry:false;
  deploymentPathChecked:false;
  selfCollisionChecked:false;
};

const gaussNodes=[
  0.1834346424956498,0.5255324099163290,
  0.7966664774136267,0.9602898564975363,
] as const;
const gaussWeights=[
  0.3626837833783620,0.3137066458778873,
  0.2223810344533745,0.1012285362903763,
] as const;

function checkU(u:number){
  if(!Number.isFinite(u)||u<0||u>PI)throw Error('In[3968] 的参数 u 须在 [0,π]。');
}

export function foldAngleAt(u:number):number{
  checkU(u);
  return PI/3+u/3;
}

/** Exact phase of the planar unit tangent, with f(0)=(1,0), T(0)=(0,1). */
export function planarTangentPhaseAt(u:number):number{
  checkU(u);
  return PI/2+6*COS_THETA*(Math.sin(PI/6+u/6)-0.5);
}

function planeCreaseQuadrature(a:number,b:number):Point2{
  const mid=(a+b)/2,half=(b-a)/2;
  let x=0,y=0;
  for(let i=0;i<gaussNodes.length;i++){
    const offset=half*gaussNodes[i];
    const before=planarTangentPhaseAt(mid-offset);
    const after=planarTangentPhaseAt(mid+offset);
    const weight=half*SPEED*gaussWeights[i];
    x+=weight*(Math.cos(before)+Math.cos(after));
    y+=weight*(Math.sin(before)+Math.sin(after));
  }
  return [x,y];
}

/** Numerical evaluation of the source's exact planar quadrature. */
export function planarCreaseAt(u:number):Point2{
  checkU(u);
  const intervals=Math.max(1,Math.ceil(32*u/PI));
  let x=1,y=0;
  for(let i=0;i<intervals;i++){
    const [dx,dy]=planeCreaseQuadrature(u*i/intervals,u*(i+1)/intervals);
    x+=dx;y+=dy;
  }
  return [x,y];
}

function rulingData(u:number){
  const gamma=foldAngleAt(u);
  const halfSin=Math.sin(gamma/2);
  const transverse=2*COS_THETA*halfSin;
  const leftAlong=2*SIN_THETA+GAMMA_PRIME;
  const rightAlong=2*SIN_THETA-GAMMA_PRIME;
  const leftDenominator=Math.hypot(leftAlong,transverse);
  const rightDenominator=Math.hypot(rightAlong,transverse);
  return {gamma,transverse,leftAlong,rightAlong,leftDenominator,rightDenominator};
}

/** Directly simplified from In[3959]; the two signs are intentionally distinct. */
export function foldedRulingsAt(u:number):{left:Point3;right:Point3}{
  checkU(u);
  const {gamma,leftDenominator,rightDenominator}=rulingData(u);
  const cg=Math.cos(gamma),sg=Math.sin(gamma),cu=Math.cos(u),su=Math.sin(u);
  const zBase=COS_THETA*COS_THETA*(1-cg)+2*SIN_THETA*SIN_THETA;
  const leftAzimuth=(1+cg)*SIN_THETA+GAMMA_PRIME;
  const rightAzimuth=(1+cg)*SIN_THETA-GAMMA_PRIME;
  const left:Point3=[
    -COS_THETA*(sg*cu+leftAzimuth*su)/leftDenominator,
    COS_THETA*(-sg*su+leftAzimuth*cu)/leftDenominator,
    (zBase+SIN_THETA*GAMMA_PRIME)/leftDenominator,
  ];
  const right:Point3=[
    COS_THETA*(sg*cu-rightAzimuth*su)/rightDenominator,
    COS_THETA*(sg*su+rightAzimuth*cu)/rightDenominator,
    (zBase-SIN_THETA*GAMMA_PRIME)/rightDenominator,
  ];
  return {left,right};
}

function flatRulingsAt(u:number):{left:Point2;right:Point2}{
  const data=rulingData(u),phase=planarTangentPhaseAt(u);
  const tangent:Point2=[Math.cos(phase),Math.sin(phase)];
  const normal:Point2=[-tangent[1],tangent[0]];
  const left:Point2=[
    (data.leftAlong*tangent[0]+data.transverse*normal[0])/data.leftDenominator,
    (data.leftAlong*tangent[1]+data.transverse*normal[1])/data.leftDenominator,
  ];
  const right:Point2=[
    (data.rightAlong*tangent[0]-data.transverse*normal[0])/data.rightDenominator,
    (data.rightAlong*tangent[1]-data.transverse*normal[1])/data.rightDenominator,
  ];
  return {left,right};
}

export function nonuniformHelixFrameAt(u:number):NonuniformHelixFrame{
  checkU(u);
  const spatial=foldedRulingsAt(u),flat=flatRulingsAt(u);
  return {u,foldAngleRad:foldAngleAt(u),flatCrease:planarCreaseAt(u),
    foldedCrease:[Math.cos(u),Math.sin(u),Math.tan(THETA)*u],
    flatLeftRuling:flat.left,flatRightRuling:flat.right,
    foldedLeftRuling:spatial.left,foldedRightRuling:spatial.right};
}

function add2(point:Point2,direction:Point2):Point2{
  return [point[0]+WIDTH*direction[0],point[1]+WIDTH*direction[1]];
}
function add3(point:Point3,direction:Point3):Point3{
  return [point[0]+WIDTH*direction[0],point[1]+WIDTH*direction[1],point[2]+WIDTH*direction[2]];
}

/** A whole-interval sufficient regularity bound for the chosen 0.5-wide preview. */
export function nonuniformHelixDiagnostics():NonuniformHelixSample['diagnostics']{
  const transverseMin=COS_THETA;
  const leftAlong=2*SIN_THETA+GAMMA_PRIME;
  const rightAlong=2*SIN_THETA-GAMMA_PRIME;
  const dl2=leftAlong*leftAlong+transverseMin*transverseMin;
  const dr2=rightAlong*rightAlong+transverseMin*transverseMin;
  const leftStartJac=SPEED*transverseMin/Math.sqrt(dl2);
  const rightStartJac=SPEED*transverseMin/Math.sqrt(dr2);
  const leftAngularRateMax=COS_THETA*Math.cos(PI/6)*
    (1+leftAlong*GAMMA_PRIME/dl2);
  // The right ruling angle grows: its signed Jacobian is negative for v>=0.
  const leftJacobianLowerBound=leftStartJac-WIDTH*leftAngularRateMax;
  if(!(leftJacobianLowerBound>0))throw Error('局部宽度跨过左母线焦线。');
  return {
    sourceLeftDenominatorSquaredLowerBound:dl2,
    sourceRightDenominatorSquaredLowerBound:dr2,
    leftJacobianLowerBound,
    rightJacobianMagnitudeLowerBound:rightStartJac,
    unitLeftFocalDistanceAtStart:leftStartJac/leftAngularRateMax,
    original2DInterpolationOptionForwarded:false,
  };
}

export function sampleNonuniformHelixIn3968():NonuniformHelixSample{
  const diagnostics=nonuniformHelixDiagnostics();
  const frames=Array.from({length:POINTS},(_,i)=>nonuniformHelixFrameAt(PI*i/(POINTS-1)));
  const rulingFrameIndices=frames.map((_,i)=>i).filter(i=>i===POINTS-1||i%11===0);
  return {source:NONUNIFORM_HELIX_IN3968,frames,
    flatLeftBoundary:frames.map(f=>add2(f.flatCrease,f.flatLeftRuling)),
    flatRightBoundary:frames.map(f=>add2(f.flatCrease,f.flatRightRuling)),
    foldedLeftBoundary:frames.map(f=>add3(f.foldedCrease,f.foldedLeftRuling)),
    foldedRightBoundary:frames.map(f=>add3(f.foldedCrease,f.foldedRightRuling)),
    rulingFrameIndices,diagnostics,
    exactStraightCreaseFOLD:false,sampledMeshExactIsometry:false,
    deploymentPathChecked:false,selfCollisionChecked:false};
}
