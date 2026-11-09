import type {XY} from './tessellation';

/** Bounded numeric In[378] mother polygon, first edge fixed to (0,0)–(1,0). */
export function unitCyclicPolygonVertices(inputAngles:readonly number[],side=1,sideIndex=2):XY[]{
  const n=inputAngles.length;
  if(n<3||n>24||inputAngles.some(angle=>!Number.isFinite(angle)))
    throw Error('圆内接母多边形须有 3–24 个有限内角。');
  if(!Number.isFinite(side)||side<.05||side>5||!Number.isInteger(sideIndex)||
    sideIndex<2||sideIndex>n)
    throw Error('圆内接母图来源边长须在 0.05–5，边号须为第 2 至 n 边。');
  const fixed=inputAngles.slice(0,n%2?n-1:n-2);
  let angles:number[];
  if(n%2)angles=[...fixed,(n-2)*180-fixed.reduce((sum,v)=>sum+v,0)];
  else{
    const remaining=(n-2)*180-fixed.reduce((sum,v)=>sum+v,0);
    const alternating=fixed.reduce((sum,v,i)=>sum+(i%2?-v:v),0);
    angles=[...fixed,(remaining-alternating)/2,(remaining+alternating)/2];
  }
  if(angles.some(angle=>angle<1||angle>179))
    throw Error('指定内角推得退化或非凸的圆内接母多边形。');
  const equations=angles.map(angle=>360-2*angle);
  const zero=[0];
  for(let i=1;i<n;i++)zero.push(equations[i]-zero[i-1]);
  const first=n%2?(equations[0]-zero[n-1])/2:
    -zero.reduce((sum,v,i)=>sum+(i%2?-v:v),0)/n;
  const base=[first];
  for(let i=1;i<n;i++)base.push(equations[i]-base[i-1]);
  if(Math.abs(base[n-1]+base[0]-equations[0])>1e-8||
    Math.abs(base.reduce((sum,v)=>sum+v,0)-360)>1e-8)
    throw Error('内角不能闭合为圆内接母多边形。');
  let adjustment=0;
  if(n%2===0){
    const signs=base.map((_,i)=>i%2?-1:1);
    let lower=Math.max(...base.map((gap,i)=>signs[i]>0?1-gap:gap-179));
    let upper=Math.min(...base.map((gap,i)=>signs[i]>0?179-gap:gap-1));
    if(lower>=upper)throw Error('中心弧角没有非退化的凸形分支。');
    const residual=(shift:number)=>{
      const first=Math.sin((base[0]+shift)*Math.PI/360);
      const chosen=Math.sin((base[sideIndex-1]+signs[sideIndex-1]*shift)*Math.PI/360);
      return chosen/first-side;
    };
    let left=residual(lower),right=residual(upper);
    if(Math.abs(left)<1e-11&&Math.abs(right)<1e-11||left*right>0)
      throw Error('指定边长不能唯一选定当前凸形圆内接母图。');
    if(Math.abs(left)<1e-12)adjustment=lower;
    else if(Math.abs(right)<1e-12)adjustment=upper;
    else{
      for(let i=0;i<90;i++){
        const middle=(lower+upper)/2,value=residual(middle);
        if(Math.abs(value)<1e-13||upper-lower<1e-12){adjustment=middle;break;}
        if(left*value<0){upper=middle;right=value;}
        else{lower=middle;left=value;}
        adjustment=(lower+upper)/2;
      }
    }
  }
  const gaps=base.map((gap,i)=>gap+(i%2?-adjustment:adjustment));
  if(gaps.some(gap=>gap<1-1e-9||gap>179+1e-9))
    throw Error('圆内接母图中心弧角越过凸形分支。');
  const half=gaps[0]*Math.PI/360;
  const radius=.5/Math.sin(half),center:XY=[.5,.5/Math.tan(half)];
  const vertices:XY[]=[[0,0],[1,0]];
  let direction=-Math.PI/2+half;
  for(const gap of gaps.slice(1,-1)){
    direction+=gap*Math.PI/180;
    vertices.push([center[0]+radius*Math.cos(direction),
      center[1]+radius*Math.sin(direction)]);
  }
  const edges=vertices.map((point,i)=>[vertices[(i+1)%n][0]-point[0],
    vertices[(i+1)%n][1]-point[1]] as XY);
  const cross=(a:XY,b:XY)=>a[0]*b[1]-a[1]*b[0];
  if(vertices.length!==n||vertices.some(point=>point.some(v=>!Number.isFinite(v)||Math.abs(v)>100))||
    Math.min(...edges.map(([x,y])=>Math.hypot(x,y)))<1e-6||
    Math.min(...edges.map((edge,i)=>cross(edge,edges[(i+1)%n])))<=1e-9||
    Math.max(...vertices.map(point=>Math.abs(Math.hypot(point[0]-center[0],point[1]-center[1])-radius)))>1e-8||
    n%2===0&&Math.abs(Math.hypot(...edges[sideIndex-1])-side)>1e-8)
    throw Error('圆内接母图退化、非凸或未达到指定边长。');
  return vertices;
}
