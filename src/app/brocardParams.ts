import type {XY} from './tessellation';

export type BrocardKind='angles'|'cyclic'|'triangle'|'trapezoid'|'parallelogram'|'triangle-vertices'|'cyclic-offset';
export type BrocardParams={family:'brocard';clockwise:boolean}&(({scale:number}&(
  {kind:'angles';angles:number[]}|
  {kind:'cyclic';sides:number;angle1:number;angle2:number;index1:number;index2:number}|
  {kind:'triangle';angle1:number;angle2:number}|
  {kind:'trapezoid'|'parallelogram';baseAngle:number}|
  {kind:'triangle-vertices';vertices:XY[]}
))|{kind:'cyclic-offset';sides:number;angle1:number;angle2:number;index1:number;index2:number;width:number;offset:number;centralTypes:('M'|'V')[]});
export const BROCARD_NAMES:Record<BrocardKind,string>={triangle:'三角形内角',trapezoid:'梯形',parallelogram:'平行四边形',angles:'一般多边形内角',cyclic:'圆内接多边形','triangle-vertices':'三点三角形','cyclic-offset':'圆内接偏置单元'};
export function brocardPreset(kind:BrocardKind='triangle'):BrocardParams{
  const base={family:'brocard' as const,scale:.5,clockwise:false};
  if(kind==='cyclic-offset')return {family:'brocard',clockwise:false,kind,sides:4,angle1:90,angle2:90,index1:0,index2:1,width:.5,offset:.08,centralTypes:Array(4).fill('M')};
  if(kind==='angles')return {...base,kind,angles:[65,120,100,75]};
  if(kind==='cyclic')return {...base,kind,sides:5,angle1:100,angle2:110,index1:0,index2:1};
  if(kind==='triangle')return {...base,kind,angle1:60,angle2:65};
  if(kind==='triangle-vertices')return {...base,kind,vertices:[[0,0],[1,0],[.3,.8]]};
  return {...base,kind,baseAngle:65};
}
/** Match the backend contract; derived corner angles are never trusted from a saved file. */
export function readBrocardParams(raw:Record<string,unknown>):BrocardParams|null{
  const kind=raw.kind??'triangle';
  if(typeof kind!=='string'||!Object.hasOwn(BROCARD_NAMES,kind))return null;
  const base=brocardPreset(kind as BrocardKind) as unknown as Record<string,unknown>;
  if(Object.keys(raw).some(k=>!Object.hasOwn(base,k)))return null;
  Object.assign(base,structuredClone(raw));
  const numeric=(k:string,min:number,max:number,integer=false)=>typeof base[k]==='number'&&Number.isFinite(base[k])&&(base[k] as number)>=min&&(base[k] as number)<=max&&(!integer||Number.isInteger(base[k]));
  if(typeof base.clockwise!=='boolean'||(kind!=='cyclic-offset'&&!numeric('scale',.2,.85)))return null;
  if(kind==='angles'){
    if(!Array.isArray(base.angles)||base.angles.length<3||base.angles.length>12||base.angles.some(a=>typeof a!=='number'||!Number.isFinite(a)))return null;
    const angles=base.angles as number[];
    angles[angles.length-1]=(angles.length-2)*180-angles.slice(0,-1).reduce((a,b)=>a+b,0);
    if(angles.some(a=>a<1||a>179))return null;
  }else if(kind==='triangle-vertices'){
    const ps=base.vertices;
    if(!Array.isArray(ps)||ps.length!==3||ps.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>10)))return null;
    const [a,b,c]=ps as XY[];
    if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-10)return null;
  }else if(kind==='trapezoid'||kind==='parallelogram'){
    if(!numeric('baseAngle',1,179))return null;
  }else{
    if(!numeric('angle1',1,179)||!numeric('angle2',1,179))return null;
    if(kind==='triangle'&&(base.angle1 as number)+(base.angle2 as number)>179)return null;
    if((kind==='cyclic'||kind==='cyclic-offset')&&(!numeric('sides',3,12,true)||!numeric('index1',0,(base.sides as number)-1,true)||!numeric('index2',0,(base.sides as number)-1,true)||base.index1===base.index2))return null;
    if(kind==='cyclic-offset'&&(!numeric('width',.05,.8)||!numeric('offset',-.4,.4)||Math.abs(base.offset as number)+(base.width as number)/2>=.5-1e-8||!Array.isArray(base.centralTypes)||base.centralTypes.length!==base.sides||base.centralTypes.some(t=>t!=='M'&&t!=='V')))return null;
  }
  return base as unknown as BrocardParams;
}
