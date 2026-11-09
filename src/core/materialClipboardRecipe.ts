import type {Doc} from './types';
import {validateDoc} from './types';
import {createMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {buildMaterialClipboardPaste,buildMaterialClipboardCut,type MaterialPasteIntent,type MaterialClipboardCutIntent,type MaterialClipboard} from '../app/materialClipboard';
import type {MaterialFaceEditResult} from './materialFaceCommon';
export type MaterialClipboardRecipe=MaterialPasteIntent|MaterialClipboardCutIntent;
export function freezeMaterialClipboard(clipboard:MaterialClipboard):MaterialClipboard{
 validateDoc(clipboard?.doc);const d=clipboard.doc,m=inspectMaterialTopology(d);if(!m.ok)throw Error(m.reason);const doc:Doc={schemaVersion:2,name:d.name,paper:structuredClone(d.paper),segments:structuredClone(d.segments),...(d.flatFold?{flatFold:structuredClone(d.flatFold)}:{})};doc.metadata={materialTopology:createMaterialTopology(doc,m.graph,m.edgeSegmentIds,{startingFace:m.startingFace??0,...(m.foldedVertices?{foldedVertices:m.foldedVertices}:{})})};return {kind:'material-clipboard',doc};
}
export function buildMaterialClipboardGeometry(doc:Doc,recipe:MaterialClipboardRecipe):MaterialFaceEditResult{
 validateDoc(doc);const before=inspectMaterialTopology(doc);
 if(recipe.kind==='material-clipboard-paste'){
  const r=buildMaterialClipboardPaste(doc,recipe),after=inspectMaterialTopology(r.doc),source=inspectMaterialTopology(recipe.clipboard.doc);if(!after.ok||!source.ok)throw Error('粘贴结果或源材料无效。');const sourceCount=source.graph.faces_vertices!.length,targetCount=after.graph.faces_vertices!.length-sourceCount,{doc:next,descendants,...paste}=r,pasted=new Set(r.pastedIds);
  return {doc:next,descendants,faceSources:[...Array.from({length:targetCount},(_,f)=>[f]),...Array.from({length:sourceCount},()=>[])],referenceEdges:after.edgeSegmentIds.filter(id=>!before.ok||pasted.has(id)),insertedIds:r.pastedIds,facesBefore:targetCount,facesAfter:after.graph.faces_vertices!.length,addedVertices:source.graph.vertices_coords.length,removedEdges:0,synchronizedBanks:0,placement:r.placement,paste};
 }
 if(!before.ok)throw Error(before.reason);const selected=new Set(recipe.segmentIds),removedFaces=new Set(before.components.filter(c=>c.edges.some(e=>selected.has(before.edgeSegmentIds[e]))).flatMap(c=>c.faces)),r=buildMaterialClipboardCut(doc,recipe),after=inspectMaterialTopology(r.doc),{doc:next,descendants,...clipboardCut}=r,parents=before.graph.faces_vertices!.flatMap((_,f)=>removedFaces.has(f)?[]:[f]);
 return {doc:next,descendants,faceParents:parents,faceSources:parents.map(f=>[f]),referenceEdges:after.ok?after.edgeSegmentIds:[],insertedIds:[],facesBefore:before.graph.faces_vertices!.length,facesAfter:after.ok?after.graph.faces_vertices!.length:0,addedVertices:0,removedEdges:before.graph.edges_vertices.length-(after.ok?after.graph.edges_vertices.length:0),synchronizedBanks:0,placement:after.ok&&after.foldedVertices?'preserved':'unavailable',clipboardCut};
}
