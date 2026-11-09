import {validateDoc,type Doc} from '../core/types';
import {assign} from './state';

/** Oriedita mode 4: B -> M -> V -> B, excluding non-folding types. */
export function cycleCrease(doc:Doc,id:string,lockBoundary=false):Doc{
  validateDoc(doc);const source=doc.segments.find(s=>s.id===id);
  if(!source)throw new Error('线段已变化，请重新点击。');
  if(source.assignment==='B'&&lockBoundary)throw new Error('边界保护已开启，不能修改纸边线型。');
  const next=source.assignment==='B'?'M':source.assignment==='M'?'V':source.assignment==='V'?'B':null;
  if(!next)throw new Error('循环仅适用于边界、山折和谷折；辅助、未指派和平面边保持不变。');
  return{...doc,segments:assign(doc.segments,new Set([id]),next)};
}
