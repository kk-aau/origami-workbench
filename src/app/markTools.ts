import {validateDoc,type Doc,type Point} from '../core/types';
import {distance} from '../core/geometry';
import {pickEraseSegment,segmentsInBox} from './erase';

export const MARK_COLOR='#e58a24';
export function appendMark(doc:Doc,a:Point,b:Point,color=MARK_COLOR):Doc{
  if(!a.every(Number.isFinite)||!b.every(Number.isFinite)||distance(a,b)<=1e-6)throw new Error('标记线两端须为有效且不重合的点。');
  const used=new Set([...doc.segments,...doc.objects??[]].map(o=>o.id));
  let id='mark',n=1;while(used.has(id))id=`mark:${++n}`;
  const next:Doc={...doc,objects:[...doc.objects??[],{kind:'mark',id,a:[...a],b:[...b],color}]};
  validateDoc(next);return next;
}
/** Temporary hit-test geometry only; never saved, split or passed to a folding solver. */
function markGeometry(doc:Doc):Doc{return {...doc,segments:(doc.objects??[]).flatMap(o=>o.kind==='mark'?[{id:o.id,a:o.a,b:o.b,assignment:'A' as const,angle:0}]:[])};}
export function markHits(doc:Doc,area:{kind:'point';point:Point;radius:number}|{kind:'box';a:Point;b:Point}):Set<string>{
  const geometry=markGeometry(doc);
  if(area.kind==='box')return segmentsInBox(geometry,area.a,area.b,false);
  const id=pickEraseSegment(geometry,area.point,area.radius,false);return new Set(id?[id]:[]);
}
export function deleteMarks(doc:Doc,ids:ReadonlySet<string>):Doc{
  if(!doc.objects?.some(o=>o.kind==='mark'&&ids.has(o.id)))return doc;
  return {...doc,objects:doc.objects.filter(o=>o.kind!=='mark'||!ids.has(o.id))};
}
