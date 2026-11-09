import type {Doc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {buildMaterialCutGeometry,type MaterialCutIntent} from './materialCut';
import {buildMaterialJoinGeometry,type MaterialJoinIntent,type MaterialJoinPair} from './materialJoin';
import {bindMaterialEdge,resolveMaterialEdge,type MaterialEdgeBinding,type MaterialAnchorStage} from './materialRecipeAnchors';
import type {MaterialFaceEditResult} from './materialFaceCommon';
export type MaterialTopologyRecipe=MaterialCutIntent|MaterialJoinIntent;
export type MaterialTopologyBinding={edge:MaterialEdgeBinding}|{first:MaterialEdgeBinding;second:MaterialEdgeBinding;assignment:MaterialJoinPair['assignment']};
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);return m;};
export function buildMaterialTopologyGeometry(doc:Doc,recipe:MaterialTopologyRecipe):MaterialFaceEditResult{
 const old=material(doc),cut=recipe.kind==='material-cut'?buildMaterialCutGeometry(doc,recipe):null,join=recipe.kind==='material-join'?buildMaterialJoinGeometry(doc,recipe):null,result=(cut??join)!,next=material(result.doc),cutStats=cut?(({doc:_,descendants:__,...stats})=>stats)(cut):undefined,joinStats=join?(({doc:_,descendants:__,...stats})=>stats)(join):undefined;
 return {doc:result.doc,descendants:result.descendants,faceParents:next.graph.faces_vertices!.map((_,f)=>f),facesBefore:old.graph.faces_vertices!.length,facesAfter:next.graph.faces_vertices!.length,addedVertices:next.graph.vertices_coords.length-old.graph.vertices_coords.length,removedEdges:old.graph.edges_vertices.length-next.graph.edges_vertices.length,synchronizedBanks:0,insertedIds:next.edgeSegmentIds.filter(id=>!old.edgeSegmentIds.includes(id)),placement:join?.placement??(next.foldedVertices?'preserved':'unavailable'),referenceEdges:recipe.kind==='material-cut'?recipe.segmentIds.flatMap(id=>result.descendants.get(id)??[]):recipe.pairs.map(p=>p.first),...(cutStats?{cut:cutStats}:{}),...(joinStats?{join:joinStats}:{})};
}
export function bindMaterialTopologyRecipe(recipe:MaterialTopologyRecipe,stages:MaterialAnchorStage[]):MaterialTopologyBinding[]{
 if(recipe.kind==='material-join')return recipe.pairs.map(p=>({first:bindMaterialEdge(p.first,stages),second:bindMaterialEdge(p.second,stages),assignment:p.assignment}));
 const bySource=new Map<string,MaterialEdgeBinding[]>();
 for(const id of recipe.segmentIds){const ref=bindMaterialEdge(id,stages),key=JSON.stringify([ref.source,ref.sourcePart,ref.edgeId,ref.edgeCount]),list=bySource.get(key)??[];list.push({...ref,from:Math.min(ref.from,ref.to),to:Math.max(ref.from,ref.to)});bySource.set(key,list);}
 const refs:MaterialTopologyBinding[]=[];
 for(const list of bySource.values())for(const ref of list.sort((a,b)=>a.from-b.from)){
  const last=refs.at(-1);if(last&&'edge'in last&&last.edge.source===ref.source&&last.edge.sourcePart===ref.sourcePart&&last.edge.edgeId===ref.edgeId&&last.edge.to===ref.from)last.edge.to=ref.to;else refs.push({edge:ref});
 }
 return refs;
}
export function resolveMaterialTopologyRecipe(recipe:MaterialTopologyRecipe,bindings:MaterialTopologyBinding[],stages:MaterialAnchorStage[]):MaterialTopologyRecipe{
 if(!Array.isArray(bindings)||!bindings.length||bindings.length>(recipe.kind==='material-cut'?16384:256))throw Error('切开/粘合的来源配方容量无效。');
 if(recipe.kind==='material-cut'){
  const ids=bindings.flatMap(ref=>{if(!ref||Object.keys(ref).join(',')!=='edge'||!('edge'in ref))throw Error('切开来源字段无效。');return resolveMaterialEdge(ref.edge,stages);});
  if(new Set(ids).size!==ids.length)throw Error('切开来源区间重复覆盖同一材料边。');return {...recipe,segmentIds:ids};
 }
 const m=material(stages.at(-1)!.doc),ends=(id:string)=>m.graph.edges_vertices[m.edgeSegmentIds.indexOf(id)].map(v=>m.graph.vertices_coords[v]),same=(a:number[],b:number[])=>a[0]===b[0]&&a[1]===b[1];
 const pairs=bindings.flatMap(ref=>{
  if(!ref||Object.keys(ref).sort().join(',')!=='assignment,first,second'||!('first'in ref)||!['M','V','F','U'].includes(ref.assignment))throw Error('粘合来源字段或线型无效。');
  const first=resolveMaterialEdge(ref.first,stages),second=resolveMaterialEdge(ref.second,stages),unused=new Set(second);
  if(first.length!==second.length)throw Error('粘合两侧的来源区间细分不一致。');
  return first.map(id=>{const [a,b]=ends(id),matches=[...unused].filter(other=>{const [p,q]=ends(other);return same(a,p)&&same(b,q)||same(a,q)&&same(b,p);});if(matches.length!==1)throw Error('粘合没有唯一相同区间的另一侧，未按坐标推断额外缝。');unused.delete(matches[0]);return {first:id,second:matches[0],assignment:ref.assignment};});
 });
 return {...recipe,pairs};
}
