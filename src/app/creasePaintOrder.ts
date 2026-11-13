import type {Segment} from '../core/types';
/** Stable paint order only: never reorder the document or change selection IDs. */
export function creasePaintOrder<T extends Pick<Segment,'assignment'>>(segments:readonly T[]):T[]{
 let auxiliary=0;for(const segment of segments)if(segment.assignment==='A')auxiliary++;
 const ordered=new Array<T>(segments.length);let a=0,b=auxiliary;
 for(const segment of segments)ordered[segment.assignment==='A'?a++:b++]=segment;
 return ordered;
}
