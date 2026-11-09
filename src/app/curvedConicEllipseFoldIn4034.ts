/** Origamica section 45 In[4034]: a fixed two-focus ellipse and its
 * NFoldCurvedFold3D numerical reconstruction from the saved -60° initial fold.
 * Continuous metric identities are analytic; the spatial crease is RK4.
 */
export type Point2=[number,number];
export type Point3=[number,number,number];
type State=[number,number,number,number,number,number,number,number,number,number,number,number];
const END=2*Math.PI/3,WIDTH=.5,C=Math.sqrt(3)/2,S=-.5,FRAME_COUNT=97;
export const CONIC_ELLIPSE_FOLD_IN4034={
  savedCell:'In[4034]',conicDefinitionCell:'In[4019]',foldDefinitionCell:'In[3977]',
  focusLeft:-1,focusRight:-2,crossLeft:-.5,crossRight:.5,
  savedOpticalStartDeg:-60,savedOpticalEndDeg:60,
  savedFoldStartDeg:0,savedFoldEndDeg:120,initialFoldAngleDeg:-60,
  initialPosition:[0,0,0] as Point3,initialTangent:[0,1,0] as Point3,
  initialBinormal:[0,0,1] as Point3,localRibbonWidth:WIDTH,
  localPreviewPoints:FRAME_COUNT,
} as const;
export type EllipseFoldFrame={u:number;foldAngleRad:number;
  flatCrease:Point2;flatLeftRuling:Point2;flatRightRuling:Point2;
  foldedCrease:Point3;foldedLeftRuling:Point3;foldedRightRuling:Point3;
  tangent3D:Point3;normal3D:Point3;binormal3D:Point3};
export type EllipseFoldSample={source:typeof CONIC_ELLIPSE_FOLD_IN4034;
  frames:EllipseFoldFrame[];flatLeftBoundary:Point2[];flatRightBoundary:Point2[];
  foldedLeftBoundary:Point3[];foldedRightBoundary:Point3[];
  rulingFrameIndices:number[];diagnostics:{
    sourceCotDifferenceMaximum:number;frameOrthogonalityMaximum:number;
    integrationConvergenceMaximum:number;leftJacobianLowerBound:number;
    rightJacobianMagnitudeLowerBound:number;maxMetricIdentityResidual:number;
  };exactStraightCreaseFOLD:false;sampledMeshExactIsometry:false;
  deploymentPathChecked:false;selfCollisionChecked:false;machineReadableWolframOut:false};

const initial:State=[0,0,0,0,1,0,-1,0,0,0,0,1];
const dot2=(a:Point2,b:Point2)=>a[0]*b[0]+a[1]*b[1];
const dot3=(a:Point3,b:Point3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=(a:readonly number[])=>Math.hypot(...a);
const distance=(a:readonly number[],b:readonly number[])=>
  Math.hypot(...a.map((v,i)=>v-b[i]));
function checkU(u:number){
  if(!Number.isFinite(u)||u<0||u>END)throw Error('In[4034] 的 u 须在 [0,2π/3]。');
}

/** Source f, second cross curves, and normalized rulings, simplified for
 * {-1,-2},{-1/2,1/2}. */
export function conicEllipsePlanarAt(u:number){
  checkU(u);
  const co=Math.cos(u),si=Math.sin(u),q=Math.tan(u/2),den=3+co;
  const crease:Point2=[-1+4*co/den,4*si/den];
  const crossLeft:Point2=[-1+.5*co,.5*si];
  const d=4+q*q;
  const crossRight:Point2=[-.5-4*(1-5/d),10*q/d];
  const left:Point2=[-co,-si];
  const right:Point2=[(4-q*q)/d,4*q/d];
  const tangentRaw:Point2=[-3*si,3*co+1],qnorm=Math.sqrt(10+6*co);
  const tangent:Point2=[tangentRaw[0]/qnorm,tangentRaw[1]/qnorm];
  const normal:Point2=[-tangent[1],tangent[0]];
  const along=-si/qnorm,transverse=den/qnorm;
  const speed=4*qnorm/(den*den);
  const turningRate=3*den/(10+6*co);
  const cot=-si/den;
  const rightAngularRate=2*(1+q*q)/d;
  return {crease,crossLeft,crossRight,left,right,tangent,normal,along,transverse,
    speed,turningRate,cot,rightAngularRate};
}

/** Frenet system exactly specialized from In[3977] after the saved optical
 * rays imply cotρL=cotρR=-sin(u)/(3+cos(u)), hence γ(u)=-60° throughout. */
function derivative(u:number,y:State):State{
  const p=conicEllipsePlanarAt(u),k=p.turningRate/C;
  const torsionU=p.turningRate*p.cot*S/C;
  const out=Array(12).fill(0) as State;
  for(let i=0;i<3;i++){
    out[i]=p.speed*y[3+i];
    out[3+i]=k*y[6+i];
    out[6+i]=-k*y[3+i]+torsionU*y[9+i];
    out[9+i]=-torsionU*y[6+i];
  }
  return out;
}
function rk4Step(u:number,y:State,h:number):State{
  const plus=(base:State,k:State,factor:number)=>base.map((v,i)=>v+factor*k[i]) as State;
  const a=derivative(u,y),b=derivative(u+h/2,plus(y,a,h/2));
  const c=derivative(u+h/2,plus(y,b,h/2)),d=derivative(u+h,plus(y,c,h));
  return y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6) as State;
}
function integrateStates(stepsPerFrame:number):State[]{
  let state=[...initial] as State;
  const rows=[state];
  const h=END/(96*stepsPerFrame);
  for(let frame=1;frame<FRAME_COUNT;frame++){
    for(let sub=0;sub<stepsPerFrame;sub++)
      state=rk4Step((frame-1)*END/96+sub*h,state,h);
    if(!state.every(Number.isFinite))throw Error('In[4034] 三维积分不是有限值。');
    rows.push(state);
  }
  return rows;
}
function offset2(p:Point2,r:Point2):Point2{return [p[0]+WIDTH*r[0],p[1]+WIDTH*r[1]]}
function offset3(p:Point3,r:Point3):Point3{return [p[0]+WIDTH*r[0],p[1]+WIDTH*r[1],p[2]+WIDTH*r[2]]}

export function sampleConicEllipseFoldIn4034():EllipseFoldSample{
  const states=integrateStates(32),reference=integrateStates(64);
  let sourceCotDifferenceMaximum=0,frameOrthogonalityMaximum=0;
  let integrationConvergenceMaximum=0,maxMetricIdentityResidual=0;
  const frames=states.map((state,i)=>{
    const u=END*i/96,p=conicEllipsePlanarAt(u);
    const F=state.slice(0,3) as Point3,T=state.slice(3,6) as Point3;
    const N=state.slice(6,9) as Point3,B=state.slice(9,12) as Point3;
    const LL=T.map((_,j)=>C*N[j]+S*B[j]) as Point3;
    const LR=T.map((_,j)=>C*N[j]-S*B[j]) as Point3;
    const rl=T.map((v,j)=>p.along*v+p.transverse*LL[j]) as Point3;
    const rr=T.map((v,j)=>p.along*v-p.transverse*LR[j]) as Point3;
    const cotL=dot2(p.tangent,p.left)/dot2(p.normal,p.left);
    const cotR=dot2(p.tangent,p.right)/-dot2(p.normal,p.right);
    sourceCotDifferenceMaximum=Math.max(sourceCotDifferenceMaximum,
      Math.abs(cotL-cotR),Math.abs(cotL-p.cot));
    frameOrthogonalityMaximum=Math.max(frameOrthogonalityMaximum,
      Math.abs(dot3(T,N)),Math.abs(dot3(T,B)),Math.abs(dot3(N,B)),
      Math.abs(length(T)-1),Math.abs(length(N)-1),Math.abs(length(B)-1),
      Math.abs(length(rl)-1),Math.abs(length(rr)-1));
    integrationConvergenceMaximum=Math.max(integrationConvergenceMaximum,
      distance(state,reference[i]));
    // F=ds·along and G=1 on both surfaces; E follows from source ruling
    // derivatives and the Darboux/Frenet ODE: angular rates are 1 and aR.
    const s=p.transverse,c=p.along,ds=p.speed,aR=p.rightAngularRate;
    const flatLPrime:Point2=[Math.sin(u),-Math.cos(u)];
    const q=Math.tan(u/2),d=4+q*q;
    const rightPrime:Point2=[-8*q*(1+q*q)/d**2,
      2*(1+q*q)*(4-q*q)/d**2];
    const leftExpected=ds*ds-2*ds*s*WIDTH+WIDTH*WIDTH;
    const rightExpected=ds*ds+2*ds*s*aR*WIDTH+aR*aR*WIDTH*WIDTH;
    const leftObserved=(p.speed*p.tangent[0]+WIDTH*flatLPrime[0])**2+
      (p.speed*p.tangent[1]+WIDTH*flatLPrime[1])**2;
    const rightObserved=(p.speed*p.tangent[0]+WIDTH*rightPrime[0])**2+
      (p.speed*p.tangent[1]+WIDTH*rightPrime[1])**2;
    maxMetricIdentityResidual=Math.max(maxMetricIdentityResidual,
      Math.abs(leftObserved-leftExpected),Math.abs(rightObserved-rightExpected),
      Math.abs(dot2(p.tangent,p.left)-c),Math.abs(dot2(p.tangent,p.right)-c));
    return {u,foldAngleRad:-Math.PI/3,flatCrease:p.crease,
      flatLeftRuling:p.left,flatRightRuling:p.right,foldedCrease:F,
      foldedLeftRuling:rl,foldedRightRuling:rr,tangent3D:T,normal3D:N,binormal3D:B};
  });
  const leftJacobianLowerBound=.5,rightJacobianMagnitudeLowerBound=1;
  if(sourceCotDifferenceMaximum>1e-11||frameOrthogonalityMaximum>1e-9||
    integrationConvergenceMaximum>1e-9||maxMetricIdentityResidual>1e-10)
    throw Error('In[4034] 解析／数值校核未通过。');
  return {source:CONIC_ELLIPSE_FOLD_IN4034,frames,
    flatLeftBoundary:frames.map(f=>offset2(f.flatCrease,f.flatLeftRuling)),
    flatRightBoundary:frames.map(f=>offset2(f.flatCrease,f.flatRightRuling)),
    foldedLeftBoundary:frames.map(f=>offset3(f.foldedCrease,f.foldedLeftRuling)),
    foldedRightBoundary:frames.map(f=>offset3(f.foldedCrease,f.foldedRightRuling)),
    rulingFrameIndices:frames.map((_,i)=>i).filter(i=>i===96||i%8===0),
    diagnostics:{sourceCotDifferenceMaximum,frameOrthogonalityMaximum,
      integrationConvergenceMaximum,leftJacobianLowerBound,
      rightJacobianMagnitudeLowerBound,maxMetricIdentityResidual},
    exactStraightCreaseFOLD:false,sampledMeshExactIsometry:false,
    deploymentPathChecked:false,selfCollisionChecked:false,
    machineReadableWolframOut:false};
}
