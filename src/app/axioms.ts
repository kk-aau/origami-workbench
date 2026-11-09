import {cross,distance,sub} from '../core/geometry';
import type {Doc,Point,Segment} from '../core/types';
import {validateDoc} from '../core/types';
import {reflectionEnd} from './reflection';
import {lineTarget} from './segmentTools';

export interface AxiomFold {origin:Point;direction:Point;mapped:Point}
function point(p:Point){
  if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('公理构造坐标无效或超出范围。');
}
function basis(line:Segment,eps:number){
  point(line.a);point(line.b);const length=distance(line.a,line.b);
  if(length<=eps)throw new Error('参考线长度为零或过短。');
  return[(line.b[0]-line.a[0])/length,(line.b[1]-line.a[1])/length] as Point;
}
function normalize(p:Point):Point{const length=Math.hypot(...p);return[p[0]/length,p[1]/length];}
function checked(fold:AxiomFold):AxiomFold{point(fold.origin);point(fold.mapped);return fold;}

/** Axiom 5: a fold through pivot reflects A onto the target SUPPORTING line.
 * Circle-line intersections enumerate all destinations without angle guessing. */
export function axiom5(a:Point,target:Segment,pivot:Point,eps=1e-6):AxiomFold[]{
  point(a);point(pivot);const u=basis(target,eps),radius=distance(a,pivot);
  if(radius<=eps)throw new Error('映射点与必经点不能重合或过近。');
  const signed=cross(u,sub(pivot,target.a)),signedA=cross(u,sub(a,target.a));
  if(Math.abs(signed)<=eps&&Math.abs(signedA)<=eps)throw new Error('两个点均在目标直线上，请选择线外点以确定有效公理构造。');
  if(Math.abs(signed)>radius+eps)throw new Error('公理 5 无解：必经点到目标直线的距离大于两点距离。');
  const foot:Point=[pivot[0]+u[1]*signed,pivot[1]-u[0]*signed];
  const h=Math.sqrt(Math.max(0,(radius-Math.abs(signed))*(radius+Math.abs(signed))));
  const mappedPoints:Point[]=h<=eps?[foot]:[[foot[0]+u[0]*h,foot[1]+u[1]*h],[foot[0]-u[0]*h,foot[1]-u[1]*h]];
  return mappedPoints.sort((p,q)=>p[0]-q[0]||p[1]-q[1]).map(mapped=>{
    // A already at this destination: the fixed-point crease must contain A.
    const delta=sub(mapped,a),direction=distance(mapped,a)<=eps?normalize(sub(a,pivot)):normalize([-delta[1],delta[0]]);
    return checked({origin:[...pivot],direction,mapped});
  });
}

/** Axiom 7: A moves parallel to reference, so its perpendicular bisector is
 * the required crease perpendicular to reference. */
export function axiom7(a:Point,target:Segment,reference:Segment,eps=1e-6):AxiomFold{
  point(a);const u=basis(target,eps),v=basis(reference,eps),signed=cross(u,sub(a,target.a));
  if(Math.abs(signed)<=eps)throw new Error('映射点已在目标直线上，请选择线外点。');
  const denominator=cross(u,v);
  if(Math.abs(denominator)<=1e-10)throw new Error('目标线与垂直参考线平行或近似平行，公理 7 无唯一稳定解。');
  const t=-signed/denominator,mapped:Point=[a[0]+t*v[0],a[1]+t*v[1]];
  return checked({origin:[a[0]+t*v[0]/2,a[1]+t*v[1]/2],direction:[-v[1],v[0]],mapped});
}

/** Explicit finite cutoff, in either direction from the construction origin.
 * Unlike upstream supporting-line cutoff, extensions of the selected segment
 * are not silently used, consistent with this workbench's cutoff convention. */
export function axiomCutoff(fold:AxiomFold,target:Segment,eps=1e-6):{a:Point;b:Point}{
  const end=lineTarget(fold.origin,fold.direction,target,eps);
  if(distance(end,fold.origin)<=eps)throw new Error('截止线经过构造起点，不能生成零长折线。');
  point(end);return{a:[...fold.origin],b:end};
}

/** A full candidate requires actual intersections on BOTH sides; the anchor
 * is not an implicit paper edge, and neither endpoint is fabricated. */
export function axiomFullSegment(doc:Doc,fold:AxiomFold,eps=1e-6):{a:Point;b:Point}{
  validateDoc(doc);const ends:Point[]=[];
  for(const sign of [-1,1]){
    let nearest:Point|undefined,min=Infinity;
    for(const s of doc.segments){
      if(s.assignment==='A')continue;
      try{const hit=reflectionEnd({origin:fold.origin,direction:[sign*fold.direction[0],sign*fold.direction[1]]},s,eps),d=distance(fold.origin,hit);if(d<min){nearest=hit;min=d;}}catch{/* Not a finite forward hit. */}
    }
    if(!nearest)throw new Error('候选折线某侧没有实际截止线；请补充纸边或改用指定截止线。');
    ends.push(nearest);
  }
  return{a:ends[0],b:ends[1]};
}
