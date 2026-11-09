import {collinearOverlap,distance,epsilonFor} from '../core/geometry';
import {validateDoc,type Doc,type Segment} from '../core/types';
import {splitEditableSegmentsWithMap} from './planarize';

/** Auxiliary strokes cannot replace structural lines. Main strokes may replace
 * auxiliary coverage; within either layer the later stroke wins. */
export function overlayDrawnSegments(doc:Doc,drawn:Segment[],lockBoundary=false):Doc{
  return overlayDrawnSegmentsWithIds(doc,drawn,lockBoundary).doc;
}

/** Keep exact inserted descendants separate from old lines split by this operation. */
export function overlayDrawnSegmentsWithIds(doc:Doc,drawn:Segment[],lockBoundary=false):{doc:Doc;drawnIds:string[]}{
  if(!drawn.length)return {doc,drawnIds:[]};
  validateDoc(doc);
  validateDoc({...doc,segments:[...doc.segments,...drawn]});
  const eps=epsilonFor(doc);
  for(const line of drawn){
    if(distance(line.a,line.b)<=eps)throw new Error('起点和终点不能重合或过近。');
    if(lockBoundary&&line.assignment!=='A'&&doc.segments.some(old=>old.assignment==='B'&&collinearOverlap(old,line,eps)))
      throw new Error('边界保护已开启，不能覆盖纸张边界。');
  }
  const split=splitEditableSegmentsWithMap({...doc,segments:[...doc.segments,...drawn]});
  const newOrder=new Map(drawn.flatMap((line,index)=>(split.descendants.get(line.id)??[]).map(id=>[id,index] as const)));
  const segments=split.doc.segments.filter(piece=>!drawn.some((line,index)=>(line.assignment!=='A'||piece.assignment==='A')&&index>(newOrder.get(piece.id)??-1)&&collinearOverlap(piece,line,eps)));
  const result={...doc,segments};validateDoc(result);
  return {doc:JSON.stringify(result)===JSON.stringify(doc)?doc:result,drawnIds:segments.filter(piece=>newOrder.has(piece.id)).map(piece=>piece.id)};
}
