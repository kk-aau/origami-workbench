/** Fixed saved inputs In[3833]/[3834]/[3837]–[3839]; read-only continuous geometry. */
export type SavedCase='tangent-clipped-3833'|'tangent-both-3834'|
  'general-cylinder-3837'|'general-cone-3838'|'general-tangent-3839';
export type Point2=[number,number];
export type Point3=[number,number,number];
const C=Math.sqrt(3)/2,S=.5,PI=Math.PI;
const CASES:SavedCase[]=['tangent-clipped-3833','tangent-both-3834',
  'general-cylinder-3837','general-cone-3838','general-tangent-3839'];
const isTangent=(kind:SavedCase)=>kind==='tangent-clipped-3833'||
  kind==='tangent-both-3834'||kind==='general-tangent-3839';
const isClipped=(kind:SavedCase)=>kind==='tangent-clipped-3833'||
  kind==='general-tangent-3839';
function checkKind(kind:SavedCase){if(!CASES.includes(kind))
  throw Error('仅支持 In[3833]/[3834]/[3837]–[3839] 的固定保存输入。');}
function checkU(kind:SavedCase,u:number){checkKind(kind);if(!Number.isFinite(u)||u<0||u>PI)
  throw Error('u 超出保存区间 [0,π]。');}
function checkV(kind:SavedCase,v:number){checkKind(kind);
  const lo=kind==='general-cylinder-3837'?-1:0;
  const hi=isTangent(kind)?PI:1;
  if(!Number.isFinite(v)||v<lo||v>hi)
    throw Error('v 超出该保存例的图示区间。');}
const add=(a:Point3,b:Point3,scale=1):Point3=>
  [a[0]+scale*b[0],a[1]+scale*b[1],a[2]+scale*b[2]];

export function savedInput(kind:SavedCase){
  checkKind(kind);
  const cell=kind.split('-').at(-1)!;
  return {kind,sourceCell:`In[${cell}]`,sourceFunction:kind.startsWith('tangent-')?
      'CanonicalTangentDevelopableSystem':'CanonicalDevelopableSystem',
    uRange:[0,PI] as Point2,
    vRange:(kind==='general-cylinder-3837'?[-1,1]:
      isTangent(kind)?[0,PI]:[0,1]) as Point2,
    savedAngleDeg:kind==='general-cylinder-3837'?null:30,
    branch:isClipped(kind)?'positive-clipped':kind==='tangent-both-3834'?
      'both':'single-regular-and-boundary',
    scrambledInput:kind.startsWith('general-'),
    flatDevelopmentDerivedLocally:true,numericWolframOutAvailable:false,
    exactStraightCreaseFOLD:false,adoptableCreasePattern:false,
    motionVerified:false,selfCollisionVerified:false};
}

/** Original unit ruling (helix tangent, vertical cylinder, or cone generator). */
export function sourceDirector(kind:SavedCase,u:number):Point3{
  checkU(kind,u);
  if(isTangent(kind))return [-C*Math.sin(u),C*Math.cos(u),S];
  if(kind==='general-cone-3838')return [C,S*Math.sin(u),-S*Math.cos(u)];
  return [0,0,1];
}
export function seedDirectrix(kind:SavedCase,u:number):Point3{
  checkU(kind,u);
  if(isTangent(kind))return [C*Math.cos(u),C*Math.sin(u),S*u];
  if(kind==='general-cone-3838')return [0,0,.5];
  return [Math.cos(u),Math.sin(u),0];
}
/** In[3837]–[3839] scramble the known directrix by +u D. */
export function sourceDirectrix(kind:SavedCase,u:number):Point3{
  const b=seedDirectrix(kind,u),d=sourceDirector(kind,u);
  return kind.startsWith('general-')?add(b,d,u):b;
}
export function sourcePoint(kind:SavedCase,u:number,w:number):Point3{
  if(!Number.isFinite(w))throw Error('母线参数须为有限数值。');
  return add(sourceDirectrix(kind,u),sourceDirector(kind,u),w);
}
/** Source striction/projection removes uD for these exact three saved inputs. */
export function canonicalDirectrix(kind:SavedCase,u:number):Point3{
  const b=sourceDirectrix(kind,u),d=sourceDirector(kind,u);
  return kind.startsWith('general-')?add(b,d,-u):b;
}
export function canonicalDirector(kind:SavedCase,u:number){return sourceDirector(kind,u);}
export function developablePoint(kind:SavedCase,u:number,w:number):Point3{
  if(!Number.isFinite(w))throw Error('母线参数须为有限数值。');
  return add(canonicalDirectrix(kind,u),canonicalDirector(kind,u),w);
}
/** The notebook's CrossCurveSurface parameter; v is arc-length on the helix. */
export function crossCurvePoint(kind:SavedCase,u:number,v:number):Point3{
  checkU(kind,u);checkV(kind,v);
  return developablePoint(kind,u,isTangent(kind)?v-u:v);
}
/** In[3833]/[3839] replace v<u by the directrix in their plot-only wrapper. */
export function savedPlotPoint(kind:SavedCase,u:number,v:number):Point3{
  checkU(kind,u);checkV(kind,v);
  return isClipped(kind)&&v<u?canonicalDirectrix(kind,u):crossCurvePoint(kind,u,v);
}

const tangentFlatBase=(u:number):Point2=>[Math.sin(C*u)/C,-Math.cos(C*u)/C];
const tangentFlatDirector=(u:number):Point2=>[Math.cos(C*u),Math.sin(C*u)];
/** Independently derived 2D isometric development; not a source output. */
export function flatCrossPoint(kind:SavedCase,u:number,v:number):Point2{
  checkU(kind,u);checkV(kind,v);
  if(isTangent(kind)){
    const b=tangentFlatBase(u),d=tangentFlatDirector(u),w=v-u;
    return [b[0]+w*d[0],b[1]+w*d[1]];
  }
  if(kind==='general-cone-3838')return [v*Math.cos(S*u),v*Math.sin(S*u)];
  return [u,v];
}
export function flatSavedPlotPoint(kind:SavedCase,u:number,v:number):Point2{
  checkU(kind,u);checkV(kind,v);
  return isClipped(kind)&&v<u?tangentFlatBase(u):flatCrossPoint(kind,u,v);
}
export function firstForm(kind:SavedCase,u:number,v:number){
  checkU(kind,u);checkV(kind,v);
  if(isTangent(kind)){
    const area=C*Math.abs(v-u);
    return {E:area*area,F:0,G:1,area,
      regular:area>0,branch:v>u?'positive':v<u?'negative':'regression'};
  }
  if(kind==='general-cone-3838'){
    const area=S*Math.abs(v);
    return {E:area*area,F:0,G:1,area,
      regular:v!==0,branch:v===0?'apex':'positive'};
  }
  return {E:1,F:0,G:1,area:1,regular:true,branch:'cylinder'};
}
export function plotV(kind:SavedCase,u:number,t:number){
  checkU(kind,u);
  if(!Number.isFinite(t)||t<0||t>1)throw Error('图示归一化参数须在 [0,1]。');
  const [lo,hi]=savedInput(kind).vRange;
  return isClipped(kind)?u+t*(PI-u):lo+t*(hi-lo);
}
export function sampleSaved(kind:SavedCase,divisions=64,rulingSteps=12){
  if(!Number.isInteger(divisions)||divisions<16||divisions>192||
    !Number.isInteger(rulingSteps)||rulingSteps<2||rulingSteps>32)
    throw Error('图示分辨率超出 16–192 / 2–32 的有界范围。');
  const input=savedInput(kind);
  const uValues=Array.from({length:divisions+1},(_,i)=>PI*i/divisions);
  const tValues=Array.from({length:rulingSteps+1},(_,i)=>i/rulingSteps);
  return {input,uValues,tValues,
    sourceBase:uValues.map(u=>sourceDirectrix(kind,u)),
    sourceTip:uValues.map(u=>sourcePoint(kind,u,1)),
    plotGrid:tValues.map(t=>uValues.map(u=>savedPlotPoint(kind,u,plotV(kind,u,t)))),
    flatGrid:tValues.map(t=>uValues.map(u=>flatSavedPlotPoint(kind,u,plotV(kind,u,t))))};
}
