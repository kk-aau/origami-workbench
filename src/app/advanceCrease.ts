import {validateDoc,type Doc} from '../core/types';
import {cycleCrease} from './cycleCrease';

/** Mode 30 has a selection stage, unlike the ordinary B/M/V cycle. */
export function advanceCrease(doc:Doc,id:string,selected:ReadonlySet<string>,lockBoundary=false):{doc:Doc;selected:Set<string>}{
  validateDoc(doc);const source=doc.segments.find(s=>s.id===id);
  if(!source)throw new Error('线段已变化，请重新点击。');
  if(source.assignment==='B'&&lockBoundary)throw new Error('边界保护已开启，不能选择或修改纸边。');
  if(!['B','M','V'].includes(source.assignment))throw new Error('底图对照赋型仅处理边界、山折与谷折。');
  const ids=new Set(selected);
  if(source.assignment==='B'&&!ids.has(id)){ids.add(id);return{doc,selected:ids};}
  // Upstream deliberately leaves selected mountain/valley lines unchanged.
  if(source.assignment!=='B'&&ids.has(id))return{doc,selected:ids};
  ids.delete(id);return{doc:cycleCrease(doc,id,lockBoundary),selected:ids};
}
