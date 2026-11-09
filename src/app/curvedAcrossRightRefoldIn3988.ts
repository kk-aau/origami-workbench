/** Fixed In[3988] source-equation reconstruction; never an exact FOLD mesh. */
export type Point2=[number,number];
export type Point3=[number,number,number];
export type Side='left'|'right';
type State=number[]; // F, T, N, B (three coordinates each).

const END=Math.PI/2;
const GAMMA0=5*Math.PI/6;
const ANGLE_RATE=5*.9999/3;
const WIDTH=.5;
const PREVIEW_SEGMENTS=96;
const INITIAL:State=[1,0,0, 0,1,0, -1,0,0, 0,0,1];

export const ACROSS_REFOLD_IN3988={
  sourceCell:'In[3988]',source2D:'In[3986]',source3D:'In[3977]',
  parameterRange:[0,END] as Point2,initialFoldAngleDeg:150,
  terminalFoldAngleDeg:.015,originalInterpolationPoints:64,
  initialPoint:[1,0,0] as Point3,initialTangent:[0,1,0] as Point3,
  initialBinormal:[0,0,1] as Point3,localWidth:WIDTH,
  numericInterpolationReproduced:false,exactStraightCreaseFOLD:false,
  adoptableCreasePattern:false,motionVerified:false,selfCollisionVerified:false,
} as const;

function checkU(u:number){
  if(!Number.isFinite(u)||u<0||u>END)throw Error('In[3988] 的 u 须在 [0,π/2]。');
}
function checkV(v:number){
  if(!Number.isFinite(v)||v<0||v>WIDTH)
    throw Error('仅认证 0≤v≤0.5 的焦线前局部带。');
}
const dot=(a:readonly number[],b:readonly number[])=>
  a.reduce((sum,value,i)=>sum+value*b[i],0);
const add=(a:readonly number[],b:readonly number[],v:number)=>
  a.map((value,i)=>value+v*b[i]);
const vec=(state:State,offset:number)=>state.slice(offset,offset+3) as Point3;

export function foldAngle(u:number){checkU(u);return GAMMA0-ANGLE_RATE*u;}
export function sourceCurvature(u:number){return 1/Math.cos(foldAngle(u)/2);}
export function sourceTorsion(){return ANGLE_RATE/2;}
export function rightCoefficients(u:number){
  const t=Math.tan(foldAngle(u)/2),denominator=Math.hypot(ANGLE_RATE,t);
  return {c:ANGLE_RATE/denominator,s:t/denominator,
    angleRate:1+ANGLE_RATE*ANGLE_RATE*(1+t*t)/(2*(ANGLE_RATE*ANGLE_RATE+t*t))};
}

function derivative(u:number,y:State):State{
  const k=1/Math.cos((GAMMA0-ANGLE_RATE*u)/2),tau=ANGLE_RATE/2;
  const out=new Array<number>(12);
  for(let i=0;i<3;i++){
    out[i]=y[3+i];
    out[3+i]=k*y[6+i];
    out[6+i]=-k*y[3+i]+tau*y[9+i];
    out[9+i]=-tau*y[6+i];
  }
  return out;
}
function plus(y:State,k:State,h:number):State{return y.map((v,i)=>v+h*k[i]);}
function rk4(u:number,y:State,h:number):State{
  const k1=derivative(u,y),k2=derivative(u+h/2,plus(y,k1,h/2));
  const k3=derivative(u+h/2,plus(y,k2,h/2)),k4=derivative(u+h,plus(y,k3,h));
  return y.map((v,i)=>v+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
}
export function frenetAt(u:number){
  checkU(u);
  const steps=Math.max(1,Math.ceil(1024*u/END)),h=u/steps;
  let state=[...INITIAL];
  for(let i=0;i<steps;i++)state=rk4(i*h,state,h);
  if(!state.every(Number.isFinite))throw Error('三维恢复值不有限。');
  return {point:vec(state,0),tangent:vec(state,3),normal:vec(state,6),
    binormal:vec(state,9)};
}
export function frameAt(u:number){
  const gamma=foldAngle(u),{c,s,angleRate}=rightCoefficients(u);
  const flatCrease:Point2=[Math.cos(u),Math.sin(u)];
  const flatTangent:Point2=[-Math.sin(u),Math.cos(u)];
  const flatNormal:Point2=[-Math.cos(u),-Math.sin(u)];
  const flatLeft=flatNormal;
  const flatRight:Point2=[c*flatTangent[0]-s*flatNormal[0],
    c*flatTangent[1]-s*flatNormal[1]];
  const spatial=frenetAt(u),halfCos=Math.cos(gamma/2),halfSin=Math.sin(gamma/2);
  const foldedLeft=spatial.tangent.map((_,i)=>
    halfCos*spatial.normal[i]+halfSin*spatial.binormal[i]) as Point3;
  const foldedRight=spatial.tangent.map((value,i)=>
    c*value-s*(halfCos*spatial.normal[i]-halfSin*spatial.binormal[i])) as Point3;
  return {u,gamma,flatCrease,flatTangent,flatNormal,flatLeft,flatRight,
    foldedCrease:spatial.point,foldedTangent:spatial.tangent,
    foldedNormal:spatial.normal,foldedBinormal:spatial.binormal,
    foldedLeft,foldedRight,rightSine:s,rightAngularRate:angleRate};
}
export function surface(space:'flat'|'folded',side:Side,u:number,v:number){
  checkV(v);const f=frameAt(u);
  if(space==='flat')return add(f.flatCrease,side==='left'?f.flatLeft:f.flatRight,v) as Point2;
  return add(f.foldedCrease,side==='left'?f.foldedLeft:f.foldedRight,v) as Point3;
}
export function firstForm(side:Side,u:number,v:number){
  checkV(v);const {s,angleRate}=rightCoefficients(u);
  return side==='left'?{E:(1-v)**2,F:0,G:1,jacobian:1-v}:
    {E:1+2*v*angleRate*s+v*v*angleRate*angleRate,
      F:rightCoefficients(u).c,G:1,jacobian:-(s+v*angleRate)};
}
export function sampleIn3988(segments=PREVIEW_SEGMENTS){
  if(!Number.isInteger(segments)||segments<16||segments>192)
    throw Error('只读图示采样须为 16–192 段。');
  const frames=Array.from({length:segments+1},(_,i)=>frameAt(END*i/segments));
  const offsets=(space:'flat'|'folded',side:Side)=>frames.map(f=>
    add(space==='flat'?f.flatCrease:f.foldedCrease,
      space==='flat'?(side==='left'?f.flatLeft:f.flatRight):
        (side==='left'?f.foldedLeft:f.foldedRight),WIDTH));
  return {source:ACROSS_REFOLD_IN3988,frames,
    flatLeftBoundary:offsets('flat','left') as Point2[],
    flatRightBoundary:offsets('flat','right') as Point2[],
    foldedLeftBoundary:offsets('folded','left') as Point3[],
    foldedRightBoundary:offsets('folded','right') as Point3[]};
}

/** Strictly source-derived residuals for use in tests and read-only diagnostics. */
export function sourceResiduals(u:number){
  const f=frameAt(u),{c,s}=rightCoefficients(u);
  const planarCotLeft=dot(f.flatTangent,f.flatLeft)/dot(f.flatNormal,f.flatLeft);
  const planarCotRight=dot(f.flatTangent,f.flatRight)/-dot(f.flatNormal,f.flatRight);
  const gammaPrime=-ANGLE_RATE;
  return {angleODE:gammaPrime/Math.tan(f.gamma/2)-
    (planarCotLeft-planarCotRight),
    torsion:sourceTorsion()-.5*Math.tan(f.gamma/2)*
      (planarCotLeft+planarCotRight),
    leftUnit:dot(f.foldedLeft,f.foldedLeft)-1,
    rightUnit:dot(f.foldedRight,f.foldedRight)-1,
    coefficientNorm:c*c+s*s-1};
}
