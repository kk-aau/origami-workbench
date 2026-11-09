import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import { distance, epsilonFor, parameter, pointOnSegment } from '../core/geometry';
import { divideSegment, trimSegment } from './segmentTools';

export function insertVertex(doc:Doc,source:Segment,position:Point,tolerance:number):Segment[] {
  const projected=trimSegment(source,'b',position,tolerance,epsilonFor(doc)).b;
  return divideSegment(doc,source,[parameter(projected,source)]);
}

function mergePair(doc:Doc,position:Point,lockBoundary=false):{first:Segment;second:Segment;a:Point;b:Point} {
  const eps=epsilonFor(doc);
  if(!position.every(Number.isFinite))throw new Error('顶点坐标无效。');
  const touching=doc.segments.filter(s=>pointOnSegment(position,s,eps));
  if(touching.length!==2)throw new Error('只能合并恰好连接两条线段的顶点；T 形、交叉和孤立端点不可合并。');
  const [first,second]=touching;
  if(lockBoundary&&touching.some(s=>s.assignment==='B'))throw new Error('边界保护已开启，不能合并纸边顶点。');
  const outer=(s:Segment):Point=>{
    if(distance(s.a,position)<=eps)return s.b;
    if(distance(s.b,position)<=eps)return s.a;
    throw new Error('请选择两条线段共有的端点。');
  };
  const a=outer(first),b=outer(second),da:Point=[a[0]-position[0],a[1]-position[1]],db:Point=[b[0]-position[0],b[1]-position[1]];
  if(distance(a,position)<=eps||distance(b,position)<=eps||da[0]*db[0]+da[1]*db[1]>=0||!pointOnSegment(position,{...first,a,b},eps))throw new Error('只能合并共线且方向相反的两段，不能删除折角或重叠线。');
  return{first,second,a,b};
}

export function mergeVertex(doc:Doc,position:Point,lockBoundary=false):{point:Point;ids:string[];segment:Segment} {
  const {first,second,a,b}=mergePair(doc,position,lockBoundary);
  if(first.assignment!==second.assignment||first.angle!==second.angle)throw new Error('两段的线型与折角必须相同，不能静默改变山谷或未知折角。');
  return{point:position,ids:[first.id,second.id],segment:{...first,a:[...a],b:[...b]}};
}

/** Mode 41: B+M -> M, B+V -> V, M+V -> B; mixed auxiliary is forbidden.
 * Unlike upstream colour-only data, fold-angle conflicts require an explicit
 * choice. Undefined means no choice; null deliberately means unspecified.
 */
export function mergeCrossTypeVertex(doc:Doc,position:Point,lockBoundary=false,resolvedAngle?:number|null):{point:Point;ids:string[];segment:Segment} {
  validateDoc(doc);
  const {first,second,a,b}=mergePair(doc,position,lockBoundary);
  const x=first.assignment,y=second.assignment;
  let assignment:Segment['assignment'],angle:number|null;
  if(x===y){
    assignment=x;
    if(first.angle===second.angle)angle=first.angle;
    else if((x==='M'||x==='V')&&resolvedAngle!==undefined)angle=resolvedAngle;
    else throw new Error('两段折角不同，请明确选择合并后的折角（也可设为未指定）。');
  }else if((x==='M'&&y==='V')||(x==='V'&&y==='M')){assignment='B';angle=0;}
  else if(x==='B'&&(y==='M'||y==='V')){assignment=y;angle=second.angle;}
  else if(y==='B'&&(x==='M'||x==='V')){assignment=x;angle=first.angle;}
  else throw new Error('跨线型合点仅支持边界与山谷组合；辅助、未指派、平面边只能同类型合并。');
  const segment:Segment={...first,a:[...a],b:[...b],assignment,angle};
  validateDoc({...doc,segments:[...doc.segments.filter(s=>s.id!==first.id&&s.id!==second.id),segment]});
  return{point:[...position],ids:[first.id,second.id],segment};
}

/** First two points are an edge; screen coordinates have positive Y downwards. */
export function regularPolygon(a:Point,b:Point,count:number,clockwise=true,eps=1e-6):Point[] {
  if(!Number.isInteger(count)||count<3||count>64)throw new Error('边数必须是 3–64 的整数。');
  if(![...a,...b].every(Number.isFinite)||distance(a,b)<=eps)throw new Error('首边两端不能重合或使用无效坐标。');
  const angle=(clockwise?1:-1)*2*Math.PI/count,c=Math.cos(angle),s=Math.sin(angle),vertices:Point[]=[[...a],[...b]];
  let dx=b[0]-a[0],dy=b[1]-a[1];
  for(let i=2;i<count;i++){
    [dx,dy]=[dx*c-dy*s,dx*s+dy*c];const previous=vertices.at(-1)!;
    vertices.push([previous[0]+dx,previous[1]+dy]);
  }
  if(vertices.some(p=>p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('多边形超出坐标范围，请缩短首边或减少边数。');
  return vertices;
}
