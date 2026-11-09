import {distance,epsilonFor,cross,sub,parameter,interpolate} from '../core/geometry';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {distanceToSegment} from './state';
import {swapGeneratedLines} from './drawingSwap';

export function toggleMirrorSelection(selected:ReadonlySet<string>,hits:Iterable<string>):Set<string>{
  const result=new Set(selected);for(const id of new Set(hits)){if(result.has(id))result.delete(id);else result.add(id);}return result;
}

/** Convex envelope of the finite result, used only as a visible confirmation area. */
export function mirrorEnvelope(segments:readonly Segment[]):Point[]{
  const points=[...new Map(segments.flatMap(s=>[s.a,s.b]).map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(points.length<3)return points;
  const half=(list:Point[])=>{const chain:Point[]=[];for(const p of list){while(chain.length>1&&cross(sub(chain.at(-1)!,chain.at(-2)!),sub(p,chain.at(-1)!))<=0)chain.pop();chain.push(p);}return chain;};
  const lower=half(points),upper=half([...points].reverse());return [...lower.slice(0,-1),...upper.slice(0,-1)];
}

export function inMirrorRegion(point:Point,segments:readonly Segment[],radius:number):boolean{
  if(segments.some(s=>distanceToSegment(point,s)<=radius))return true;
  const hull=mirrorEnvelope(segments);if(hull.length<3)return false;
  return hull.every((a,i)=>cross(sub(hull[(i+1)%hull.length],a),sub(point,a))>=0);
}

function checkPoint(p:Point){if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('镜像坐标超出范围（±1000000 mm）。');}
/** Reflection in the infinite axis through a and b; no assignment/angle reversal. */
export function reflectPoint(p:Point,a:Point,b:Point,eps=1e-6):Point {
  [p,a,b].forEach(checkPoint);const length=distance(a,b);
  if(length<=eps)throw new Error('对称轴两点不能重合或过近，请重新选择第二点。');
  const nx=-(b[1]-a[1])/length,ny=(b[0]-a[0])/length,h=(p[0]-a[0])*nx+(p[1]-a[1])*ny;
  const result:Point=[p[0]-2*h*nx,p[1]-2*h*ny];checkPoint(result);return result;
}

/** Keep the exact reflected supporting line while joining a nearby target. */
function joinNearEndpoint(endpoint:Point,other:Point,targets:readonly Segment[],tolerance:number,eps:number):Point{
  if(tolerance<=eps)return endpoint;
  const direction=sub(endpoint,other),length=Math.hypot(...direction);
  let best:Point=endpoint,bestDistance=tolerance+eps;
  for(const target of targets){
    const tangent=sub(target.b,target.a),targetLength=Math.hypot(...tangent),denominator=cross(direction,tangent);
    if(targetLength<=eps||Math.abs(denominator)<=1e-8*length*targetLength)continue;
    const offset=sub(target.a,other),t=cross(offset,tangent)/denominator,u=cross(offset,direction)/denominator;
    if(u<-eps/targetLength||u>1+eps/targetLength)continue;
    const hit=interpolate(other,endpoint,t),shift=distance(hit,endpoint);
    if(shift<=eps||shift>=bestDistance||distance(hit,other)<=eps)continue;
    best=hit;bestDistance=shift;
  }
  return best;
}

/** Build finite copies for overlay; matching old intervals need no new geometry. */
export function mirrorCopies(doc:Doc,ids:readonly string[],a:Point,b:Point,lockBoundary=false,joinTolerance=0,swapGenerated=false):Segment[] {
  validateDoc(doc);const eps=epsilonFor(doc),unique=new Set(ids);
  if(!unique.size)throw new Error('请先用选择工具选中需要镜像的线段。');
  const sources=doc.segments.filter(s=>unique.has(s.id));
  if(sources.length!==unique.size)throw new Error('原线段已变化，请重新选择。');
  if(lockBoundary&&sources.some(s=>s.assignment==='B'))throw new Error('边界保护已开启，请取消保护后再镜像纸边。');
  return uncoveredCopies(doc,swapGeneratedLines(sources.map(source=>{
    if(distance(source.a,source.b)<=eps)throw new Error('选区含零长或过短线段，请先整理。');
    const first=reflectPoint(source.a,a,b,eps),second=reflectPoint(source.b,a,b,eps);
    return {...source,a:joinNearEndpoint(first,second,doc.segments,joinTolerance,eps),b:joinNearEndpoint(second,first,doc.segments,joinTolerance,eps)};
  }),swapGenerated));
}

/** Matching coverage is redundant; different types/angles are replaced on commit. */
export function uncoveredCopies(doc:Doc,candidates:readonly Segment[],tag='mirror',operation='镜像',allowFullyCovered=false):Segment[]{
  validateDoc(doc);const eps=epsilonFor(doc);
  const used=new Set([...doc.segments.map(s=>s.id),...(doc.objects??[]).map(o=>o.id)]),copies:Segment[]=[];
  for(const source of candidates){
    if(distance(source.a,source.b)<=eps)throw new Error('选区含零长或过短线段，请先整理。');
    const reflected=source,length=distance(reflected.a,reflected.b),v=sub(reflected.b,reflected.a);
    let covered:[number,number][]=[];
    for(const existing of [...doc.segments,...copies]){
      if(distance(existing.a,existing.b)<=eps)continue;
      if([existing.a,existing.b].some(p=>Math.abs(cross(sub(p,reflected.a),v))>eps*length))continue;
      const t1=parameter(existing.a,reflected),t2=parameter(existing.b,reflected),start=Math.max(0,Math.min(t1,t2)),end=Math.min(1,Math.max(t1,t2));
      if((end-start)*length<=eps)continue;
      if(existing.assignment===source.assignment&&existing.angle===source.angle)covered.push([start,end]);
      else{
        // A later, different line masks older matching coverage. Keep the new
        // candidate there so the final overlay still honors batch order.
        covered=covered.flatMap(([a,b]):[number,number][]=>{
          if(b<=start||a>=end)return[[a,b]];
          const tails:[number,number][]=[];
          if(a<start)tails.push([a,start]);
          if(b>end)tails.push([end,b]);
          return tails;
        });
      }
    }
    let cursor=0;const intervals:[number,number][]=[];
    for(const [start,end] of covered.sort((x,y)=>x[0]-y[0])){if((start-cursor)*length>eps)intervals.push([cursor,start]);cursor=Math.max(cursor,end);}
    if((1-cursor)*length>eps)intervals.push([cursor,1]);
    for(const [start,end] of intervals){let suffix=1,id=source.id+'::'+tag+':'+suffix;while(used.has(id))id=source.id+'::'+tag+':'+ ++suffix;used.add(id);copies.push({...source,id,a:interpolate(reflected.a,reflected.b,start),b:interpolate(reflected.a,reflected.b,end)});}
  }
  if(!copies.length&&!allowFullyCovered)throw new Error(`${operation}结果已存在，无需重复生成；请调整构造。`);
  validateDoc({...doc,segments:[...doc.segments,...copies]});return copies;
}
