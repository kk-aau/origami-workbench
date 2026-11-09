/** Fixed read-only diagnostic inputs In[3812]/[3816]/[3818]. */
export type Point3=[number,number,number];
export type DarbouxFrame={u:number;c:Point3;t:Point3;l:Point3;n:Point3};
const PI=Math.PI,THETA=PI/4,C=Math.cos(THETA),S=Math.sin(THETA);
const add=(a:Point3,b:Point3,k=1):Point3=>
  [a[0]+k*b[0],a[1]+k*b[1],a[2]+k*b[2]];
const norm=(a:Point3)=>Math.hypot(...a);
function checkU(u:number,lo=0,hi=PI){
  if(!Number.isFinite(u)||u<lo||u>hi)throw Error('u 超出原保存区间。');
}
function checkV(v:number){if(!Number.isFinite(v)||v< -1||v>1)
  throw Error('v 超出原保存区间 [−1,1]。');}

export function savedInput(cell:'3812'|'3816'|'3818'){
  if(cell==='3812'||cell==='3816')return {
    sourceCell:`In[${cell}]`,sourceFunction:cell==='3812'?
      'RecoverDarboux3D':'NRecoverDarboux3D',
    sourceProducts:{speed:1,normalCurvature:1,geodesicCurvature:0,
      geodesicTorsion:0},uRange:[0,PI] as [number,number],
    sourceFrameAt:PI/2,sourceFrameLength:.5,
    numericInterpolationReproduced:false,wolframNumericOutAvailable:false,
    sourceSurfaceOutput:false,exactFOLD:false,adoptablePaper:false};
  if(cell==='3818')return {sourceCell:'In[3818]',
    sourceFunction:'RuledSurfaceNormal',thetaDeg:45,
    uRange:[-.5*PI,1.4*PI] as [number,number],vRange:[-1,1] as [number,number],
    sourceCurveDivisions:200,sourceNormalVectors:11,
    sourceVectorLength:.5,orientations:[1,-1] as [number,number],
    numericInterpolationReproduced:false,wolframNumericOutAvailable:false,
    sourceSurfaceOutput:true,exactFOLD:false,adoptablePaper:false};
  throw Error('仅支持三项固定保存诊断。');
}

/** Closed solution of the source Darboux ODE and initial frame. */
export function analyticDarboux(u:number):DarbouxFrame{
  checkU(u);
  return {u,c:[Math.sin(u),0,1-Math.cos(u)],
    t:[Math.cos(u),0,Math.sin(u)],l:[0,1,0],
    n:[-Math.sin(u),0,Math.cos(u)]};
}
function derivative(a:number[]){
  return [a[3],a[4],a[5],a[9],a[10],a[11],0,0,0,
    -a[3],-a[4],-a[5]];
}
function rk4(a:number[],h:number){
  const k1=derivative(a),k2=derivative(a.map((x,i)=>x+h*k1[i]/2)),
    k3=derivative(a.map((x,i)=>x+h*k2[i]/2)),
    k4=derivative(a.map((x,i)=>x+h*k3[i]));
  return a.map((x,i)=>x+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
}
/** Local RK4 replay of In[3816]'s ODE, not Wolfram's NDSolve interpolation. */
export function numericDarboux(u:number,steps=512):DarbouxFrame{
  checkU(u);
  if(!Number.isInteger(steps)||steps<16||steps>4096)
    throw Error('数值重演步数须在 16–4096。');
  let a=[0,0,0,1,0,0,0,1,0,0,0,1];
  const h=u/steps;
  for(let i=0;i<steps;i++)a=rk4(a,h);
  return {u,c:a.slice(0,3) as Point3,t:a.slice(3,6) as Point3,
    l:a.slice(6,9) as Point3,n:a.slice(9,12) as Point3};
}

/** In[3818]: rotate z around the radial inward axis by 45 degrees. */
export function hyperboloidBase(u:number):Point3{
  checkU(u,-PI/2,1.4*PI);return [Math.cos(u),Math.sin(u),0];
}
export function hyperboloidDirector(u:number):Point3{
  checkU(u,-PI/2,1.4*PI);return [-S*Math.sin(u),S*Math.cos(u),C];
}
export function hyperboloidPoint(u:number,v:number):Point3{
  checkV(v);return add(hyperboloidBase(u),hyperboloidDirector(u),v);
}
export function hyperboloidPartials(u:number,v:number){
  checkV(v);checkU(u,-PI/2,1.4*PI);
  return {du:[-Math.sin(u)-v*S*Math.cos(u),
      Math.cos(u)-v*S*Math.sin(u),0] as Point3,
    dv:hyperboloidDirector(u)};
}
/** RuledSurfaceNormal[{bb,dd,sigma}], with SurfaceOrientation fixed to +1. */
export function hyperboloidNormal(u:number,v:number,sigma:1|-1):Point3{
  checkU(u,-PI/2,1.4*PI);checkV(v);
  if(sigma!==1&&sigma!==-1)throw Error('源例只允许 ±1 两种朝向。');
  const er:Point3=[Math.cos(u),Math.sin(u),0],
    ephi:Point3=[-Math.sin(u),Math.cos(u),0];
  const raw:Point3=[C*er[0]+v*S*C*ephi[0],
    C*er[1]+v*S*C*ephi[1],-v*S*S];
  const size=norm(raw);
  return raw.map(x=>sigma*x/size) as Point3;
}
export function hyperboloidArea(u:number,v:number){
  checkU(u,-PI/2,1.4*PI);checkV(v);
  return Math.hypot(C,v*S);
}

/** In[3795] uses this generalized-cylinder patch, not a circular cylinder. */
export function sinusoidSavedInput(){return {
  sourceCell:'In[3795]',sourceFunction:'Darboux3DSystem',
  surfaceXRange:[-1,.5] as [number,number],surfaceYRange:[-1,1] as [number,number],
  curveRange:[-1,1] as [number,number],sourceFrameAt:.5,
  sourceVectorLength:.3,surfaceOrientation:1,
  numericWolframOutAvailable:false,exactFOLD:false,adoptablePaper:false};}
function checkSinusoid(t:number){if(!Number.isFinite(t)||t< -1||t>1)
  throw Error('In[3795] 的曲线参数须在 [−1,1]。');}
export function sinusoidSurface(x:number,y:number):Point3{
  if(!Number.isFinite(x)||x< -1||x>.5||!Number.isFinite(y)||y< -1||y>1)
    throw Error('In[3795] 的曲面参数超出保存画图区间。');
  return [x,y,1-Math.cos(y)];
}
export function sinusoidCurve(t:number):Point3{
  checkSinusoid(t);return [Math.cos(t)-1,t,1-Math.cos(t)];
}
export function sinusoidFrame(t:number){
  checkSinusoid(t);
  const sin=Math.sin(t),cos=Math.cos(t),p=Math.sqrt(1+2*sin*sin),
    q=Math.sqrt(1+sin*sin);
  const tangent:Point3=[-sin/p,1/p,sin/p];
  const normal:Point3=[-1/(Math.SQRT2*p),-Math.SQRT2*sin/p,
    1/(Math.SQRT2*p)];
  const binormal:Point3=[Math.SQRT1_2,0,Math.SQRT1_2];
  const surfaceNormal:Point3=[0,-sin/q,1/q];
  const tangentNormal:Point3=[-q/p,-sin/(p*q),-sin*sin/(p*q)];
  return {t,point:sinusoidCurve(t),speed:p,tangent,normal,binormal,
    tangentNormal,surfaceNormal,curvature:Math.SQRT2*cos/p**3,torsion:0,
    geodesicCurvature:cos/(p**3*q),normalCurvature:cos/(p*p*q),
    geodesicTorsion:-cos*sin/(p*p*q*q)};
}
export function sampleDiagnostics(kind:'3812'|'3816'|'3818',segments=80){
  if(!Number.isInteger(segments)||segments<20||segments>240)
    throw Error('图示分辨率须在 20–240。');
  const source=savedInput(kind),[lo,hi]=source.uRange;
  const us=Array.from({length:segments+1},(_,i)=>lo+(hi-lo)*i/segments);
  if(kind==='3818')return {source,us,
    base:us.map(hyperboloidBase),
    bottom:us.map(u=>hyperboloidPoint(u,-1)),
    top:us.map(u=>hyperboloidPoint(u,1))};
  return {source,us,curve:us.map(u=>kind==='3812'?
    analyticDarboux(u).c:numericDarboux(u).c)};
}
