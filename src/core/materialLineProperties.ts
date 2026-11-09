import type {Doc} from './types';
import {validateDoc} from './types';
import {createMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {reconcileMaterialEdit} from '../app/materialEdit';
import {assign,swap} from '../app/state';
import type {MaterialFaceEditResult} from './materialFaceCommon';
import {appendMaterialLinePropertiesGroup} from './materialCurveModel';
export type MaterialPropertyAssignment='M'|'V'|'F'|'U';
export type MaterialPropertyOperation={kind:'assignment';assignment:MaterialPropertyAssignment}|{kind:'angle';magnitude:number|null}|{kind:'swap'}|{kind:'exact';assignment:MaterialPropertyAssignment;angle:number|null};
export type MaterialLinePropertiesIntent={kind:'material-line-properties';segmentIds:readonly string[];operation:MaterialPropertyOperation;cpOnly:boolean;parametric?:boolean};
const keys=(v:object,k:string)=>Object.keys(v).sort().join(',')===k;
function bad(message:string):never{throw Error(`材料折痕属性：${message}`);}
export function editMaterialLineProperties(doc:Doc,intent:MaterialLinePropertiesIntent){if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent??{};return intent?.parametric?appendMaterialLinePropertiesGroup(doc,recipe as MaterialLinePropertiesIntent):buildMaterialLineProperties(doc,recipe as MaterialLinePropertiesIntent);}
/** Only properties change. Existing ordinary assignment/swap and FF rules are
 * reused; explicit CP-only removes pose without inventing a replacement. */
export function buildMaterialLineProperties(doc:Doc,intent:MaterialLinePropertiesIntent):MaterialFaceEditResult{
 validateDoc(doc);const old=inspectMaterialTopology(doc);if(!old.ok)bad(old.reason);
 if(!intent||!keys(intent,'cpOnly,kind,operation,segmentIds')||intent.kind!=='material-line-properties'||typeof intent.cpOnly!=='boolean'||!Array.isArray(intent.segmentIds)||!intent.segmentIds.length||intent.segmentIds.length>16384||new Set(intent.segmentIds).size!==intent.segmentIds.length||Array.from(intent.segmentIds).some(id=>typeof id!=='string'||!old.edgeSegmentIds.includes(id)||doc.segments.find(s=>s.id===id)?.assignment==='B'))bad('请选择有效的材料折痕；纸边、切口或辅助线不能直接改为面内折痕。');
 const op=intent.operation;if(!op||typeof op!=='object'||Array.isArray(op)||!['assignment','angle','swap','exact'].includes(op.kind)||!keys(op,op.kind==='assignment'?'assignment,kind':op.kind==='angle'?'kind,magnitude':op.kind==='exact'?'angle,assignment,kind':'kind'))bad('属性操作字段无效。');
 if((op.kind==='assignment'||op.kind==='exact')&&!['M','V','F','U'].includes(op.assignment))bad('材料线型只支持山、谷、平面或未指定；边界转换请切开或粘合。');
 if(op.kind==='angle'&&op.magnitude!==null&&(!Number.isFinite(op.magnitude)||op.magnitude<0||op.magnitude>180)||op.kind==='exact'&&op.angle!==null&&(!Number.isFinite(op.angle)||Math.abs(op.angle)>180))bad('目标折角须在允许的有限角度范围内，或明确设为未知。');
 const selected=new Set(intent.segmentIds),segments=op.kind==='assignment'?assign(doc.segments,selected,op.assignment):op.kind==='swap'?swap(doc.segments,selected):doc.segments.map(s=>!selected.has(s.id)?s:op.kind==='exact'?{...s,assignment:op.assignment,angle:op.angle}:(s.assignment==='M'||s.assignment==='V')?{...s,angle:op.magnitude===null?null:s.assignment==='M'?-op.magnitude:op.magnitude}:s),next={...structuredClone(doc),segments:structuredClone(segments)};
 validateDoc(next);const changedIds=doc.segments.filter((s,i)=>s.assignment!==segments[i].assignment||s.angle!==segments[i].angle).map(s=>s.id),assignmentChanges=doc.segments.filter((s,i)=>s.assignment!==segments[i].assignment).length,angleChanges=doc.segments.filter((s,i)=>s.angle!==segments[i].angle).length;
 let result:Doc;if(intent.cpOnly){const g=structuredClone(old.graph);old.edgeSegmentIds.forEach((id,e)=>{const s=next.segments.find(s=>s.id===id)!;g.edges_assignment[e]=s.assignment;g.edges_foldAngle[e]=s.angle;});next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,g,old.edgeSegmentIds,{startingFace:old.startingFace??0})};result=next;}else result=reconcileMaterialEdit(doc,next);
 const checked=inspectMaterialTopology(result);if(!checked.ok)bad(checked.reason);const faces=old.graph.faces_vertices!.map((_,f)=>f),sameFF=JSON.stringify(old.foldedVertices)===JSON.stringify(checked.foldedVertices);
 return {doc:result,descendants:new Map(doc.segments.map(s=>[s.id,[s.id]])),faceParents:faces,faceSources:faces.map(f=>[f]),referenceEdges:[],insertedIds:[],facesBefore:faces.length,facesAfter:faces.length,addedVertices:0,removedEdges:0,synchronizedBanks:0,placement:checked.foldedVertices?(sameFF?'preserved':'recomputed'):'unavailable',properties:{selectedIds:[...intent.segmentIds],changedIds,assignmentChanges,angleChanges,cpOnly:intent.cpOnly}};
}
