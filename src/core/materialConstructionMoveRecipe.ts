import type {Doc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {buildMaterialConstructionMove,type MaterialConstructionMoveIntent} from '../app/materialConstructionMove';
import type {MaterialFaceEditResult} from './materialFaceCommon';
export function buildMaterialConstructionMoveGeometry(doc:Doc,recipe:MaterialConstructionMoveIntent):MaterialFaceEditResult{
 const before=inspectMaterialTopology(doc);if(!before.ok)throw Error(before.reason);const r=buildMaterialConstructionMove(doc,recipe),after=inspectMaterialTopology(r.doc);if(!after.ok)throw Error(after.reason);const chosen=new Set(r.movedIds),{doc:next,descendants,...locationMove}=r,faces=before.graph.faces_vertices!.map((_,f)=>f);
 return {doc:next,descendants,locationMove,faceParents:faces,faceSources:faces.map(f=>[f]),referenceEdges:after.edgeSegmentIds.filter(id=>chosen.has(id)),insertedIds:[],facesBefore:faces.length,facesAfter:faces.length,addedVertices:0,removedEdges:0,synchronizedBanks:0,placement:after.foldedVertices?'preserved':'unavailable'};
}
