import type {Doc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {materialReflectSpan,type MaterialEdgeReflectIntent} from './materialReflect';
import {bindMaterialEdge,resolveMaterialEdge,type MaterialEdgeBinding,type MaterialAnchorStage} from './materialRecipeAnchors';
export type MaterialReflectBinding={source:MaterialEdgeBinding;axis:{kind:'material';edge:MaterialEdgeBinding}|{kind:'auxiliary';id:string;source:string}};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function spanBinding(doc:Doc,ids:readonly string[],stages:MaterialAnchorStage[]){
 const span=materialReflectSpan(doc,ids),rows=ids.map(id=>bindMaterialEdge(id,stages)),first=rows[0];if(rows.some(r=>r.source!==first.source||r.edgeId!==first.edgeId||r.edgeCount!==first.edgeCount||r.sourcePart!==first.sourcePart))throw Error('镜像区间没有唯一连续来源边。');
 const lo=Math.min(...rows.flatMap(r=>[r.from,r.to])),hi=Math.max(...rows.flatMap(r=>[r.from,r.to])),m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);const e=m.edgeSegmentIds.indexOf(ids[0]),a=m.graph.vertices_coords[m.graph.edges_vertices[e][0]],forward=span.a[0]===a[0]&&span.a[1]===a[1],direction=(rows[0].from<rows[0].to)===forward,binding={...first,from:direction?lo:hi,to:direction?hi:lo};
 if(!same(resolveMaterialEdge(binding,stages),ids))throw Error('镜像区间未完整覆盖选定材料侧。');return binding;
}
export function bindMaterialReflectRecipe(doc:Doc,recipe:MaterialEdgeReflectIntent,stages:MaterialAnchorStage[]):MaterialReflectBinding{
 const source=spanBinding(doc,recipe.sourceIds??[recipe.sourceId],stages),m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);if(m.edgeSegmentIds.includes(recipe.axisId))return {source,axis:{kind:'material',edge:spanBinding(doc,recipe.axisIds??[recipe.axisId],stages)}};
 if(recipe.axisIds&&(!same(recipe.axisIds,[recipe.axisId])))throw Error('辅助轴只能是单条有效辅助线。');const s=doc.segments.find(s=>s.id===recipe.axisId);if(!s||s.assignment!=='A')throw Error('对称轴须为材料边或辅助线。');const owner=stages.find(stage=>stage.doc.segments.some(s=>s.id===recipe.axisId&&s.assignment==='A'));if(!owner)throw Error('辅助对称轴没有保存的来源。');return {source,axis:{kind:'auxiliary',id:recipe.axisId,source:owner.id}};
}
export function resolveMaterialReflectRecipe(doc:Doc,recipe:MaterialEdgeReflectIntent,binding:MaterialReflectBinding,stages:MaterialAnchorStage[]):MaterialEdgeReflectIntent{
 if(!binding||Object.keys(binding).sort().join(',')!=='axis,source'||!binding.axis)throw Error('保存的镜像来源字段无效。');const sourceIds=resolveMaterialEdge(binding.source,stages);let axisIds:string[];
 if(binding.axis.kind==='material'){if(Object.keys(binding.axis).sort().join(',')!=='edge,kind')throw Error('保存的材料对称轴字段无效。');axisIds=resolveMaterialEdge(binding.axis.edge,stages);}
 else if(binding.axis.kind==='auxiliary'){const a=binding.axis;if(Object.keys(a).sort().join(',')!=='id,kind,source'||typeof a.id!=='string'||typeof a.source!=='string'||!stages.some(stage=>stage.id===a.source&&stage.doc.segments.some(s=>s.id===a.id&&s.assignment==='A'))||!doc.segments.some(s=>s.id===a.id&&s.assignment==='A'))throw Error('辅助对称轴来源已删除，未按坐标寻找替代轴。');axisIds=[a.id];}
 else throw Error('保存的对称轴类型无效。');
 const {sourceIds:_,axisIds:__,...rest}=recipe;return {...rest,sourceId:sourceIds[0],axisId:axisIds[0],...(sourceIds.length>1?{sourceIds}:{}),...(axisIds.length>1?{axisIds}:{})};
}
