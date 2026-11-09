import type {Doc} from './types';
import {validateDoc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {setStartingFace,clearStartingFace,resolveStartingFace} from '../app/flatFoldSettings';
import type {MaterialFaceEditResult} from './materialFaceCommon';
import {appendMaterialReferenceFaceGroup} from './materialCurveModel';

export type MaterialReferenceFaceIntent={kind:'material-reference-face';face:number|null;parametric?:boolean};
export function editMaterialReferenceFace(doc:Doc,intent:MaterialReferenceFaceIntent):MaterialFaceEditResult{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')throw Error('参考面保存参数设置无效。');
 const {parametric:_,...recipe}=intent??{};
 return intent?.parametric?appendMaterialReferenceFaceGroup(doc,recipe as MaterialReferenceFaceIntent):buildMaterialReferenceFace(doc,recipe as MaterialReferenceFaceIntent);
}
/** A view reference change preserves the stored CP and FF coordinate bases. */
export function buildMaterialReferenceFace(doc:Doc,intent:MaterialReferenceFaceIntent):MaterialFaceEditResult{
 validateDoc(doc);const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);
 if(!intent||Object.keys(intent).sort().join(',')!=='face,kind'||intent.kind!=='material-reference-face'||intent.face!==null&&(!Number.isInteger(intent.face)||intent.face<0||!m.graph.faces_vertices?.[intent.face]))throw Error('请选择有效的材料参考面，或明确恢复默认。');
 const before=resolveStartingFace(doc,m.graph),next=structuredClone(intent.face===null?clearStartingFace(doc):setStartingFace(doc,intent.face)),after=resolveStartingFace(next,m.graph);validateDoc(next);if(after.stale)throw Error('新的材料参考面无法确认。');
 const faces=m.graph.faces_vertices!.map((_,f)=>f);
 return {doc:next,descendants:new Map(doc.segments.map(s=>[s.id,[s.id]])),faceParents:faces,faceSources:faces.map(f=>[f]),referenceEdges:[],insertedIds:[],facesBefore:faces.length,facesAfter:faces.length,addedVertices:0,removedEdges:0,synchronizedBanks:0,placement:m.foldedVertices?'preserved':'unavailable',referenceFace:{previous:before.stale?null:before.face,current:after.face,default:intent.face===null,changed:before.stale||JSON.stringify(doc.flatFold)!==JSON.stringify(next.flatFold)}};
}
