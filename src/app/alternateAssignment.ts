import {collinearOverlap,distance,epsilonFor,segmentIntersection} from '../core/geometry';
import {validateDoc,type Assignment,type Doc,type Point,type Segment} from '../core/types';
import {assign,distanceToSegment} from './state';

export type AlternateMode='collinear'|'crossing';
export interface AlternateHit {id:string;assignment:Assignment;order:number;distance:number}

/** Collinear alternation starts with the first hit's M/V; crossing uses the preset. */
export function alternateAssignmentHits(doc:Doc,start:Point,end:Point,mode:AlternateMode,first:Assignment,lockBoundary=false):AlternateHit[]{
  validateDoc(doc);
  if(mode!=='collinear'&&mode!=='crossing')throw new Error('请选择共线或横截交替模式。');
  if(!['M','V','B','A','U','F'].includes(first))throw new Error('请选择有效的起始线型。');
  for(const p of [start,end])if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('参考线坐标须在 ±1000000 mm 内。');
  const eps=epsilonFor(doc),length=distance(start,end);
  if(length<=eps)throw new Error('参考线两点不能重合或过近。');
  const reference:Segment={id:'alternate-reference',a:start,b:end,assignment:'A',angle:0};
  const hits:{id:string;distance:number;sourceAssignment:Assignment}[]=[];
  for(const s of doc.segments){
    if(lockBoundary&&s.assignment==='B')continue;
    if(mode==='collinear'){
      if(collinearOverlap(reference,s,eps))hits.push({id:s.id,distance:distanceToSegment(start,s),sourceAssignment:s.assignment});
    }else{
      const hit=segmentIntersection(reference,s,eps),segmentLength=distance(s.a,s.b);
      // The existing segment must be hit in its interior; either endpoint of
      // the reference may touch it. This differs from select_lX / delete_lX.
      if(hit&&hit.u>eps/segmentLength&&hit.u<1-eps/segmentLength)
        hits.push({id:s.id,distance:Math.max(0,Math.min(length,hit.t*length)),sourceAssignment:s.assignment});
    }
  }
  hits.sort((a,b)=>a.distance-b.distance);
  const initial=mode==='collinear'&&hits.length?hits[0].sourceAssignment:first;
  if(mode==='collinear'&&hits.length&&initial!=='M'&&initial!=='V')throw new Error('起点朝终点方向的第一段不是山折或谷折，请先给首段指定山谷类型。');
  return hits.map(({sourceAssignment:_,...hit},i)=>({...hit,order:i+1,assignment:initial==='M'||initial==='V'?(i%2?(initial==='M'?'V':'M'):initial):initial}));
}

/** Whole existing fragments are recolored; the reference never becomes a crease. */
export function applyAlternateAssignment(doc:Doc,start:Point,end:Point,mode:AlternateMode,first:Assignment,lockBoundary=false):{doc:Doc;hits:AlternateHit[];changed:number}{
  const hits=alternateAssignmentHits(doc,start,end,mode,first,lockBoundary),targets=new Map(hits.map(h=>[h.id,h.assignment]));
  let changed=0;
  const segments=doc.segments.map(s=>{
    const type=targets.get(s.id);
    if(type===undefined||type===s.assignment)return s;
    changed++;return assign([s],new Set([s.id]),type)[0];
  });
  if(!changed)return{doc,hits,changed};
  const result={...doc,segments};validateDoc(result);return{doc:result,hits,changed};
}
