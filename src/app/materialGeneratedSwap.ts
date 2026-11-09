import type {Doc} from '../core/types';
import {constructMaterialCopy,type MaterialConstructionCopyIntent} from './materialConstructionCopy';
import {reflectMaterialEdge,type MaterialEdgeReflectIntent} from '../core/materialReflect';
import {editMaterialLineProperties} from '../core/materialLineProperties';

export type MaterialGeneratedConstruction=MaterialConstructionCopyIntent|MaterialEdgeReflectIntent;
export type MaterialGeneratedSwapIntent={kind:'material-generated-swap';construction:MaterialGeneratedConstruction};

/** One editor transaction: construct first, then exchange only its new M/V
 * edges through the material property operation. Saved constructions retain a
 * dependent swap recipe, so editing their parameters cannot lose the modifier. */
export function applyMaterialGeneratedSwap(previous:Doc,construction:MaterialGeneratedConstruction):{doc:Doc;descendants:Map<string,string[]>;generatedIds:string[]}{
  if(!construction||!['material-construction-copy','material-edge-reflect'].includes(construction.kind))throw new Error('生成线段山谷互换只支持材料复制或材料折痕镜像。');
  const result=construction.kind==='material-construction-copy'?constructMaterialCopy(previous,construction):reflectMaterialEdge(previous,construction);
  const generatedIds='copiedIds' in result?result.copiedIds:result.insertedIds??[];
  const generated=new Set(generatedIds),segmentIds=result.doc.segments.filter(segment=>generated.has(segment.id)&&(segment.assignment==='M'||segment.assignment==='V')).map(segment=>segment.id);
  if(!segmentIds.length)return {doc:result.doc,descendants:result.descendants,generatedIds};
  const changed=editMaterialLineProperties(result.doc,{kind:'material-line-properties',segmentIds,operation:{kind:'swap'},cpOnly:false,...(construction.parametric?{parametric:true}:{})});
  return {doc:changed.doc,descendants:new Map([...result.descendants].map(([source,ids])=>[source,ids.flatMap(id=>changed.descendants.get(id)??[id])])),generatedIds:generatedIds.flatMap(id=>changed.descendants.get(id)??[id])};
}
