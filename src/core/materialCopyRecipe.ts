/** Saved full-component copies retain source identity; copies are new sources,
 * not subdivisions of the original edge. */
import type {Doc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {buildMaterialCopyComponents,type MaterialCopyIntent,type MaterialCopyResult} from './materialCopy';
import type {MaterialFaceEditResult} from './materialFaceCommon';
import {bindMaterialSelection,resolveMaterialSelection} from './materialComponentTransform';
import type {MaterialAnchorStage,MaterialAnchorBinding} from './materialRecipeAnchors';
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);return m;};
export function buildMaterialCopyGeometry(doc:Doc,recipe:MaterialCopyIntent):MaterialFaceEditResult{
 return materialCopyGeometry(doc,recipe.segmentIds,buildMaterialCopyComponents(doc,recipe));
}
export function materialCopyGeometry(doc:Doc,segmentIds:readonly string[],result:MaterialCopyResult):MaterialFaceEditResult{
 const before=material(doc),after=material(result.doc),chosen=new Set(segmentIds),selected=before.components.filter(c=>c.edges.every(e=>chosen.has(before.edgeSegmentIds[e]))),faces=[...new Set(selected.flatMap(c=>c.faces))].sort((a,b)=>a-b),faceParents=[...before.graph.faces_vertices!.keys(),...Array.from({length:result.copies},()=>faces).flat()],{doc:next,descendants:_,...copy}=result;
 return {doc:next,descendants:new Map(doc.segments.map(s=>[s.id,[s.id]])),faceParents,referenceEdges:copy.copiedIds.filter(id=>after.edgeSegmentIds.includes(id)),insertedIds:copy.copiedIds,facesBefore:before.graph.faces_vertices!.length,facesAfter:after.graph.faces_vertices!.length,addedVertices:after.graph.vertices_coords.length-before.graph.vertices_coords.length,removedEdges:0,synchronizedBanks:0,placement:after.foldedVertices?'preserved':'unavailable',copy};
}
export function bindMaterialCopySelection(doc:Doc,recipe:MaterialCopyIntent,stages:MaterialAnchorStage[]){
 buildMaterialCopyComponents(doc,recipe);return bindMaterialCopySources(doc,recipe.segmentIds,stages);
}
export function bindMaterialCopySources(doc:Doc,segmentIds:readonly string[],stages:MaterialAnchorStage[]){
 const m=material(doc);if(!Array.isArray(segmentIds)||!segmentIds.length||new Set(segmentIds).size!==segmentIds.length||segmentIds.some(id=>typeof id!=='string'||!doc.segments.some(s=>s.id===id)))throw Error('复制来源身份无效。');const chosen=new Set(segmentIds),components=m.components.flatMap((c,i)=>{const count=c.edges.filter(e=>chosen.has(m.edgeSegmentIds[e])).length;if(count&&count!==c.edges.length)throw Error('复制参数须选择完整材料部件。');return count?[i]:[];});if(!components.length)throw Error('复制参数须包含实际材料部件。');
 return {selection:bindMaterialSelection(doc,components,stages),auxiliaryIds:doc.segments.filter(s=>s.assignment==='A'&&chosen.has(s.id)).map(s=>s.id)};
}
export function resolveMaterialCopySelection(doc:Doc,selection:MaterialAnchorBinding[],auxiliaryIds:string[],stages:MaterialAnchorStage[]):string[]{
 const m=material(doc);if(!Array.isArray(auxiliaryIds)||new Set(auxiliaryIds).size!==auxiliaryIds.length||auxiliaryIds.some(id=>typeof id!=='string'||!doc.segments.some(s=>s.id===id&&s.assignment==='A')))throw Error('复制辅助线来源已不存在或格式无效。');
 return [...resolveMaterialSelection(doc,selection,stages).flatMap(c=>m.components[c].edges.map(e=>m.edgeSegmentIds[e])),...auxiliaryIds];
}
