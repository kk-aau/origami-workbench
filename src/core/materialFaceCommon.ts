import type {Doc,FoldGraph,Point,Segment} from './types';
import {validateDoc} from './types';
import {createMaterialTopology,inspectMaterialTopology,type MaterialTopologyInspection} from './materialTopology';
import {resolveStartingFace} from '../app/flatFoldSettings';
import {refoldMaterialRemeshedFaces} from './materialRefold';
import {materialFrameMap} from './materialFlatGeometry';
import {materialOuterContour} from './materialWeak';

export type MaterialFaceAnchor={edgeId:string;fraction:number};
export type MaterialFaceEditResult={curveSources?:import('./materialCurveSources').MaterialCurveSource[];auxiliary?:{createdIds:string[];createdKeys:string[];changedIds:string[];removedIds:string[]};referenceFace?:{previous:number|null;current:number;default:boolean;changed:boolean};properties?:{selectedIds:string[];changedIds:string[];assignmentChanges:number;angleChanges:number;cpOnly:boolean};locationMove?:Omit<ReturnType<typeof import('../app/materialConstructionMove').buildMaterialConstructionMove>,'doc'|'descendants'>;reflection?:{from:Point;to:Point;sourceId:string;axisId:string;cpOnly:boolean};paste?:Omit<ReturnType<typeof import('../app/materialClipboard').buildMaterialClipboardPaste>,'doc'|'descendants'>;clipboardCut?:Omit<ReturnType<typeof import('../app/materialClipboard').buildMaterialClipboardCut>,'doc'|'descendants'>;copy?:Omit<import('./materialCopy').MaterialCopyResult,'doc'|'descendants'>;doc:Doc;descendants:Map<string,string[]>;faceParents?:number[];faceSources?:number[][];referenceEdges?:string[];transform?:{operation:import('../app/materialEdit').MaterialTransformIntent['kind'];components:number;movedEdges:number;center:Point};cut?:Omit<import('./materialCut').MaterialCutResult,'doc'|'descendants'>;join?:Omit<import('./materialJoin').MaterialJoinResult,'doc'|'descendants'>;batch?:import('./materialTraceBatch').MaterialBatchDetails;facesBefore:number;facesAfter:number;addedVertices:number;removedEdges:number;synchronizedBanks:number;insertedId?:string;insertedIds?:string[];placement:'preserved'|'recomputed'|'unavailable';trace?:{pieces:number;faces:number;length:number;blankLength:number;components:number};curves?:{count:number;inputSegments:number;deviation:number;maximumError:number;errorBounds:number[];curveForInputEdge:number[];clipping?:{faces:number;components:number;materialLength:number;blankLength:number;curveForInsertedSegment:number[]}};ray?:{origin:Point;direction:Point;reachedLength:number;materialLength:number;blankLength:number};network?:{inputVertices:number;inputEdges:number;intersections:number;segments:number;createdFaces:number;cpOnly:boolean;clipping?:{scope:'face'|'component'|'all';faces:number;components:number;materialLength:number;blankLength:number}}};
export type CheckedMaterial=Extract<MaterialTopologyInspection,{ok:true}>;
export function materialFaceFail(reason:string):never{throw new Error(`材料面编辑失败：${reason}`);}
export const materialMix=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export function materialCanonical(coords:Point[],edges:[number,number][],kinds:string[],angles:(number|null)[],faces:number[][],faceEdges:number[][],holes?:number[][][],holeEdges?:number[][][]):FoldGraph{
 const owners=edges.map(()=>[] as number[]);faceEdges.forEach((row,f)=>[row,...(holeEdges?.[f]??[])].forEach(r=>r.forEach(e=>owners[e].push(f))));
 const neighbor=(e:number,f:number)=>owners[e].length===2?owners[e][0]===f?owners[e][1]:owners[e][0]:null;
 return {vertices_coords:coords,edges_vertices:edges,edges_assignment:kinds,edges_foldAngle:angles,faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,faces_faces:faceEdges.map((row,f)=>row.map(e=>neighbor(e,f))) as unknown as number[][],...(holes?.some(r=>r.length)?{faces_holes:holes,faces_holeEdges:holeEdges,faces_holeFaces:holeEdges!.map((row,f)=>row.map(r=>r.map(e=>neighbor(e,f))))}:{})};
}
export function materialRoot(doc:Doc,old:CheckedMaterial){const root=resolveStartingFace(doc,old.graph);if(root.stale)materialFaceFail('原固定面身份已失效，请先重新选择。');return root.face;}
export function finishMaterialFaces(doc:Doc,old:CheckedMaterial,graph:FoldGraph,ids:string[],segments:Segment[],sources:number[][],root:number,oldRoot:number,ff:Point[]|undefined,descendants:Map<string,string[]>,extra:Pick<MaterialFaceEditResult,'addedVertices'|'removedEdges'|'synchronizedBanks'|'insertedId'|'insertedIds'|'trace'>):MaterialFaceEditResult{
 const next:Doc={...structuredClone(doc),segments};
 const reference=sources.findIndex(fs=>fs.includes(old.startingFace??0)),frameRoot=reference<0||(old.startingFace??0)===oldRoot?root:reference,viewMap=materialFrameMap(old,oldRoot),sameFrame=(vertices:Point[])=>reference<0?vertices.map(viewMap.toView):vertices;
 if(next.flatFold||frameRoot!==root)next.flatFold={startingFace:materialOuterContour(graph,root).map(v=>[...graph.vertices_coords[v]]),materialFace:root};
 // The temporary root chooses the refold anchor; the final contract records
 // the preserved coordinate reference. They are intentionally separate.
 next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,graph,ids,{startingFace:root})};
 let placement:MaterialFaceEditResult['placement']='unavailable';
 if(ff){
  let verified:ReturnType<typeof createMaterialTopology>|undefined;
  try{verified=createMaterialTopology(next,graph,ids,{startingFace:frameRoot,foldedVertices:sameFrame(ff)});placement='preserved';}catch{/* Changed hinges can require a different rigid placement. */}
  if(!verified){const folded=refoldMaterialRemeshedFaces(doc,next,sources,oldRoot);verified=createMaterialTopology(next,graph,ids,{startingFace:frameRoot,foldedVertices:sameFrame(folded)});placement='recomputed';}
  next.metadata.materialTopology=verified;
 }
 validateDoc(next);const checked=inspectMaterialTopology(next);if(!checked.ok)materialFaceFail(checked.reason);
 return {doc:next,descendants,facesBefore:old.graph.faces_vertices!.length,facesAfter:graph.faces_vertices!.length,placement,...extra,...(sources.every(row=>row.length===1)?{faceParents:sources.map(row=>row[0])}:{})};
}
