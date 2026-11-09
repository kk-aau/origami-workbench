import type {Point} from '../core/types';
import {pointBounds} from '../core/pointBounds';

export function parseModelRotation(text:string):number{
  const value=text.trim();
  if(!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value))throw new Error('请输入有效旋转角度。');
  const angle=Number(value);
  if(!Number.isFinite(angle)||Math.abs(angle)>360000)throw new Error('旋转角度须在 −360000° 至 360000° 之间。');
  const remainder=angle%360;
  return remainder<0?remainder+360:remainder===0?0:remainder;
}

/** Display rotation follows back-side mirroring; inverse deltas never include translations. */
export function modelProjectionCenter(vertices:Point[]):Point {
  const {minX,minY,maxX,maxY}=pointBounds(vertices);
  return vertices.length?[(minX+maxX)/2,(minY+maxY)/2]:[0,0];
}

export function modelProjection(vertices:Point[],back:boolean,degrees=0,center?:Point){
  if(!Number.isFinite(degrees)||vertices.some(p=>p.length!==2||!p.every(Number.isFinite)))throw new Error('模型视图变换无效。');
  if(center&&(center.length!==2||!center.every(Number.isFinite)))throw new Error('模型视图中心无效。');
  const [cx,cy]=center??modelProjectionCenter(vertices);
  const angle=(degrees%360)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),sign=back?-1:1;
  return {
    project:([x,y]:Point):Point=>{const dx=(x-cx)*sign,dy=y-cy;return [cx+c*dx-s*dy,cy+s*dx+c*dy];},
    unprojectDelta:([x,y]:Point):Point=>[sign*(c*x+s*y),-s*x+c*y]
  };
}
