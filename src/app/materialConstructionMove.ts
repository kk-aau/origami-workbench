import {materialOuterContour} from '../core/materialWeak';
import type {Doc,Point} from '../core/types';
import {validateDoc} from '../core/types';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {materialRoot} from '../core/materialFaceCommon';
import {transformPoint,type SelectionTransform} from './selectionTransform';
import {previewMaterialConstructionCopy} from './materialConstructionCopy';
import {epsilonFor} from '../core/geometry';
import {appendMaterialConstructionMoveGroup} from '../core/materialCurveModel';

export type MaterialConstructionMoveIntent={kind:'material-construction-move';segmentIds:readonly string[];transform:SelectionTransform;lockBoundary:boolean;parametric?:boolean};
function fail(reason:string):never{throw new Error(`材料定位移动失败：${reason}`);}
const keys=(v:object,allowed:string)=>Object.keys(v).sort().join(',')===allowed;
function selection(doc:Doc,request:MaterialConstructionMoveIntent){
 validateDoc(doc);
 if(!request||!keys(request,'kind,lockBoundary,segmentIds,transform')||request.kind!=='material-construction-move'||typeof request.lockBoundary!=='boolean'||!Array.isArray(request.segmentIds)||!request.segmentIds.length||request.segmentIds.some(id=>typeof id!=='string'||!id)||new Set(request.segmentIds).size!==request.segmentIds.length||!request.transform||!['translate','similarity'].includes(request.transform.kind))fail('需要有效且不重复的部件边身份、参考点和边界保护设置。');
 const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);const ids=new Set(request.segmentIds),chosen=doc.segments.filter(s=>ids.has(s.id));
 if(chosen.length!==ids.size)fail('选区含失效线段。');
 if(request.lockBoundary&&chosen.some(s=>s.assignment==='B'))fail('边界保护已开启，请取消保护后再移动材料纸边。');
 const components=old.components.filter(c=>{const count=c.edges.filter(e=>ids.has(old.edgeSegmentIds[e])).length;if(count&&count!==c.edges.length)fail('必须选择完整材料部件及其全部边界；部分边不能作为整体定位移动。');return count>0;});
 if(!components.length)fail('请选择至少一个完整材料部件。');
 // Use the original reference-point parser/formula, including strict key and
 // coordinate checks; preview never trims or welds independent material banks.
 const preview=previewMaterialConstructionCopy(doc,{kind:'material-construction-copy',segmentIds:request.segmentIds,transform:request.transform});
 const point=(p:Point)=>transformPoint(p,request.transform,epsilonFor(doc));
 return {old,ids,preview,point,vertices:new Set(components.flatMap(c=>c.vertices))};
}
export function previewMaterialConstructionMove(doc:Doc,request:MaterialConstructionMoveIntent){if(Object.hasOwn(request??{},'parametric')&&typeof request.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=request??{};return selection(doc,recipe as MaterialConstructionMoveIntent).preview;}

/** Move complete components without replacing IDs or merging coincident banks.
 * CP and any verified FF use the exact same world reference-point formula. */
export function constructMaterialMove(doc:Doc,request:MaterialConstructionMoveIntent){
 if(Object.hasOwn(request??{},'parametric')&&typeof request.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=request??{};if(request?.parametric){const r=appendMaterialConstructionMoveGroup(doc,recipe as MaterialConstructionMoveIntent);return {...r.locationMove!,doc:r.doc,descendants:r.descendants};}return buildMaterialConstructionMove(doc,recipe as MaterialConstructionMoveIntent);
}
export function buildMaterialConstructionMove(doc:Doc,request:MaterialConstructionMoveIntent){
 const {old,ids,preview,point,vertices}=selection(doc,request),root=materialRoot(doc,old),graph=structuredClone(old.graph);
 const t=request.transform,same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
 // Identical references express no movement even if p + a - a would introduce
 // floating-point roundoff. Never manufacture a revision from that roundoff.
 if(t.kind==='translate'?same(t.from,t.to):same(t.a,t.c)&&same(t.b,t.d))fail('定位前后位置相同，无需重复移动。');
 graph.vertices_coords=graph.vertices_coords.map((p,v)=>vertices.has(v)?point(p):p);
 if(graph.vertices_coords.every((p,v)=>p[0]===old.graph.vertices_coords[v][0]&&p[1]===old.graph.vertices_coords[v][1]))fail('定位前后位置相同，无需重复移动。');
 const byId=new Map(preview.map(s=>[s.id,s])),next=structuredClone(doc);
 next.segments=next.segments.map(s=>byId.get(s.id)??s);
 const folded=old.foldedVertices?.map((p,v)=>vertices.has(v)?point(p):[...p] as Point);
 if(next.flatFold)next.flatFold={...next.flatFold,startingFace:materialOuterContour(graph,root).map(v=>[...graph.vertices_coords[v]])};
 next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,graph,old.edgeSegmentIds,{startingFace:old.startingFace??0,...(folded?{foldedVertices:folded}:{})})};
 validateDoc(next);const checked=inspectMaterialTopology(next);if(!checked.ok)fail(checked.reason);
 return {doc:next,descendants:new Map(doc.segments.map(s=>[s.id,[s.id]])),movedIds:[...ids],components:old.components.filter(c=>c.vertices.some(v=>vertices.has(v))).length};
}
