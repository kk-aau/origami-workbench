import {validateDoc,type Assignment,type Doc,type Point} from '../core/types';
import {assign} from './state';
import {pickEraseSegment,segmentsInBox} from './erase';

export type LineTypeFilter=Assignment|'any'|'folds';
export type TypeFilterArea={kind:'point';point:Point;radius:number}|{kind:'box';a:Point;b:Point};
export type TypeFilterAction={kind:'replace';to:Assignment}|{kind:'delete'};
export const LINE_TYPE_FILTERS:readonly {value:LineTypeFilter;label:string}[]=[
  {value:'any',label:'任意线型'},{value:'folds',label:'山折与谷折'},
  {value:'M',label:'山折'},{value:'V',label:'谷折'},{value:'A',label:'辅助'},
  {value:'B',label:'边界'},{value:'U',label:'未指派'},{value:'F',label:'平面边'},
];
function checkFilter(filter:LineTypeFilter){if(!LINE_TYPE_FILTERS.some(f=>f.value===filter))throw new Error('请选择有效的来源线型。');}
function checkPoint(point:Point){if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('筛选区域坐标须在 ±1000000 mm 内。');}
export function matchesLineType(assignment:Assignment,filter:LineTypeFilter):boolean{
  checkFilter(filter);return filter==='any'||(filter==='folds'?(assignment==='M'||assignment==='V'):assignment===filter);
}

/** Pick nearest first, then filter; never click through a mismatched front line. */
export function typeFilterHits(doc:Doc,area:TypeFilterArea,filter:LineTypeFilter,lockBoundary=false):Set<string>{
  validateDoc(doc);checkFilter(filter);let candidates:Set<string>;
  if(area.kind==='point'){
    checkPoint(area.point);if(!Number.isFinite(area.radius)||area.radius<0)throw new Error('命中半径必须是非负有限数。');
    const id=pickEraseSegment(doc,area.point,area.radius,lockBoundary);candidates=new Set(id?[id]:[]);
  }else{
    [area.a,area.b].forEach(checkPoint);candidates=segmentsInBox(doc,area.a,area.b,lockBoundary,'touching');
  }
  return new Set(doc.segments.filter(s=>candidates.has(s.id)&&matchesLineType(s.assignment,filter)).map(s=>s.id));
}

/** Pure atomic proposal; publish via normal document commit/splitting/history. */
export function applyTypeFilter(doc:Doc,area:TypeFilterArea,filter:LineTypeFilter,action:TypeFilterAction,lockBoundary=false):{doc:Doc;matched:number;changed:number}{
  if(action.kind==='replace'&&!['M','V','A','B','U','F'].includes(action.to))throw new Error('请选择具体的目标线型，不能使用组合筛选条件。');
  const hits=typeFilterHits(doc,area,filter,lockBoundary);
  const changed=doc.segments.filter(s=>hits.has(s.id)&&(action.kind==='delete'||s.assignment!==action.to)).length;
  if(!changed)return{doc,matched:hits.size,changed:0};
  const result={...doc,segments:action.kind==='delete'?doc.segments.filter(s=>!hits.has(s.id)):assign(doc.segments,hits,action.to)};
  validateDoc(result);return{doc:result,matched:hits.size,changed};
}
