import type {Segment} from '../core/types';
/** Stable paint order only: never reorder the document or change selection IDs. */
export function creasePaintOrder<T extends Pick<Segment,'assignment'>>(segments:readonly T[]):T[]{
 return [...segments.filter(s=>s.assignment==='A'),...segments.filter(s=>s.assignment!=='A')];
}
