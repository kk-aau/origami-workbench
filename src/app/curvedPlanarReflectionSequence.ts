/** Fixed In[4039]/In[4040]/In[4043] continuous mirror sequences.
 * The numeric example is replayed from exact source expressions, not from
 * Wolfram's FunctionInterpolation values. No straight-crease FOLD is made.
 */
export type ReflectionSequenceCase='cone-symbolic'|'cylinder-symbolic'|'cone-numeric-input';
export type Point3=[number,number,number];
export type Point2=[number,number];
export type Plane={point:Point3;normal:Point3};

const THETA=Math.PI/6,TILT=Math.PI/18,CASES:ReflectionSequenceCase[]=
  ['cone-symbolic','cylinder-symbolic','cone-numeric-input'];
const isCone=(kind:ReflectionSequenceCase)=>kind!=='cylinder-symbolic';
const dot=(a:Point3,b:Point3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add=(a:Point3,b:Point3):Point3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const subtract=(a:Point3,b:Point3):Point3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a:Point3,k:number):Point3=>[k*a[0],k*a[1],k*a[2]];
const reflectPoint=(x:Point3,plane:Plane):Point3=>subtract(x,
  scale(plane.normal,2*dot(subtract(x,plane.point),plane.normal)));
const reflectVector=(x:Point3,plane:Plane):Point3=>subtract(x,
  scale(plane.normal,2*dot(x,plane.normal)));

function checkCase(kind:ReflectionSequenceCase){
  if(!CASES.includes(kind))throw Error('仅支持三组固定保存输入。');
}
function planes(kind:ReflectionSequenceCase):Plane[]{
  checkCase(kind);
  if(isCone(kind)){
    const s=Math.sin(TILT),c=Math.cos(TILT);
    return [
      {point:[0,0,1],normal:[0,0,1]},
      {point:[0,0,2],normal:[0,-s,c]},
      {point:[0,0,3],normal:[s,0,c]},
      {point:[0,0,4],normal:[0,0,1]},
    ];
  }
  const n:Point3=[-Math.SQRT1_2,0,Math.SQRT1_2];
  return [{point:[1,0,1],normal:n},{point:[2,0,1],normal:n}];
}
function source(kind:ReflectionSequenceCase,u:number,v:number):Point3{
  if(isCone(kind))return [v*Math.sin(THETA)*Math.cos(u),
    v*Math.sin(THETA)*Math.sin(u),v*Math.cos(THETA)];
  return [Math.cos(u),Math.sin(u),v];
}
function director(kind:ReflectionSequenceCase,u:number):Point3{
  if(isCone(kind))return [Math.sin(THETA)*Math.cos(u),
    Math.sin(THETA)*Math.sin(u),Math.cos(THETA)];
  return [0,0,1];
}
function checkU(kind:ReflectionSequenceCase,u:number){
  checkCase(kind);
  const [lo,hi]=sequenceInput(kind).uRange;
  if(!Number.isFinite(u)||u<lo||u>hi)throw Error('参数超出保存区间。');
}
export function sequenceInput(kind:ReflectionSequenceCase){
  checkCase(kind);
  const cone=isCone(kind);
  return {kind,sourceCells:kind==='cone-symbolic'?['In[4038]','In[4039]']:
    cone?['In[4042]','In[4043]']:['In[4038]','In[4040]'],
    sourceSurface:cone?'z-axis cone':'unit half-cylinder',
    composeReflections:cone,uRange:(cone?[0,Math.PI]:[-Math.PI/4,Math.PI/4]) as Point2,
    outerRuling:cone?4/Math.cos(THETA):3,planes:planes(kind),
    curveCount:cone?5:4,patchCount:cone?4:3,
    continuousLocalIsometryVerified:true,regularAtApex:!cone,
    numericInterpolationReproduced:false,exactStraightCreaseFOLD:false,
    adoptableCreasePattern:false,mountainValleyVerified:false,
    layerOrderVerified:false,motionVerified:false,selfCollisionVerified:false};
}
export function stageSurface(kind:ReflectionSequenceCase,u:number,v:number,stage:number):Point3{
  checkU(kind,u);const all=planes(kind);
  if(!Number.isInteger(stage)||stage<0||stage>all.length||!Number.isFinite(v))
    throw Error('反射阶段或母线参数无效。');
  let x=source(kind,u,v);
  // True: R1∘R2∘...∘Ri. False: R_i∘...∘R2∘R1.
  if(isCone(kind))for(let i=stage-1;i>=0;i--)x=reflectPoint(x,all[i]);
  else for(let i=0;i<stage;i++)x=reflectPoint(x,all[i]);
  return x;
}
export function stageDirector(kind:ReflectionSequenceCase,u:number,stage:number):Point3{
  checkU(kind,u);const all=planes(kind);
  if(!Number.isInteger(stage)||stage<0||stage>all.length)throw Error('反射阶段无效。');
  let d=director(kind,u);
  if(isCone(kind))for(let i=stage-1;i>=0;i--)d=reflectVector(d,all[i]);
  else for(let i=0;i<stage;i++)d=reflectVector(d,all[i]);
  return d;
}
export function cutDistances(kind:ReflectionSequenceCase,u:number):number[]{
  checkU(kind,u);const result=[0],all=planes(kind);
  for(let i=0;i<all.length;i++){
    const {point,normal}=all[i];
    const base=isCone(kind)?source(kind,u,0):stageSurface(kind,u,0,i);
    const d=isCone(kind)?director(kind,u):stageDirector(kind,u,i);
    const denominator=dot(d,normal);
    if(Math.abs(denominator)<1e-12)throw Error('保存平面与母线平行。');
    result.push(dot(subtract(point,base),normal)/denominator);
  }
  if(!isCone(kind))result.push(3);
  const outer=isCone(kind)?4/Math.cos(THETA):3;
  if(result.some((value,i)=>i>0&&value<=result[i-1]+1e-10)||
    Math.abs(result.at(-1)!-outer)>1e-10)
    throw Error('保存切平面没有形成有序曲带。');
  return result;
}
export function savedCurve(kind:ReflectionSequenceCase,u:number,index:number):Point3{
  const cuts=cutDistances(kind,u);
  if(!Number.isInteger(index)||index<0||index>=cuts.length)throw Error('曲线编号无效。');
  return stageSurface(kind,u,cuts[index],Math.max(index-1,0));
}
export function flatPoint(kind:ReflectionSequenceCase,u:number,v:number):Point2{
  checkU(kind,u);
  if(!Number.isFinite(v))throw Error('母线参数无效。');
  if(isCone(kind))return [v*Math.cos(u*Math.sin(THETA)),v*Math.sin(u*Math.sin(THETA))];
  return [v,u];
}
export function metric(kind:ReflectionSequenceCase,v:number){
  checkCase(kind);
  if(!Number.isFinite(v))throw Error('母线参数无效。');
  return {E:isCone(kind)?v*v*Math.sin(THETA)**2:1,F:0,G:1,
    regular:isCone(kind)?v>0:true};
}

export type SequenceSample={input:ReturnType<typeof sequenceInput>;uValues:number[];
  distances:number[][];curves3D:Point3[][];curves2D:Point2[][]};
export function sampleSequence(kind:ReflectionSequenceCase,segments=64):SequenceSample{
  if(!Number.isInteger(segments)||segments<16||segments>256)
    throw Error('显示分段须为 16–256 的整数。');
  const input=sequenceInput(kind),[lo,hi]=input.uRange;
  const uValues=Array.from({length:segments+1},(_,i)=>lo+(hi-lo)*i/segments);
  const distances=uValues.map(u=>cutDistances(kind,u));
  const curves3D=Array.from({length:input.curveCount},(_,curve)=>
    uValues.map(u=>savedCurve(kind,u,curve)));
  const curves2D=Array.from({length:input.curveCount},(_,curve)=>
    uValues.map((u,i)=>flatPoint(kind,u,distances[i][curve])));
  return {input,uValues,distances,curves3D,curves2D};
}
