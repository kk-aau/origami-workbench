/** Fixed In[3826]/In[3830] canonical developable systems and derived flat maps. */
export type CanonicalCase='cylinder-in3826'|'cone-in3830';
export type Point2=[number,number];
export type Point3=[number,number,number];

const THETA=Math.PI/6;
const CYLINDER_RANGE:Point2=[-Math.PI/4,3*Math.PI/4];
const CONE_RANGE:Point2=[0,Math.PI];
const isCone=(kind:CanonicalCase)=>kind==='cone-in3830';
function checkCase(kind:CanonicalCase){
  if(kind!=='cylinder-in3826'&&kind!=='cone-in3830')
    throw Error('仅支持 In[3826]/In[3830] 的固定保存输入。');
}
function checkU(kind:CanonicalCase,u:number){
  checkCase(kind);
  const [lo,hi]=isCone(kind)?CONE_RANGE:CYLINDER_RANGE;
  if(!Number.isFinite(u)||u<lo||u>hi)throw Error('参数 u 超出保存区间。');
}
function checkV(v:number){if(!Number.isFinite(v))throw Error('母线参数须为有限数值。');}
const dot=(a:Point3,b:Point3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=(a:Point3)=>Math.hypot(...a);

export function savedInput(kind:CanonicalCase){
  checkCase(kind);const cone=isCone(kind);
  return {kind,sourceCell:cone?'In[3830]':'In[3826]',
    sourceFunction:cone?'CanonicalConeDevelopableSystem':
      'CanonicalCylinderDevelopableSystem',
    inputRange:cone?[...CONE_RANGE] as Point2:[...CYLINDER_RANGE] as Point2,
    displayedRulingRange:[0,1] as Point2,
    sourceDirectorLength:2,sourceSurfaceInputRulingRange:[0,1] as Point2,
    savedConeAngleDeg:cone?30:null,
    canonicalDirectorUnit:true,
    canonicalCylinderDirectrixOrthogonal:!cone,
    crossCurveAliasesSurface:true,
    flatDevelopmentDerivedLocally:true,
    regularAtFirstRuling:!cone,
    numericWolframOutAvailable:false,
    exactStraightCreaseFOLD:false,adoptableCreasePattern:false,
    motionVerified:false,selfCollisionVerified:false};
}

/** Raw, non-normalized source directrix and director. */
export function rawDirectrix(kind:CanonicalCase,u:number):Point3{
  checkU(kind,u);
  return isCone(kind)?[0,0,.5]:[Math.cos(u),Math.sin(u),2*u];
}
export function rawDirector(kind:CanonicalCase,u:number):Point3{
  checkU(kind,u);
  if(isCone(kind))return [2*Math.cos(THETA),
    2*Math.sin(THETA)*Math.sin(u),-2*Math.sin(THETA)*Math.cos(u)];
  return [0,0,2];
}
export function rawPoint(kind:CanonicalCase,u:number,lambda:number):Point3{
  checkV(lambda);
  const b=rawDirectrix(kind,u),d=rawDirector(kind,u);
  return b.map((value,i)=>value+lambda*d[i]) as Point3;
}

/** In[3825]/In[3829]: unit director; cylinder also projects b perpendicular. */
export function canonicalDirector(kind:CanonicalCase,u:number):Point3{
  const d=rawDirector(kind,u),size=length(d);
  return d.map(x=>x/size) as Point3;
}
export function canonicalDirectrix(kind:CanonicalCase,u:number):Point3{
  const b=rawDirectrix(kind,u),d=canonicalDirector(kind,u);
  if(isCone(kind))return b;
  const parallel=dot(b,d);
  return b.map((value,i)=>value-parallel*d[i]) as Point3;
}
export function canonicalPoint(kind:CanonicalCase,u:number,v:number):Point3{
  checkV(v);
  const b=canonicalDirectrix(kind,u),d=canonicalDirector(kind,u);
  return b.map((value,i)=>value+v*d[i]) as Point3;
}
/** The source assigns the same expression to CrossCurveSurface and DevelopableSurface. */
export const crossCurvePoint=canonicalPoint;

/** Local 2D isometric development derived for comparison, not notebook output. */
export function derivedFlatPoint(kind:CanonicalCase,u:number,v:number):Point2{
  checkU(kind,u);checkV(v);
  if(isCone(kind))return [v*Math.cos(Math.sin(THETA)*u),
    v*Math.sin(Math.sin(THETA)*u)];
  return [u,v];
}
export function firstForm(kind:CanonicalCase,v:number){
  checkCase(kind);checkV(v);
  return isCone(kind)?{E:v*v*Math.sin(THETA)**2,F:0,G:1,
    area:Math.abs(v*Math.sin(THETA)),regular:v>0}:
    {E:1,F:0,G:1,area:1,regular:true};
}
export function sampleCanonical(kind:CanonicalCase,segments=72,rulingSteps=8){
  if(!Number.isInteger(segments)||segments<16||segments>192||
    !Number.isInteger(rulingSteps)||rulingSteps<2||rulingSteps>16)
    throw Error('图示只允许 16–192 段和 2–16 段母线。');
  const source=savedInput(kind),[lo,hi]=source.inputRange;
  const uValues=Array.from({length:segments+1},(_,i)=>lo+(hi-lo)*i/segments);
  const vValues=Array.from({length:rulingSteps+1},(_,i)=>i/rulingSteps);
  return {source,uValues,vValues,
    rawBase:uValues.map(u=>rawDirectrix(kind,u)),
    rawTip:uValues.map(u=>rawPoint(kind,u,1)),
    canonicalBase:uValues.map(u=>canonicalDirectrix(kind,u)),
    canonicalTip:uValues.map(u=>canonicalPoint(kind,u,1)),
    canonicalGrid:vValues.map(v=>uValues.map(u=>canonicalPoint(kind,u,v))),
    flatGrid:vValues.map(v=>uValues.map(u=>derivedFlatPoint(kind,u,v)))};
}
