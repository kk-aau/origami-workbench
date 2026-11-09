import type {Doc,Point,Segment} from './types';
import {validateDoc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {materialMix,type MaterialFaceAnchor,type MaterialFaceEditResult} from './materialFaceCommon';
import {appendMaterialAuxiliaryGroup} from './materialCurveModel';
import {bindMaterialAnchor,resolveMaterialAnchor,type MaterialAnchorBinding,type MaterialAnchorStage} from './materialRecipeAnchors';

export type MaterialAuxiliaryPoint={kind:'world';point:Point}|{kind:'material';anchor:MaterialFaceAnchor};
export type MaterialAuxiliaryLine={from:MaterialAuxiliaryPoint;to:MaterialAuxiliaryPoint};
export type MaterialAuxiliaryOperation={kind:'create';lines:(MaterialAuxiliaryLine&{key:string})[]}|{kind:'update';lines:(MaterialAuxiliaryLine&{id:string})[]}|{kind:'remove';ids:string[]};
export type MaterialAuxiliaryIntent={kind:'material-auxiliary';operation:MaterialAuxiliaryOperation;parametric?:boolean};
export type MaterialAuxiliaryBinding={anchors:(MaterialAnchorBinding|null)[];targets:{id:string;source:string}[]};
const keys=(v:object,wanted:string)=>Object.keys(v).sort().join(',')===wanted;
function bad(message:string):never{throw Error(`材料辅助线：${message}`);}
export function materialAuxiliaryPoint(doc:Doc,p:MaterialAuxiliaryPoint):Point{
 if(!p||typeof p!=='object')bad('缺少端点。');
 if(p.kind==='world'){if(!keys(p,'kind,point')||!Array.isArray(p.point)||p.point.length!==2||p.point.some(n=>typeof n!=='number'||!Number.isFinite(n)))bad('坐标须是有限的毫米数值。');return [...p.point];}
 if(p.kind!=='material'||!keys(p,'anchor,kind')||!p.anchor||!keys(p.anchor,'edgeId,fraction'))bad('端点来源无效。');const m=inspectMaterialTopology(doc);if(!m.ok)bad('材料端点需要有效的实际纸张。');const e=m.edgeSegmentIds.indexOf(p.anchor.edgeId),t=p.anchor.fraction;if(e<0||!Number.isFinite(t)||t<0||t>1)bad('材料边或沿边比例无效。');const [a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]);return t===0?[...a]:t===1?[...b]:materialMix(a,b,t);
}
export function editMaterialAuxiliary(doc:Doc,intent:MaterialAuxiliaryIntent):MaterialFaceEditResult{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置无效。');const {parametric:_,...recipe}=intent??{};return intent?.parametric?appendMaterialAuxiliaryGroup(doc,recipe as MaterialAuxiliaryIntent):buildMaterialAuxiliary(doc,recipe as MaterialAuxiliaryIntent);
}
/** Auxiliary marks never split, weld, fold or resize the paper. */
export function buildMaterialAuxiliary(doc:Doc,intent:MaterialAuxiliaryIntent):MaterialFaceEditResult{
 validateDoc(doc);const m=inspectMaterialTopology(doc);if(!m.ok&&(Object.hasOwn(doc.metadata??{},'materialTopology')||doc.segments.some(s=>s.assignment!=='A')))bad(m.reason);
 if(!intent||!keys(intent,'kind,operation')||intent.kind!=='material-auxiliary'||!intent.operation||typeof intent.operation!=='object')bad('操作字段无效。');const op=intent.operation;
 if(!['create','update','remove'].includes(op.kind)||!keys(op,op.kind==='remove'?'ids,kind':'kind,lines'))bad('操作类型或字段无效。');const count:unknown=op.kind==='remove'?op.ids:op.lines;if(!Array.isArray(count)||!count.length||count.length>32||Array.from(count).some(v=>v===undefined))bad('每组请选择1–32条辅助线。');
 const targets=op.kind==='remove'?op.ids:op.kind==='update'?op.lines.map(l=>l?.id):[],existing=new Map(doc.segments.map(s=>[s.id,s]));if(new Set(targets).size!==targets.length||targets.some(id=>typeof id!=='string'||existing.get(id)?.assignment!=='A'))bad('只能明确编辑或删除存在的辅助线。');
 const added:Segment[]=[],createdKeys:string[]=[],changed:string[]=[],removed=new Set(op.kind==='remove'?op.ids:[]),next=structuredClone(doc),reserved=new Set([...existing.keys(),...(doc.objects??[]).map(o=>o.id)]);
 if(op.kind!=='remove'){
  if(op.lines.some(l=>!l||!keys(l,op.kind==='create'?'from,key,to':'from,id,to')))bad('线段字段无效。');if(op.kind==='create'&&(new Set(op.lines.map(l=>l.key)).size!==op.lines.length||op.lines.some(l=>typeof l.key!=='string'||!/^line-[1-9]\d{0,5}$/.test(l.key))))bad('新辅助线必须有独立、稳定的局部编号。');
  for(const line of op.lines){const a=materialAuxiliaryPoint(doc,line.from),b=materialAuxiliaryPoint(doc,line.to);if(a[0]===b[0]&&a[1]===b[1])bad('辅助线两端不能重合。');if(op.kind==='create'){const key=(line as MaterialAuxiliaryLine&{key:string}).key;let id=`material-auxiliary-${key}`,n=1;while(reserved.has(id))id=`material-auxiliary-${key}-${n++}`;reserved.add(id);added.push({id,a,b,assignment:'A',angle:0});createdKeys.push(key);}else{const id=(line as MaterialAuxiliaryLine&{id:string}).id,s=next.segments.find(s=>s.id===id)!;if(JSON.stringify([s.a,s.b])!==JSON.stringify([a,b]))changed.push(id);s.a=a;s.b=b;}}
 }
 next.segments=next.segments.filter(s=>!removed.has(s.id)).concat(added);validateDoc(next);const faces=m.ok?m.graph.faces_vertices!.map((_,f)=>f):[],createdIds=added.map(s=>s.id);
 return {doc:next,descendants:new Map(doc.segments.map(s=>[s.id,removed.has(s.id)?[]:[s.id]])),faceParents:faces,faceSources:faces.map(f=>[f]),referenceEdges:[],insertedIds:createdIds,facesBefore:faces.length,facesAfter:faces.length,addedVertices:0,removedEdges:0,synchronizedBanks:0,placement:m.ok&&m.foldedVertices?'preserved':'unavailable',auxiliary:{createdIds,createdKeys,changedIds:changed,removedIds:[...removed]}};
}
const points=(r:MaterialAuxiliaryIntent)=>r.operation.kind==='remove'?[]:r.operation.lines.flatMap(l=>[l.from,l.to]);
const targetIds=(r:MaterialAuxiliaryIntent)=>r.operation.kind==='remove'?r.operation.ids:r.operation.kind==='update'?r.operation.lines.map(l=>l.id):[];
export function bindMaterialAuxiliaryRecipe(doc:Doc,r:MaterialAuxiliaryIntent,stages:MaterialAnchorStage[]):MaterialAuxiliaryBinding{
 buildMaterialAuxiliary(doc,r);return {anchors:points(r).map(p=>p.kind==='material'?bindMaterialAnchor(p.anchor,stages):null),targets:targetIds(r).map(id=>{const owner=stages.find(s=>s.doc.segments.some(a=>a.id===id&&a.assignment==='A'));if(!owner)bad('辅助线没有保存的来源。');return {id,source:owner.id};})};
}
export function resolveMaterialAuxiliaryRecipe(doc:Doc,r:MaterialAuxiliaryIntent,binding:MaterialAuxiliaryBinding,stages:MaterialAnchorStage[]):MaterialAuxiliaryIntent{
 if(!binding||!keys(binding,'anchors,targets')||!Array.isArray(binding.anchors)||!Array.isArray(binding.targets)||binding.anchors.length!==points(r).length||binding.targets.length!==targetIds(r).length)bad('保存的辅助线来源字段无效。');const refs=points(r).map((p,i)=>{const a=binding.anchors[i];if(p.kind==='world'){if(a!==null)bad('固定坐标不能有未声明的绑定。');return p;}if(!a)bad('材料端点缺少来源。');return {kind:'material' as const,anchor:resolveMaterialAnchor(a,stages)};});
 binding.targets.forEach((a,i)=>{if(!a||!keys(a,'id,source')||a.id!==targetIds(r)[i]||typeof a.source!=='string'||!stages.some(s=>s.id===a.source&&s.doc.segments.some(v=>v.id===a.id&&v.assignment==='A'))||!doc.segments.some(v=>v.id===a.id&&v.assignment==='A'))bad('辅助线来源已删除，未按坐标寻找替代线。');});
 if(r.operation.kind==='remove')return r;const lines=r.operation.lines.map((l,i)=>({...l,from:refs[2*i],to:refs[2*i+1]}));return {...r,operation:{...r.operation,lines} as MaterialAuxiliaryOperation};
}
