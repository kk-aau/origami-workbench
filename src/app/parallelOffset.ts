import {defaultAngle,type Assignment,type Segment} from '../core/types';
import {distance} from '../core/geometry';

/** Finite offsets of the entire source, not extended construction rays. */
export function parallelOffsets(source:Segment,width:number,preset:Assignment,eps=1e-6):Segment[]{
  if(!Number.isFinite(width)||width<=eps||width>1e6)throw new Error('平行距离必须大于零且不超过 1000000 mm。');
  if([source.a,source.b].some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('参考线坐标无效。');
  const length=distance(source.a,source.b);if(length<=eps)throw new Error('参考线为零长或过短。');
  const nx=-(source.b[1]-source.a[1])/length,ny=(source.b[0]-source.a[0])/length;
  return[1,-1].map((side,i)=>{
    const result:Segment={...source,id:`${source.id}::offset-candidate:${i+1}`,a:[source.a[0]+nx*width*side,source.a[1]+ny*width*side],b:[source.b[0]+nx*width*side,source.b[1]+ny*width*side],assignment:preset,angle:defaultAngle(preset)};
    if([...result.a,...result.b].some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('平移后的线段超出坐标范围，请减小距离。');
    return result;
  });
}
