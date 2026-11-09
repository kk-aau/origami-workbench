import {validateDoc,type Doc,type Point} from '../core/types';
import {assign,distanceToSegment} from './state';
import {typeFilterHits,type TypeFilterArea} from './typeFilter';

export type DirectAssignment='M'|'V'|'B'|'A';
function checkTarget(target:DirectAssignment){
  if(!['M','V','B','A'].includes(target))throw new Error('直接赋型只能选择山折、谷折、边界或辅助线。');
}
function checkPoint(point:Point){
  if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('赋型位置坐标须在 ±1000000 mm 内。');
}
const auxiliarySource=(assignment:string)=>['M','V','B'].includes(assignment);

/** Modes 23/24/25/60: touching boxes; first equal-distance line wins except aux (last).
 * Protected boundaries are excluded as in other workbench editing tools.
 * Auxiliary eligibility is checked AFTER nearest picking: do not click through.
 */
export function directAssignmentHits(doc:Doc,area:TypeFilterArea,target:DirectAssignment,lockBoundary=false):Set<string>{
  validateDoc(doc);checkTarget(target);
  let candidates:Set<string>;
  if(area.kind==='box'){
    candidates=typeFilterHits(doc,area,'any',lockBoundary);
  }else{
    checkPoint(area.point);
    if(!Number.isFinite(area.radius)||area.radius<0)throw new Error('命中半径必须是非负有限数。');
    let best=area.radius,id:string|undefined;
    const ordered=target==='A'?[...doc.segments].reverse():doc.segments;
    for(const segment of ordered){
      if(lockBoundary&&segment.assignment==='B')continue;
      const distance=distanceToSegment(area.point,segment);
      if(distance<best){best=distance;id=segment.id;}
    }
    candidates=new Set(id?[id]:[]);
  }
  return new Set(doc.segments.filter(s=>candidates.has(s.id)&&(target!=='A'||auxiliarySource(s.assignment))).map(s=>s.id));
}

/** Atomic proposal. App.commit materializes intersections and remaps selection.
 * Keep shared editable vertices (including auxiliary intersections), rather than
 * adopting upstream aux deletion/reinsertion which can merge neighboring lines.
 */
export function applyDirectAssignment(doc:Doc,area:TypeFilterArea,target:DirectAssignment,lockBoundary=false):{doc:Doc;matched:number;changed:number}{
  const hits=directAssignmentHits(doc,area,target,lockBoundary);
  const changed=doc.segments.filter(s=>hits.has(s.id)&&s.assignment!==target).length;
  if(!changed)return{doc,matched:hits.size,changed:0};
  const result={...doc,segments:assign(doc.segments,hits,target)};
  validateDoc(result);return{doc:result,matched:hits.size,changed};
}
