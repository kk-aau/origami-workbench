import {validateDoc,type Doc} from '../core/types';
import {swap} from './state';
import {directAssignmentHits} from './directAssignment';
import type {TypeFilterArea} from './typeFilter';

/** Same nearest-first, document-order ties and touching box as direct M/V painting.
 * Filter only AFTER picking, so auxiliary/unknown lines cannot be clicked through.
 */
export function regionalSwapHits(doc:Doc,area:TypeFilterArea,lockBoundary=false):Set<string>{
  const candidates=directAssignmentHits(doc,area,'M',lockBoundary);
  return new Set(doc.segments.filter(s=>candidates.has(s.id)&&(s.assignment==='M'||s.assignment==='V')).map(s=>s.id));
}
export function applyRegionalSwap(doc:Doc,area:TypeFilterArea,lockBoundary=false):{doc:Doc;matched:number;changed:number}{
  const hits=regionalSwapHits(doc,area,lockBoundary);
  return applySelectedFoldSwap(doc,hits);
}

/** Exchange explicit selected M/V identities without expanding to a region or
 * changing boundary, auxiliary, flat or unknown lines in that selection. */
export function applySelectedFoldSwap(doc:Doc,selection:ReadonlySet<string>):{doc:Doc;matched:number;changed:number}{
  validateDoc(doc);
  const hits=new Set(doc.segments.filter(segment=>selection.has(segment.id)&&(segment.assignment==='M'||segment.assignment==='V')).map(segment=>segment.id));
  if(!hits.size)return{doc,matched:0,changed:0};
  const result={...doc,segments:swap(doc.segments,hits)};
  validateDoc(result);return{doc:result,matched:hits.size,changed:hits.size};
}
