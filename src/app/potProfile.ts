import {readRadialPotParams,type RadialPotParams} from './radialPotParams';
import {readRectangularPotParams,type RectangularPotParams} from './rectangularPotParams';
import {readTwistedPotParams,type TwistedPotParams} from './twistedPotParams';
import type {XY} from './tessellation';

export type PotProfileParams=RadialPotParams|RectangularPotParams|TwistedPotParams;

export function potProfileLimits(params:PotProfileParams){
  if(params.family==='twisted-pot')return {min:4,max:Math.min(12,Math.floor((500/params.sectors+5)/3))};
  const panels=params.family==='rectangular-pot'?params.panels:params.sectors;
  return {min:params.family==='rectangular-pot'?2:3,max:Math.min(24,Math.floor(600/(5*panels))+1)};
}

export function readPotProfile(params:PotProfileParams,points:unknown):PotProfileParams|null{
  const value={...params,crossSection:points};
  return params.family==='radial-pot'?readRadialPotParams(value):params.family==='rectangular-pot'?readRectangularPotParams(value):readTwistedPotParams(value);
}

/** Explain rejected drafts without widening the constructors' accepted domain. */
export function potProfileError(params:PotProfileParams,points:unknown):string{
  const limits=potProfileLimits(params);
  if(!Array.isArray(points)||points.length<limits.min||points.length>limits.max)return `当前扇区配置允许 ${limits.min}–${limits.max} 个剖面点。`;
  if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>20)))return '每点需两个有限坐标，范围为 −20 至 20。';
  const section=points as XY[];
  if(readPotProfile(params,section))return '';
  const axis=params.family==='rectangular-pot'?0:section[0][0];
  const invalidRadius=section.findIndex(([x],i)=>params.family==='twisted-pot'&&i>0?x-axis<=1e-7:x-axis< -1e-10);
  if(invalidRadius>=0)return `点 ${invalidRadius+1} 的半径越过旋转轴${params.family==='twisted-pot'?'或落在轴上':''}。`;
  if(params.family!=='rectangular-pot'&&section[1][0]-axis<=1e-8)return '首段须从旋转轴向外展开。';
  if(params.family==='twisted-pot'&&Math.abs(section[1][1]-section[0][1])>1e-10)return '扭转壶体的首段必须水平；前两个点的高度须相同。';
  const repeated=section.findIndex((p,i)=>i>0&&Math.hypot(p[0]-section[i-1][0],p[1]-section[i-1][1])<1e-8);
  if(repeated>=0)return `点 ${repeated} 与点 ${repeated+1} 重合。`;
  const heights=section.slice(1).map((p,i)=>p[1]-section[i][1]);
  const start=Math.abs(heights[0])<1e-9?1:0;
  for(let i=start;i<heights.length;i++){
    if(Math.abs(heights[i])<1e-9)return `点 ${i+1} 与点 ${i+2} 等高；仅第一段可以水平。`;
    if(Math.sign(heights[i])!==Math.sign(heights[start]))return `点 ${i+2} 改变了高度方向；剖面须持续上升或持续下降。`;
  }
  return '该剖面不满足当前壶体构造约束，请调整点位或减少点数。';
}

export function readPotProfileJson(params:PotProfileParams,text:string):XY[]{
  let points:unknown;
  try{points=JSON.parse(text);}catch{throw Error('坐标 JSON 格式无效，请输入 [[半径,高度],…]。');}
  const error=potProfileError(params,points);
  if(error)throw Error(error);
  return (points as XY[]).map(p=>[...p]);
}

/** A single scale for both axes keeps the small preview faithful to the section. */
export function potProfilePreview(points:XY[]):{drawn:XY[];radius:number;height:number}{
  const minX=Math.min(0,...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
  const width=maxX-minX,height=maxZ-minZ,scale=Math.min(90/Math.max(width,1e-8),84/Math.max(height,1e-8));
  return {drawn:points.map(([x,z])=>[55+(x-(minX+maxX)/2)*scale,52-(z-(minZ+maxZ)/2)*scale]),radius:maxX,height};
}
