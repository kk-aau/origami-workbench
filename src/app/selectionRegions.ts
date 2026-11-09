import {collinearOverlap,cross,distance,epsilonFor,interpolate,parameter,pointOnSegment,segmentIntersection,sub} from '../core/geometry';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';

const edge=(a:Point,b:Point):Segment=>({id:'selection-reference',a,b,assignment:'A',angle:0});
function checkPoint(p:Point){if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('选择轮廓坐标须在 ±1000000 mm 内。');}

/** Polygon uses even/odd fill; freehand lasso uses nonzero winding, like GeneralPath. */
function location(p:Point,edges:Segment[],eps:number,lasso:boolean):'inside'|'outside'|'border'{
  let winding=0;
  for(const e of edges){
    if(pointOnSegment(p,e,eps))return 'border';
    const side=cross(sub(e.b,e.a),sub(p,e.a));
    if(e.a[1]<=p[1]&&e.b[1]>p[1]&&side>0)winding++;
    else if(e.a[1]>p[1]&&e.b[1]<=p[1]&&side<0)winding--;
  }
  return (lasso?winding!==0:Math.abs(winding)%2===1)?'inside':'outside';
}

function contour(points:readonly Point[],eps:number):Segment[]{
  points.forEach(checkPoint);
  const clean=points.filter((p,i)=>i===0||distance(p,points[i-1])>eps);
  if(clean.length>1&&distance(clean[0],clean.at(-1)!)<=eps)clean.pop();
  if(clean.length<3||!clean.slice(2).some(p=>Math.abs(cross(sub(clean[1],clean[0]),sub(p,clean[0])))>eps*distance(clean[0],clean[1])))throw new Error('选择轮廓至少需要三个不共线的点。');
  return clean.map((p,i)=>edge(p,clean[(i+1)%clean.length]));
}

/** Whole finite segments only; splitting at every contour contact handles concave shapes. */
export function segmentsInSelectionRegion(doc:Doc,points:readonly Point[],kind:'polygon'|'lasso',lockBoundary=false):Set<string>{
  validateDoc(doc);const eps=epsilonFor(doc),edges=contour(points,eps),lasso=kind==='lasso',hits=new Set<string>();
  for(const s of doc.segments){
    if(lockBoundary&&s.assignment==='B')continue;
    const accepted=(p:Point)=>{const pos=location(p,edges,eps,lasso);return pos==='inside'||(!lasso&&pos==='border');};
    if(!accepted(s.a)||!accepted(s.b))continue;
    const cuts=[0,1];let contact=false;
    for(const e of edges){
      const hit=segmentIntersection(s,e,eps);
      if(hit){cuts.push(Math.max(0,Math.min(1,hit.t)));contact=true;}
      for(const p of [e.a,e.b])if(pointOnSegment(p,s,eps)){cuts.push(Math.max(0,Math.min(1,parameter(p,s))));contact=true;}
      if(collinearOverlap(s,e,eps))contact=true;
    }
    if(lasso&&contact)continue;
    cuts.sort((a,b)=>a-b);
    if(cuts.slice(1).every((t,i)=>accepted(interpolate(s.a,s.b,(t+cuts[i])/2))))hits.add(s.id);
  }
  return hits;
}

/** Matches select_lX: positive collinear overlap or proper X crossing, not T/end contact. */
export function segmentsCrossingSelectionLine(doc:Doc,a:Point,b:Point,lockBoundary=false):Set<string>{
  validateDoc(doc);[a,b].forEach(checkPoint);const eps=epsilonFor(doc),length=distance(a,b),reference=edge(a,b),hits=new Set<string>();
  if(length<=eps)throw new Error('选择参考线的两点不能重合或过近。');
  for(const s of doc.segments){
    if(lockBoundary&&s.assignment==='B')continue;
    const hit=segmentIntersection(reference,s,eps),otherLength=distance(s.a,s.b);
    if(collinearOverlap(reference,s,eps)||hit&&hit.t>eps/length&&hit.t<1-eps/length&&hit.u>eps/otherLength&&hit.u<1-eps/otherLength)hits.add(s.id);
  }
  return hits;
}

/** Selection changes are additive/subtractive, not toggles, and do not edit artwork. */
export function updateRegionSelection(selected:ReadonlySet<string>,hits:Iterable<string>,remove=false):Set<string>{
  const result=new Set(selected);for(const id of hits){if(remove)result.delete(id);else result.add(id);}return result;
}
