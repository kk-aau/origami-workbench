import { cross, distance, epsilonFor, sub } from '../core/geometry';
import { defaultAngle, validateDoc, type Assignment, type Doc, type Point, type Segment } from '../core/types';
import { uncoveredCopies } from './mirror';
import {applyDrawingFoldAngle} from './foldAngles';
import {swapGeneratedLines} from './drawingSwap';

/** INWARD_8: three vertex-to-incenter creases, all in the current line type.
 * The triangle sides are references, not newly drawn creases. */
export function rabbitEar(doc:Doc,points:readonly Point[],assignment:Assignment,drawingAngle?:number|null,swapGenerated=false){
  validateDoc(doc);
  if(points.length!==3||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('兔耳构造需要三个有效坐标点。');
  const [a,b,c]=points,eps=epsilonFor(doc);
  const weights=[distance(b,c),distance(c,a),distance(a,b)],perimeter=weights.reduce((sum,n)=>sum+n,0);
  if(Math.min(...weights)<=eps)throw new Error('三个顶点不能重合或过近，请重新选择。');
  // Twice area / longest side = minimum altitude. Avoid unstable thin triangles.
  if(Math.abs(cross(sub(b,a),sub(c,a)))/Math.max(...weights)<=eps)throw new Error('三个顶点不能共线或几乎共线，请重新选择第三点。');
  const center:Point=[0,0];
  points.forEach((p,i)=>{center[0]+=p[0]*(weights[i]/perimeter);center[1]+=p[1]*(weights[i]/perimeter);});
  const rays=swapGeneratedLines(applyDrawingFoldAngle(points.map((p,i):Segment=>({id:`rabbit-ear-${i+1}`,a:[...p],b:[...center],assignment,angle:defaultAngle(assignment)})),drawingAngle),swapGenerated);
  const copies=uncoveredCopies(doc,rays,'rabbit-ear','兔耳构造');
  return{center,rays,copies};
}
