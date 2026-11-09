import {collinearOverlap,epsilonFor} from '../core/geometry';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {segmentsCrossingSelectionLine} from './selectionRegions';

export type LineEraseMode='overlap'|'crossing';

/** Delete whole existing fragments, never cut a new hole along the reference line. */
export function lineEraseHits(doc:Doc,a:Point,b:Point,mode:LineEraseMode,lockBoundary=false):Set<string>{
  if(mode!=='overlap'&&mode!=='crossing')throw new Error('请选择共线删除或横截删除模式。');
  // Shared finite-reference validation and X/overlap classification with selection.
  const crossing=segmentsCrossingSelectionLine(doc,a,b,lockBoundary);
  if(mode==='crossing')return crossing;
  const reference:Segment={id:'erase-reference',a,b,assignment:'A',angle:0},eps=epsilonFor(doc);
  return new Set(doc.segments.filter(s=>crossing.has(s.id)&&collinearOverlap(reference,s,eps)).map(s=>s.id));
}

/** Pure proposal; normal commit owns history. Circles/annotations and original doc remain intact. */
export function eraseAlongLine(doc:Doc,a:Point,b:Point,mode:LineEraseMode,lockBoundary=false):{doc:Doc;removedIds:Set<string>}{
  const removedIds=lineEraseHits(doc,a,b,mode,lockBoundary);
  if(!removedIds.size)return{doc,removedIds};
  const result={...doc,segments:doc.segments.filter(s=>!removedIds.has(s.id))};validateDoc(result);
  return{doc:result,removedIds};
}
