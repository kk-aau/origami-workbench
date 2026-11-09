/** Numeric function families for the original In[3825]/In[3829] rules. */
import type {CanonicalCase,Point2,Point3} from './curvedCanonicalConeCylinderIn3826';

type Common={kind:CanonicalCase;directorLength:number;rulingStart:number;
  rulingEnd:number;segments:number;rulingSteps:number};
export type CanonicalInputQuery=Common&(
  {kind:'cylinder-in3826';radius:number;axialPitch:number}|
  {kind:'cone-in3830';angleDeg:number;apexZ:number});
export const CANONICAL_INPUT_PRESETS:Record<CanonicalCase,CanonicalInputQuery>={
  'cylinder-in3826':{kind:'cylinder-in3826',radius:1,axialPitch:2,
    directorLength:2,rulingStart:0,rulingEnd:1,segments:72,rulingSteps:8},
  'cone-in3830':{kind:'cone-in3830',angleDeg:30,apexZ:.5,
    directorLength:2,rulingStart:0,rulingEnd:1,segments:72,rulingSteps:8},
};
const object=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown,low:number,high:number,label:string)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)
    throw Error(`${label}须为 ${low}–${high} 的有限数值。`);
  return value;
};
export function validateCanonicalInputQuery(value:unknown):CanonicalInputQuery{
  if(!object(value)||(value.kind!=='cylinder-in3826'&&value.kind!=='cone-in3830'))
    throw Error('请选择规范柱面或规范锥面函数族。');
  const commonKeys=['kind','directorLength','rulingStart','rulingEnd','segments','rulingSteps'],
    keys=[...commonKeys,...(value.kind==='cylinder-in3826'?['radius','axialPitch']:['angleDeg','apexZ'])];
  if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))
    throw Error('规范面参数必须完整且不能包含无关字段。');
  const directorLength=finite(value.directorLength,.1,6,'原母线长度'),
    rulingStart=finite(value.rulingStart,0,2,'规范母线起点'),
    rulingEnd=finite(value.rulingEnd,.2,3,'规范母线终点'),
    segments=finite(value.segments,16,192,'曲线段数'),
    rulingSteps=finite(value.rulingSteps,2,16,'母线段数');
  if(rulingEnd-rulingStart<.05-1e-12)throw Error('母线裁宽须至少为 0.05。');
  if(!Number.isInteger(segments)||!Number.isInteger(rulingSteps))
    throw Error('采样段数须为整数。');
  const common={directorLength,rulingStart,rulingEnd,segments,rulingSteps};
  return value.kind==='cylinder-in3826'?{...common,kind:value.kind,
    radius:finite(value.radius,.1,3,'柱面半径'),
    axialPitch:finite(value.axialPitch,-4,4,'输入基线轴向斜率')}:
    {...common,kind:value.kind,angleDeg:finite(value.angleDeg,15,75,'锥半角'),
      apexZ:finite(value.apexZ,-3,3,'锥顶高度')};
}
export function matchesCanonicalSavedInput(query:CanonicalInputQuery){
  const q=validateCanonicalInputQuery(query),common=q.directorLength===2&&
    q.rulingStart===0&&q.rulingEnd===1;
  return common&&(q.kind==='cylinder-in3826'?q.radius===1&&q.axialPitch===2:
    q.angleDeg===30&&q.apexZ===.5);
}
export function canonicalInputRange(query:CanonicalInputQuery):Point2{
  return query.kind==='cone-in3830'?[0,Math.PI]:[-Math.PI/4,3*Math.PI/4];
}
function checkPoint(q:CanonicalInputQuery,u:number,v?:number){
  const [lo,hi]=canonicalInputRange(q);
  if(!Number.isFinite(u)||u<lo||u>hi)throw Error('基线参数超出完整源区间。');
  if(v!==undefined&&(!Number.isFinite(v)||v<q.rulingStart||v>q.rulingEnd))
    throw Error('母线位置超出当前有限片。');
}
export function canonicalRawFrame(input:CanonicalInputQuery,u:number){
  const q=validateCanonicalInputQuery(input);checkPoint(q,u);
  if(q.kind==='cylinder-in3826')return {
    b:[q.radius*Math.cos(u),q.radius*Math.sin(u),q.axialPitch*u] as Point3,
    d:[0,0,q.directorLength] as Point3};
  const theta=q.angleDeg*Math.PI/180,L=q.directorLength;
  return {b:[0,0,q.apexZ] as Point3,
    d:[L*Math.cos(theta),L*Math.sin(theta)*Math.sin(u),
      -L*Math.sin(theta)*Math.cos(u)] as Point3};
}
/** Apply the actual source normalization and cylinder projection operations. */
export function canonicalInputFrame(input:CanonicalInputQuery,u:number){
  const {b,d}=canonicalRawFrame(input,u),length=Math.hypot(...d),
    unit=d.map(value=>value/length) as Point3;
  if(input.kind==='cone-in3830')return {b,d:unit};
  const parallel=b.reduce((sum,value,i)=>sum+value*unit[i],0);
  return {b:b.map((value,i)=>value-parallel*unit[i]) as Point3,d:unit};
}
export function canonicalInputPoint(q:CanonicalInputQuery,u:number,v:number):Point3{
  const input=validateCanonicalInputQuery(q);checkPoint(input,u,v);
  const {b,d}=canonicalInputFrame(input,u);
  return b.map((value,i)=>value+v*d[i]) as Point3;
}
export function canonicalInputFlatPoint(q:CanonicalInputQuery,u:number,v:number):Point2{
  const input=validateCanonicalInputQuery(q);checkPoint(input,u,v);
  if(input.kind==='cylinder-in3826')return [input.radius*u,v];
  const phi=Math.sin(input.angleDeg*Math.PI/180)*u;
  return [v*Math.cos(phi),v*Math.sin(phi)];
}
export function canonicalInputFirstForm(q:CanonicalInputQuery,v:number){
  const input=validateCanonicalInputQuery(q);checkPoint(input,canonicalInputRange(input)[0],v);
  const area=input.kind==='cone-in3830'?v*Math.sin(input.angleDeg*Math.PI/180):input.radius;
  return {E:area**2,F:0,G:1,area,regular:area>0};
}
function source(q:CanonicalInputQuery){return {
  referenceCell:q.kind==='cone-in3830'?'In[3830]':'In[3826]',
  definitionCell:q.kind==='cone-in3830'?'In[3829]':'In[3825]',
  function:q.kind==='cone-in3830'?'CanonicalConeDevelopableSystem':'CanonicalCylinderDevelopableSystem',
  matchesSavedInput:matchesCanonicalSavedInput(q),flatDevelopmentDerivedLocally:true,
  wolframNumericOut:false};}
function certification(q:CanonicalInputQuery){
  const cone=q.kind==='cone-in3830',regular=!cone||q.rulingStart>0;
  return {unitDirectorAnalytic:true,cylinderProjectionAnalytic:!cone,
    continuousIsometryAnalytic:true,developableAnalytic:true,
    completeFiniteDomain:true,regularClosedDomain:regular,
    minimumJacobian:cone?q.rulingStart*Math.sin(q.angleDeg*Math.PI/180):q.radius,
    includesSingularApex:cone&&q.rulingStart===0,
    globalInjectiveRegularDomain:true,globalInjectiveClosedDomain:regular,
    sameFinitePatchAsRawInput:q.rulingStart===0&&q.rulingEnd===q.directorLength&&
      (cone||q.axialPitch===0),paperThickness:0,
    sampledMeshExactFOLD:false,adoptableCreasePattern:false,
    deploymentPathChecked:false};
}
export type CanonicalInputResult={family:'origamica-canonical-parameterized';
  query:CanonicalInputQuery;source:ReturnType<typeof source>;
  certification:ReturnType<typeof certification>;uValues:number[];vValues:number[];
  rawBase:Point3[];rawTip:Point3[];canonicalBase:Point3[];canonicalTip:Point3[];
  canonicalGrid:Point3[][];flatGrid:Point2[][]};
/** Independent closed coordinates used to verify procedural source-rule output. */
function closedCoordinates(q:CanonicalInputQuery,u:number,v:number){
  if(q.kind==='cylinder-in3826'){
    const x=q.radius*Math.cos(u),y=q.radius*Math.sin(u);
    return {rawBase:[x,y,q.axialPitch*u],rawTip:[x,y,q.axialPitch*u+q.directorLength],
      space:[x,y,v],flat:[q.radius*u,v]};
  }
  const a=q.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),phi=s*u;
  return {rawBase:[0,0,q.apexZ],rawTip:[q.directorLength*c,
    q.directorLength*s*Math.sin(u),q.apexZ-q.directorLength*s*Math.cos(u)],
    space:[v*c,v*s*Math.sin(u),q.apexZ-v*s*Math.cos(u)],
    flat:[v*Math.cos(phi),v*Math.sin(phi)]};
}
function compare(actual:unknown,expected:unknown,path:string):void{
  if(typeof expected==='number'){
    if(typeof actual!=='number'||!Number.isFinite(actual)||
      Math.abs(actual-expected)>1e-9*Math.max(1,Math.abs(expected)))
      throw Error(`规范面回读数值异常：${path}。`);
  }else if(Array.isArray(expected)){
    if(!Array.isArray(actual)||actual.length!==expected.length)
      throw Error(`规范面回读数组异常：${path}。`);
    expected.forEach((value,i)=>compare(actual[i],value,`${path}[${i}]`));
  }else if(object(expected)){
    if(!object(actual)||Object.keys(actual).length!==Object.keys(expected).length||
      Object.keys(expected).some(key=>!Object.hasOwn(actual,key)))
      throw Error(`规范面回读字段异常：${path}。`);
    Object.entries(expected).forEach(([key,value])=>compare(actual[key],value,`${path}.${key}`));
  }else if(actual!==expected)throw Error(`规范面回读标记异常：${path}。`);
}
/** Reject altered query, provenance, singular claims or any corresponding point. */
export function parseCanonicalInputResult(raw:unknown,requested?:CanonicalInputQuery):CanonicalInputResult{
  if(!object(raw)||!object(raw.query))throw Error('规范面回读格式异常。');
  const rawQuery=raw.query,q=validateCanonicalInputQuery(rawQuery);
  // Query identity is exact: tolerance applies only to numerical geometry.
  if(requested&&Object.entries(validateCanonicalInputQuery(requested)).some(([key,value])=>rawQuery[key]!==value))
    throw Error('规范面回读参数与请求不一致。');
  const [lo,hi]=canonicalInputRange(q),uValues=Array.from({length:q.segments+1},(_,i)=>
    i===q.segments?hi:lo+(hi-lo)*i/q.segments),
    vValues=Array.from({length:q.rulingSteps+1},(_,i)=>i===q.rulingSteps?q.rulingEnd:
      q.rulingStart+(q.rulingEnd-q.rulingStart)*i/q.rulingSteps),
    coords=uValues.map(u=>closedCoordinates(q,u,q.rulingStart)),
    expected={family:'origamica-canonical-parameterized',query:q,source:source(q),
      certification:certification(q),uValues,vValues,
      rawBase:coords.map(point=>point.rawBase),rawTip:coords.map(point=>point.rawTip),
      canonicalBase:coords.map(point=>point.space),
      canonicalTip:uValues.map(u=>closedCoordinates(q,u,q.rulingEnd).space),
      canonicalGrid:vValues.map(v=>uValues.map(u=>closedCoordinates(q,u,v).space)),
      flatGrid:vValues.map(v=>uValues.map(u=>closedCoordinates(q,u,v).flat))};
  compare(raw,expected,'result');
  return raw as unknown as CanonicalInputResult;
}
export function evaluateCanonicalInput(input:unknown):CanonicalInputResult{
  const query=validateCanonicalInputQuery(input),q=query,[lo,hi]=canonicalInputRange(q),
    uValues=Array.from({length:q.segments+1},(_,i)=>i===q.segments?hi:lo+(hi-lo)*i/q.segments),
    vValues=Array.from({length:q.rulingSteps+1},(_,i)=>i===q.rulingSteps?q.rulingEnd:
      q.rulingStart+(q.rulingEnd-q.rulingStart)*i/q.rulingSteps),
    frames=uValues.map(u=>canonicalRawFrame(q,u));
  return parseCanonicalInputResult({family:'origamica-canonical-parameterized',query,
    source:source(q),certification:certification(q),uValues,vValues,
    rawBase:frames.map(frame=>frame.b),
    rawTip:frames.map(({b,d})=>b.map((value,i)=>value+d[i])),
    canonicalBase:uValues.map(u=>canonicalInputPoint(q,u,q.rulingStart)),
    canonicalTip:uValues.map(u=>canonicalInputPoint(q,u,q.rulingEnd)),
    canonicalGrid:vValues.map(v=>uValues.map(u=>canonicalInputPoint(q,u,v))),
    flatGrid:vValues.map(v=>uValues.map(u=>canonicalInputFlatPoint(q,u,v)))},query);
}
