import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {buildSnapPoints} from './snapPoints';
import {splitEditableSegmentsWithMap} from './planarize';
import {mergeCrossTypeVertex, mergeVertex} from './vertexPolygon';
export interface MergeAllResult {doc:Doc;merged:number;changedIds:Set<string>}
/** Remove only degree-two, collinear, equal-property subdivisions. No implicit colour/angle loss. */
function mergeAll(doc:Doc,lockBoundary=false,crossType=false,resolvedAngle?:number|null):MergeAllResult{
 validateDoc(doc);
 const prepared=splitEditableSegmentsWithMap(doc).doc;
 validateDoc(prepared);
 const segments=new Map(prepared.segments.map(s=>[s.id,s]));
 const nodes=buildSnapPoints(prepared).map(v=>({point:v.point,ids:new Set(v.segmentIds)}));
 const memberships=new Map<string,Set<number>>();
 nodes.forEach((v,i)=>v.ids.forEach(id=>{if(!memberships.has(id))memberships.set(id,new Set());memberships.get(id)!.add(i);}));
 const queue=nodes.map((_,i)=>i),changedIds=new Set<string>();let merged=0;
 for(let head=0;head<queue.length;head++){
  const index=queue[head],node=nodes[index];if(node.ids.size!==2)continue;
  const pair=[...node.ids].sort().map(id=>segments.get(id)!);
  if(pair.some(s=>!s||s.assignment==='A')||(pair[0].displayColor??'')!==(pair[1].displayColor??''))continue;
  let result:{point:Point;ids:string[];segment:Segment};
  try{result=crossType?mergeCrossTypeVertex({...prepared,segments:pair},node.point,lockBoundary,resolvedAngle):mergeVertex({...prepared,segments:pair},node.point,lockBoundary);}catch{continue;}
  const affected=new Set(result.ids.flatMap(id=>[...memberships.get(id)??[]]));
  for(const id of result.ids){segments.delete(id);memberships.delete(id);changedIds.delete(id);}
  segments.set(result.segment.id,result.segment);changedIds.add(result.segment.id);
  const remaining=new Set<number>();
  for(const i of affected){const v=nodes[i];result.ids.forEach(id=>v.ids.delete(id));if(i!==index){v.ids.add(result.segment.id);remaining.add(i);queue.push(i);}}
  memberships.set(result.segment.id,remaining);merged++;
 }
 if(!merged)return {doc,merged:0,changedIds};
 const next={...doc,segments:[...segments.values()]};validateDoc(next);return {doc:next,merged,changedIds};
}

export function mergeAllVertices(doc:Doc,lockBoundary=false):MergeAllResult{return mergeAll(doc,lockBoundary,false);}

/**
 * Batch variant of Oriedita's cross-type vertex merge. M+V becomes a boundary,
 * B+M/B+V keeps the fold type, and same-type angle conflicts are left intact
 * unless the caller explicitly supplies a replacement angle.
 */
export function mergeAllCrossTypeVertices(doc:Doc,lockBoundary=false,resolvedAngle?:number|null):MergeAllResult{return mergeAll(doc,lockBoundary,true,resolvedAngle);}
