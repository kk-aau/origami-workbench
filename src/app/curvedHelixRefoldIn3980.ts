/** Origamica In[3980]: saved nonuniform helix -> 2D -> NFoldCurvedFold3D.
 * The inverse is solved from the planar ruling coefficients and midpoint
 * Frenet initial data. This is a local, fixed-input numerical reconstruction.
 */

export type Point2=[number,number];
export type Point3=[number,number,number];

const PI=Math.PI;
const C=Math.sqrt(3)/2;
const S=0.5;
const SPEED=1/C;
const GAMMA_PRIME=-1/3;
const MID=PI/2;
const POINTS=128;
const WIDTH=1;

export const HELIX_REFOLD_IN3980={
  savedCell:'In[3980]',sourceHelixCell:'In[3959]',inverseCell:'In[3977]',
  radius:1,helicityAngleDeg:30,foldAngleStartDeg:120,foldAngleEndDeg:60,
  parameterStart:0,parameterEnd:PI,originalInterpolationPoints:128,
  initialParameter:MID,initialFoldAngleDeg:90,
  initialPosition:[0,1,PI/(2*Math.sqrt(3))] as Point3,
  initialTangent:[-C,0,S] as Point3,
  initialBinormal:[S,0,C] as Point3,
  localPreviewPoints:POINTS,localRibbonWidth:WIDTH,
} as const;

export type RefoldFrame={
  u:number;sourceFoldAngleRad:number;recoveredFoldAngleRad:number;
  flatCrease:Point2;flatLeftRuling:Point2;flatRightRuling:Point2;
  sourceCrease:Point3;sourceLeftRuling:Point3;sourceRightRuling:Point3;
  refoldedCrease:Point3;refoldedLeftRuling:Point3;refoldedRightRuling:Point3;
};

export type HelixRefoldSample={
  source:typeof HELIX_REFOLD_IN3980;
  frames:RefoldFrame[];
  flatLeftBoundary:Point2[];flatRightBoundary:Point2[];
  sourceLeftBoundary:Point3[];sourceRightBoundary:Point3[];
  refoldedLeftBoundary:Point3[];refoldedRightBoundary:Point3[];
  rulingFrameIndices:number[];
  diagnostics:{
    recoveredAngleMaximumErrorRad:number;
    recoveredCreaseMaximumError:number;
    recoveredRulingMaximumError:number;
    leftJacobianLowerBound:number;
    rightJacobianMagnitudeLowerBound:number;
    original2DInterpolationOptionForwarded:false;
  };
  exactStraightCreaseFOLD:false;
  sampledMeshExactIsometry:false;
  deploymentPathChecked:false;
  selfCollisionChecked:false;
};

function checkU(u:number){
  if(!Number.isFinite(u)||u<0||u>PI)throw Error('In[3980] 的 u 须在 [0,π]。');
}

export function savedFoldAngleAt(u:number):number{
  checkU(u);return 2*PI/3+GAMMA_PRIME*u;
}

/** Unit planar tangent phase for NFlattenFold2D's saved initial frame. */
export function planarPhaseAt(u:number):number{
  checkU(u);
  return PI/2-6*C*(Math.sin(PI/3-u/6)-Math.sin(PI/3));
}

const nodes=[.1834346424956498,.5255324099163290,.7966664774136267,.9602898564975363];
const weights=[.3626837833783620,.3137066458778873,.2223810344533745,.1012285362903763];
function integratePlaneSegment(a:number,b:number):Point2{
  const mid=(a+b)/2,half=(b-a)/2;
  let x=0,y=0;
  for(let i=0;i<4;i++){
    const offset=half*nodes[i],before=planarPhaseAt(mid-offset),after=planarPhaseAt(mid+offset);
    const weight=half*SPEED*weights[i];
    x+=weight*(Math.cos(before)+Math.cos(after));
    y+=weight*(Math.sin(before)+Math.sin(after));
  }
  return [x,y];
}

export function savedFlatCreaseAt(u:number):Point2{
  checkU(u);
  const steps=Math.max(1,Math.ceil(32*u/PI));
  let x=1,y=0;
  for(let i=0;i<steps;i++){
    const [dx,dy]=integratePlaneSegment(u*i/steps,u*(i+1)/steps);
    x+=dx;y+=dy;
  }
  return [x,y];
}

function planarData(u:number){
  const gamma=savedFoldAngleAt(u),phase=planarPhaseAt(u);
  const aL=2*S+GAMMA_PRIME,aR=2*S-GAMMA_PRIME;
  const b=2*C*Math.sin(gamma/2),dL=Math.hypot(aL,b),dR=Math.hypot(aR,b);
  const tangent:Point2=[Math.cos(phase),Math.sin(phase)];
  const normal:Point2=[-tangent[1],tangent[0]];
  const left:Point2=[(aL*tangent[0]+b*normal[0])/dL,
    (aL*tangent[1]+b*normal[1])/dL];
  const right:Point2=[(aR*tangent[0]-b*normal[0])/dR,
    (aR*tangent[1]-b*normal[1])/dR];
  return {gamma,tangent,normal,left,right};
}

function sourceSpatial(u:number){
  const gamma=savedFoldAngleAt(u),cg=Math.cos(gamma),sg=Math.sin(gamma);
  const cu=Math.cos(u),su=Math.sin(u);
  const aL=2*S+GAMMA_PRIME,aR=2*S-GAMMA_PRIME;
  const b=2*C*Math.sin(gamma/2),dL=Math.hypot(aL,b),dR=Math.hypot(aR,b);
  const azL=(1+cg)*S+GAMMA_PRIME,azR=(1+cg)*S-GAMMA_PRIME;
  const z=C*C*(1-cg)+2*S*S;
  const left:Point3=[-C*(sg*cu+azL*su)/dL,C*(-sg*su+azL*cu)/dL,
    (z+S*GAMMA_PRIME)/dL];
  const right:Point3=[C*(sg*cu-azR*su)/dR,C*(sg*su+azR*cu)/dR,
    (z-S*GAMMA_PRIME)/dR];
  const crease:Point3=[cu,su,Math.tan(PI/6)*u];
  return {crease,left,right};
}

const dot2=(a:Point2,b:Point2)=>a[0]*b[0]+a[1]*b[1];
const dot3=(a:Point3,b:Point3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm3=(a:Point3)=>Math.sqrt(dot3(a,a));
type State=[number,...number[]]; // γ, F, T, N, B in that order (13 scalars).
const initialState:State=[PI/2,0,1,PI/(2*Math.sqrt(3)),
  -C,0,S,0,-1,0,S,0,C];

/** Source In[3977] ODE, using only the unfolded crease and planar rulings. */
function derivative(u:number,state:State):State{
  const planar=planarData(u);
  const cL=dot2(planar.tangent,planar.left);
  const sL=dot2(planar.normal,planar.left);
  const cR=dot2(planar.tangent,planar.right);
  const sR=-dot2(planar.normal,planar.right);
  if(!(sL>0&&sR>0&&state[0]>0&&state[0]<PI))
    throw Error('In[3980] 的平面母线或折角退化。');
  const cotL=cL/sL,cotR=cR/sR;
  const kappaL= C*C*Math.cos(planar.gamma/2);
  const gammaPrime=SPEED*kappaL*(cotL-cotR)*Math.tan(state[0]/2);
  const curvature=kappaL/Math.cos(state[0]/2);
  const torsion=.5*Math.tan(state[0]/2)*kappaL*(cotL+cotR);
  const result=[gammaPrime] as State;
  for(let i=0;i<3;i++)result.push(SPEED*state[4+i]);
  for(let i=0;i<3;i++)result.push(SPEED*curvature*state[7+i]);
  for(let i=0;i<3;i++)result.push(SPEED*(-curvature*state[4+i]+torsion*state[10+i]));
  for(let i=0;i<3;i++)result.push(-SPEED*torsion*state[7+i]);
  return result;
}

function rk4Step(u:number,state:State,h:number):State{
  const plus=(base:State,k:State,factor:number)=>
    base.map((value,i)=>value+factor*k[i]) as State;
  const a=derivative(u,state);
  const b=derivative(u+h/2,plus(state,a,h/2));
  const c=derivative(u+h/2,plus(state,b,h/2));
  const d=derivative(u+h,plus(state,c,h));
  return state.map((value,i)=>value+h*(a[i]+2*b[i]+2*c[i]+d[i])/6) as State;
}

export function refoldStateAt(u:number):State{
  checkU(u);
  if(u===MID)return [...initialState] as State;
  const steps=Math.ceil(Math.abs(u-MID)/(PI/1024));
  const h=(u-MID)/steps;
  let state=[...initialState] as State;
  for(let i=0;i<steps;i++)state=rk4Step(MID+i*h,state,h);
  if(!state.every(Number.isFinite))throw Error('In[3980] 数值重折结果不有限。');
  return state;
}

export function helixRefoldFrameAt(u:number):RefoldFrame{
  checkU(u);
  const planar=planarData(u),source=sourceSpatial(u),state=refoldStateAt(u);
  const t=state.slice(4,7) as Point3,n=state.slice(7,10) as Point3,
    b=state.slice(10,13) as Point3;
  const cL=dot2(planar.tangent,planar.left),sL=dot2(planar.normal,planar.left);
  const cR=dot2(planar.tangent,planar.right),sR=-dot2(planar.normal,planar.right);
  const halfCos=Math.cos(state[0]/2),halfSin=Math.sin(state[0]/2);
  const left=t.map((value,i)=>cL*value+sL*(halfCos*n[i]+halfSin*b[i])) as Point3;
  const right=t.map((value,i)=>cR*value-sR*(halfCos*n[i]-halfSin*b[i])) as Point3;
  return {u,sourceFoldAngleRad:planar.gamma,recoveredFoldAngleRad:state[0],
    flatCrease:savedFlatCreaseAt(u),flatLeftRuling:planar.left,flatRightRuling:planar.right,
    sourceCrease:source.crease,sourceLeftRuling:source.left,sourceRightRuling:source.right,
    refoldedCrease:state.slice(1,4) as Point3,
    refoldedLeftRuling:left,refoldedRightRuling:right};
}

function offset2(point:Point2,ruling:Point2):Point2{
  return [point[0]+WIDTH*ruling[0],point[1]+WIDTH*ruling[1]];
}
function offset3(point:Point3,ruling:Point3):Point3{
  return [point[0]+WIDTH*ruling[0],point[1]+WIDTH*ruling[1],
    point[2]+WIDTH*ruling[2]];
}
function distance(a:readonly number[],b:readonly number[]){
  return Math.hypot(...a.map((value,i)=>value-b[i]));
}

export function sampleHelixRefoldIn3980():HelixRefoldSample{
  const frames=Array.from({length:POINTS},(_,i)=>helixRefoldFrameAt(PI*i/(POINTS-1)));
  const max=(f:(frame:RefoldFrame)=>number)=>Math.max(...frames.map(f));
  // B increases with γ; here γ decreases from 120° to 60°.
  const bMin=C,leftAlong=2*S+GAMMA_PRIME,rightAlong=2*S-GAMMA_PRIME;
  const leftAtCrease=SPEED*bMin/Math.hypot(leftAlong,bMin);
  const rightAtCrease=SPEED*bMin/Math.hypot(rightAlong,bMin);
  // For γ′<0, left angular rate is below c*cos(γ/2)≤3/4.
  const leftJacobianLowerBound=leftAtCrease-WIDTH*C*Math.cos(PI/6);
  if(!(leftJacobianLowerBound>0))throw Error('保存宽度越过左侧焦线。');
  const rulingFrameIndices=frames.map((_,i)=>i).filter(i=>i===POINTS-1||i%11===0);
  return {source:HELIX_REFOLD_IN3980,frames,
    flatLeftBoundary:frames.map(f=>offset2(f.flatCrease,f.flatLeftRuling)),
    flatRightBoundary:frames.map(f=>offset2(f.flatCrease,f.flatRightRuling)),
    sourceLeftBoundary:frames.map(f=>offset3(f.sourceCrease,f.sourceLeftRuling)),
    sourceRightBoundary:frames.map(f=>offset3(f.sourceCrease,f.sourceRightRuling)),
    refoldedLeftBoundary:frames.map(f=>offset3(f.refoldedCrease,f.refoldedLeftRuling)),
    refoldedRightBoundary:frames.map(f=>offset3(f.refoldedCrease,f.refoldedRightRuling)),
    rulingFrameIndices,
    diagnostics:{
      recoveredAngleMaximumErrorRad:max(f=>Math.abs(f.recoveredFoldAngleRad-f.sourceFoldAngleRad)),
      recoveredCreaseMaximumError:max(f=>distance(f.refoldedCrease,f.sourceCrease)),
      recoveredRulingMaximumError:max(f=>Math.max(
        distance(f.refoldedLeftRuling,f.sourceLeftRuling),
        distance(f.refoldedRightRuling,f.sourceRightRuling))),
      leftJacobianLowerBound,rightJacobianMagnitudeLowerBound:rightAtCrease,
      original2DInterpolationOptionForwarded:false,
    },
    exactStraightCreaseFOLD:false,sampledMeshExactIsometry:false,
    deploymentPathChecked:false,selfCollisionChecked:false};
}
