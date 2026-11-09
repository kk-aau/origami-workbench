/** Ordered saved material construction recipes. A changed material is never overwritten by replay. */
import {materialOuterContour} from './materialWeak';
import type {Doc,Segment} from './types';
import {validateDoc} from './types';
import {inspectMaterialTopology,materialTopologySchema,type MaterialTopologyData} from './materialTopology';
import {materialFaceInside} from './materialRings';
import {buildMaterialCurveGeometry,materialCurveIdentities,materialCurveNodeIdentities,materialCurvesWithNodeIdentities,type MaterialCurveIntent} from './materialCurves';
import {buildMaterialNetworkGeometry,type MaterialFaceNetworkIntent} from './materialNetwork';
import {materialRoot} from './materialFaceCommon';
import {traceMaterialFaces,traceMaterialRay,type MaterialFaceTraceIntent,type MaterialFaceRayIntent} from './materialTrace';
import {traceMaterialBatch,type MaterialTraceBatchIntent} from './materialTraceBatch';
import {buildMaterialTopologyGeometry,bindMaterialTopologyRecipe,resolveMaterialTopologyRecipe,type MaterialTopologyRecipe,type MaterialTopologyBinding} from './materialTopologyRecipe';
import {buildMaterialComponentTransform,bindMaterialSelection,resolveMaterialSelection,type MaterialComponentTransformIntent} from './materialComponentTransform';
import {buildMaterialCopyGeometry,bindMaterialCopySelection,resolveMaterialCopySelection} from './materialCopyRecipe';
import type {MaterialCopyIntent} from './materialCopy';
import {bindMaterialAnchor,resolveMaterialAnchor,materialCurveSideProofs,type MaterialAnchorBinding,type MaterialAnchorStage} from './materialRecipeAnchors';
import type {MaterialFaceEditResult} from './materialFaceCommon';
import {buildMaterialFaceInsert,buildMaterialFaceRemove,type MaterialFaceInsertIntent,type MaterialFaceRemoveIntent} from './materialFaceEdit';
import {bindMaterialFaceRegion,resolveMaterialFaceRegion,type MaterialFaceRegion} from './materialFaceRegion';
import type {MaterialConstructionCopyIntent} from '../app/materialConstructionCopy';
import {buildMaterialConstructionCopyGeometry} from './materialConstructionCopyRecipe';
import {bindMaterialCopySources} from './materialCopyRecipe';
import {buildMaterialClipboardGeometry,freezeMaterialClipboard,type MaterialClipboardRecipe} from './materialClipboardRecipe';
import {prepareMaterialClipboardTarget} from '../app/materialClipboard';
import {createMaterialTopology} from './materialTopology';
import {buildMaterialEdgeReflect,type MaterialEdgeReflectIntent} from './materialReflect';
import {bindMaterialReflectRecipe,resolveMaterialReflectRecipe,type MaterialReflectBinding} from './materialReflectRecipe';
import type {MaterialConstructionMoveIntent} from '../app/materialConstructionMove';
import {buildMaterialConstructionMoveGeometry} from './materialConstructionMoveRecipe';
import {buildMaterialLineProperties,type MaterialLinePropertiesIntent} from './materialLineProperties';
import {buildMaterialReferenceFace,type MaterialReferenceFaceIntent} from './materialReferenceFace';
import {resolveStartingFace} from '../app/flatFoldSettings';
import {buildMaterialAuxiliary,bindMaterialAuxiliaryRecipe,resolveMaterialAuxiliaryRecipe,type MaterialAuxiliaryIntent,type MaterialAuxiliaryBinding} from './materialAuxiliary';
const versionOf=(model:MaterialCurveModel)=>Number(model.schema.split('-v').at(-1));
type Snapshot={topology:MaterialTopologyData|null;segments:Segment[];auxiliarySegments?:Segment[];flatFold?:Doc['flatFold']};
export type MaterialTraceRecipe=MaterialFaceTraceIntent|MaterialFaceRayIntent|MaterialTraceBatchIntent;
export type MaterialFaceOperationRecipe=MaterialFaceInsertIntent|MaterialFaceRemoveIntent;
export type MaterialGroupRecipe=MaterialAuxiliaryIntent|MaterialReferenceFaceIntent|MaterialLinePropertiesIntent|MaterialConstructionMoveIntent|MaterialEdgeReflectIntent|MaterialClipboardRecipe|MaterialConstructionCopyIntent|MaterialFaceOperationRecipe|MaterialCopyIntent|MaterialCurveIntent|MaterialFaceNetworkIntent|MaterialTraceRecipe|MaterialTopologyRecipe|MaterialComponentTransformIntent;
const isTopology=(r:MaterialGroupRecipe):r is MaterialTopologyRecipe=>r.kind==='material-cut'||r.kind==='material-join';
const isTrace=(r:MaterialGroupRecipe):r is MaterialTraceRecipe=>['material-face-trace','material-face-ray','material-face-traces'].includes(r.kind);
const isClipboard=(r:MaterialGroupRecipe):r is MaterialClipboardRecipe=>r.kind==='material-clipboard-paste'||r.kind==='material-clipboard-cut';
const isCopy=(r:MaterialGroupRecipe):r is MaterialCopyIntent|MaterialConstructionCopyIntent=>r.kind==='material-copy'||r.kind==='material-construction-copy';
const anchors=(r:MaterialTraceRecipe)=>r.kind==='material-face-traces'?r.lines.flatMap(l=>[l.from,l.to]):r.kind==='material-face-ray'?[r.from]:[r.from,r.to];
export type MaterialCurveGroup={id:string;recipe:MaterialGroupRecipe;baseFace:number;baseComponent:number;baseFaces?:number[];anchors?:MaterialAnchorBinding[];edges?:MaterialTopologyBinding[];selection?:MaterialAnchorBinding[];auxiliaryIds?:string[];region?:MaterialFaceRegion;reflection?:MaterialReflectBinding;auxiliaryBinding?:MaterialAuxiliaryBinding};
export type MaterialCurveModel={schema:'zhezhi-material-curve-model-v1'|'zhezhi-material-curve-model-v2'|'zhezhi-material-curve-model-v3'|'zhezhi-material-curve-model-v4'|'zhezhi-material-curve-model-v5'|'zhezhi-material-curve-model-v6'|'zhezhi-material-curve-model-v7'|'zhezhi-material-curve-model-v8'|'zhezhi-material-curve-model-v9'|'zhezhi-material-curve-model-v10'|'zhezhi-material-curve-model-v11'|'zhezhi-material-curve-model-v12'|'zhezhi-material-curve-model-v13'|'zhezhi-material-curve-model-v14'|'zhezhi-material-curve-model-v15'|'zhezhi-material-curve-model-v16';base:Snapshot;baseConstruction?:unknown;groups:MaterialCurveGroup[];nextId:number;applied:Snapshot};
export type MaterialCurveModelIntent={kind:'material-curve-group-edit';group:string;recipe:MaterialGroupRecipe}|{kind:'material-curve-group-remove';group:string}|{kind:'material-curves-rebase'};
type Geometry=MaterialFaceEditResult;
const build=(doc:Doc,recipe:MaterialGroupRecipe):Geometry=>recipe.kind==='material-auxiliary'?buildMaterialAuxiliary(doc,recipe):recipe.kind==='material-reference-face'?buildMaterialReferenceFace(doc,recipe):recipe.kind==='material-line-properties'?buildMaterialLineProperties(doc,recipe):recipe.kind==='material-construction-move'?buildMaterialConstructionMoveGeometry(doc,recipe):recipe.kind==='material-edge-reflect'?buildMaterialEdgeReflect(doc,recipe):isClipboard(recipe)?buildMaterialClipboardGeometry(doc,recipe):recipe.kind==='material-construction-copy'?buildMaterialConstructionCopyGeometry(doc,recipe):recipe.kind==='material-face-insert'?buildMaterialFaceInsert(doc,recipe):recipe.kind==='material-face-remove'?buildMaterialFaceRemove(doc,recipe):recipe.kind==='material-copy'?buildMaterialCopyGeometry(doc,recipe):recipe.kind==='material-transform'?buildMaterialComponentTransform(doc,recipe):isTopology(recipe)?buildMaterialTopologyGeometry(doc,recipe):recipe.kind==='material-face-curves'?buildMaterialCurveGeometry(doc,recipe):recipe.kind==='material-face-network'?buildMaterialNetworkGeometry(doc,recipe):recipe.kind==='material-face-traces'?traceMaterialBatch(doc,recipe):recipe.kind==='material-face-ray'?traceMaterialRay(doc,material(doc),recipe):traceMaterialFaces(doc,material(doc),recipe);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:object,k:string)=>Object.keys(v).sort().join(',')===k;
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):record(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function bad(message:string):never{throw Error(message);}
function material(doc:Doc){validateDoc(doc);const m=inspectMaterialTopology(doc);if(!m.ok)bad(m.reason);return m;}
const shape=(s:Segment)=>{const {displayColor:_,...value}=s;return structuredClone(value);};
function snapshot(doc:Doc,auxiliary=false,ordinary=false):Snapshot{
 if(ordinary&&!Object.hasOwn(doc.metadata??{},'materialTopology')){validateDoc(doc);return {topology:null,segments:doc.segments.filter(s=>s.assignment!=='A').map(shape),...(auxiliary?{auxiliarySegments:doc.segments.filter(s=>s.assignment==='A').map(shape)}:{}),...(doc.flatFold?{flatFold:structuredClone(doc.flatFold)}:{})};}
 const m=material(doc),bound=new Set(m.edgeSegmentIds),topology:MaterialTopologyData={schema:materialTopologySchema(m.graph),graph:structuredClone(m.graph),edgeSegmentIds:[...m.edgeSegmentIds],...(m.foldedVertices?{foldedVertices:structuredClone(m.foldedVertices)}:{}),...(m.startingFace===undefined?{}:{startingFace:m.startingFace})};
 const root=materialRoot(doc,m);return {topology,segments:doc.segments.filter(s=>bound.has(s.id)).map(shape),...(auxiliary?{auxiliarySegments:doc.segments.filter(s=>s.assignment==='A').map(shape)}:{}),flatFold:{startingFace:materialOuterContour(m.graph,root).map(v=>[...m.graph.vertices_coords[v]]),materialFace:root}};
}
function restore(doc:Doc,s:Snapshot,construction?:unknown){
 if(!record(s)||!keys(s,[...(Object.hasOwn(s,'auxiliarySegments')?['auxiliarySegments']:[]),...(Object.hasOwn(s,'flatFold')?['flatFold']:[]),'segments','topology'].join(','))||!Array.isArray(s.segments)||s.topology!==null&&!record(s.topology)||Object.hasOwn(s,'auxiliarySegments')&&(!Array.isArray(s.auxiliarySegments)||s.auxiliarySegments.some(a=>a.assignment!=='A')))bad('参数曲线的原材料快照格式无效。');
 const next=structuredClone(doc),colors=new Map(doc.segments.map(s=>[s.id,s.displayColor]));
 next.segments=[...s.segments,...(s.auxiliarySegments??doc.segments.filter(s=>s.assignment==='A'))].map(s=>({...structuredClone(s),...(colors.get(s.id)?{displayColor:colors.get(s.id)}:{})}));
 next.metadata={...next.metadata};if(s.topology)next.metadata.materialTopology=structuredClone(s.topology);else delete next.metadata.materialTopology;delete next.metadata.materialCurveModel;if(construction===undefined)delete next.metadata.materialCurveConstruction;else next.metadata.materialCurveConstruction=structuredClone(construction);
 if(s.flatFold)next.flatFold=structuredClone(s.flatFold);else delete next.flatFold;if(s.topology)material(next);else validateDoc(next);return next;
}
/** Imported faces occupy a separate stable origin namespace per paste group. */
const originTag=(id:string)=>Number(id.slice(12))*65536;
function baseMaterialDoc(doc:Doc,model:MaterialCurveModel){
 const raw=restore(doc,model.base,model.baseConstruction);if(model.base.topology)return raw;
 if(!raw.segments.some(s=>s.assignment!=='A'))return raw;
 const first=model.groups[0]?.recipe;if(first?.kind!=='material-clipboard-paste')return raw;
 const prepared=prepareMaterialClipboardTarget(raw,first.splitTarget);if(!prepared)return raw;const m=prepared.material;
 return {...prepared.doc,metadata:{...prepared.doc.metadata,materialTopology:createMaterialTopology(prepared.doc,m.graph,m.edgeSegmentIds,{startingFace:m.startingFace??0,...(m.foldedVertices?{foldedVertices:m.foldedVertices}:{})})}};
}
function originCatalog(doc:Doc,model:MaterialCurveModel){
 const components=new Map<number,number>(),base=inspectMaterialTopology(baseMaterialDoc(doc,model));
 if(base.ok)base.components.forEach((c,i)=>c.faces.forEach(f=>components.set(f,i)));
 for(const g of model.groups)if(g.recipe.kind==='material-clipboard-paste'){const m=material(g.recipe.clipboard.doc),tag=originTag(g.id);m.components.forEach((c,i)=>c.faces.forEach(f=>components.set(tag+f,tag+i)));}
 return components;
}
function originComponent(doc:Doc,model:MaterialCurveModel,face:number){const c=originCatalog(doc,model).get(face);if(c===undefined)bad('原材料来源已不存在，未转绑目标面。');return c;}
function read(doc:Doc):MaterialCurveModel{
 const value=doc.metadata?.materialCurveModel;if(!record(value)||!keys(value,Object.hasOwn(value,'baseConstruction')?'applied,base,baseConstruction,groups,nextId,schema':'applied,base,groups,nextId,schema')||!/^zhezhi-material-curve-model-v(?:[1-9]|1[0-6])$/.test(String(value.schema))||!Array.isArray(value.groups)||value.groups.length>8||!Number.isInteger(value.nextId)||Number(value.nextId)<1||Number(value.nextId)>1_000_000)bad('没有可重算的参数构造模型，或模型版本/字段无效。');
 const model=structuredClone(value) as unknown as MaterialCurveModel;restore(doc,model.base,model.baseConstruction);
 const version=versionOf(model),auxiliary=version>=6&&(version<15||Object.hasOwn(model.base,'auxiliarySegments'));if(version<9&&(model.base.topology===null||model.applied?.topology===null))bad('旧模型不能包含空材料快照。');const catalog=originCatalog(doc,model);
 const validRecipe=(g:MaterialCurveGroup)=>record(g.recipe)&&!Object.hasOwn(g.recipe,'parametric')&&(g.recipe.kind==='material-face-curves'||version>=2&&g.recipe.kind==='material-face-network'||version>=3&&isTrace(g.recipe)||version>=4&&isTopology(g.recipe)||version>=5&&g.recipe.kind==='material-transform'||auxiliary&&g.recipe.kind==='material-copy'||version>=7&&['material-face-insert','material-face-remove'].includes(g.recipe.kind)||version>=8&&g.recipe.kind==='material-construction-copy'||version>=9&&isClipboard(g.recipe)||version>=10&&g.recipe.kind==='material-edge-reflect'||version>=11&&g.recipe.kind==='material-construction-move'||version>=12&&g.recipe.kind==='material-line-properties'||version>=13&&g.recipe.kind==='material-reference-face'||version>=14&&g.recipe.kind==='material-auxiliary');
 const groupKeys=(g:MaterialCurveGroup)=>g.recipe.kind==='material-auxiliary'?'auxiliaryBinding,baseComponent,baseFace,id,recipe':g.recipe.kind==='material-reference-face'?(g.recipe.face===null?'baseComponent,baseFace,id,recipe':'baseComponent,baseFace,id,recipe,region'):g.recipe.kind==='material-line-properties'?'baseComponent,baseFace,edges,id,recipe':g.recipe.kind==='material-construction-move'?'auxiliaryIds,baseComponent,baseFace,id,recipe,selection':g.recipe.kind==='material-edge-reflect'?'baseComponent,baseFace,id,recipe,reflection':g.recipe.kind==='material-clipboard-paste'?'baseComponent,baseFace,id,recipe':g.recipe.kind==='material-clipboard-cut'?'auxiliaryIds,baseComponent,baseFace,id,recipe,selection':g.recipe.kind==='material-face-insert'?'anchors,baseComponent,baseFace,id,recipe,region':g.recipe.kind==='material-face-remove'?'baseComponent,baseFace,edges,id,recipe':isTrace(g.recipe)?'anchors,baseComponent,baseFace,id,recipe':isTopology(g.recipe)?'baseComponent,baseFace,edges,id,recipe':isCopy(g.recipe)?'auxiliaryIds,baseComponent,baseFace,id,recipe,selection':g.recipe.kind==='material-transform'?'baseComponent,baseFace,id,recipe,selection':'baseComponent,baseFace,id,recipe';
 if(model.groups.some(g=>!record(g)||!validRecipe(g)||!keys(g,Object.hasOwn(g,'baseFaces')?[...groupKeys(g).split(','),'baseFaces'].sort().join(','):groupKeys(g))||Object.hasOwn(g,'baseFaces')&&(version<7||!['material-face-curves','material-face-network'].includes(g.recipe.kind)||!Array.isArray(g.baseFaces)||!g.baseFaces.length||new Set(g.baseFaces).size!==g.baseFaces.length||!g.baseFaces.includes(g.baseFace)||g.baseFaces.some(f=>!Number.isInteger(f)||!catalog.has(f)))||typeof g.id!=='string'||!/^curve-group-[1-9]\d{0,5}$/.test(g.id)||!Number.isInteger(g.baseFace)||(g.recipe.kind==='material-auxiliary'?g.baseFace!==-1:!catalog.has(g.baseFace))||!Number.isInteger(g.baseComponent)||(g.recipe.kind==='material-auxiliary'?g.baseComponent!==-1:g.baseComponent!==catalog.get(g.baseFace))||g.recipe.kind==='material-auxiliary'&&!record(g.auxiliaryBinding)||['material-transform','material-copy','material-construction-copy','material-clipboard-cut','material-construction-move'].includes(g.recipe.kind)&&!Array.isArray(g.selection)||(isCopy(g.recipe)||g.recipe.kind==='material-clipboard-cut'||g.recipe.kind==='material-construction-move')&&!Array.isArray(g.auxiliaryIds)||g.recipe.kind==='material-edge-reflect'&&!record(g.reflection)||g.recipe.kind==='material-reference-face'&&g.recipe.face!==null&&!record(g.region)||g.recipe.kind==='material-face-insert'&&(!Array.isArray(g.anchors)||g.anchors.length!==2||!record(g.region))||(isTopology(g.recipe)||g.recipe.kind==='material-face-remove'||g.recipe.kind==='material-line-properties')&&!Array.isArray(g.edges)||isTrace(g.recipe)&&(!Array.isArray(g.anchors)||g.anchors.length!==anchors(g.recipe).length))||new Set(model.groups.map(g=>g.id)).size!==model.groups.length||model.groups.some(g=>Number(g.id.slice(12))>=model.nextId))bad('参数构造组或原材料参考身份无效。');
 for(const group of model.groups)if(group.recipe.kind==='material-face-curves')group.recipe.curveIds=materialCurveIdentities(group.recipe);
 if(!record(model.applied)||Object.hasOwn(model.base,'auxiliarySegments')!==auxiliary||Object.hasOwn(model.applied,'auxiliarySegments')!==auxiliary)bad('参数复制模型的辅助线快照版本不一致。');
 restore(doc,model.applied);if(!equal(snapshot(doc,auxiliary,version>=9),model.applied))bad('材料已在参数组外修改；为保留后续工作，不能重算旧组。可从当前材料建立新模型。');return model;
}
/** References follow an original material face and a strict interior point,
 * never an old face number that can now denote a different material piece. */
function replay(doc:Doc,model:MaterialCurveModel,refreshReferences=false,migrateFrom?:MaterialAnchorStage[]){
 let stage=restore(doc,model.base,model.baseConstruction),baseDoc=baseMaterialDoc(doc,model),base=inspectMaterialTopology(baseDoc),origins=base.ok?base.graph.faces_vertices!.map((_,f)=>[f]):[],parents=origins.map(row=>row[0]);let baseIds=new Set(base.ok?base.edgeSegmentIds:[]);const stages:Doc[]=[],results:Geometry[]=[],anchorStages:MaterialAnchorStage[]=[{id:'base',doc:baseDoc}];
 for(const group of model.groups){
  stages.push(stage);const inspected=inspectMaterialTopology(stage),m=inspected.ok?inspected:null;if(!inspected.ok&&!isClipboard(group.recipe)&&group.recipe.kind!=='material-auxiliary')bad(inspected.reason);
  if(migrateFrom){const original=migrateFrom.slice(0,results.length+1),upgrade=(binding:MaterialAnchorBinding)=>{const next=bindMaterialAnchor(resolveMaterialAnchor(binding,original),anchorStages);if('curve'in next&&'curve'in binding&&next.source===binding.source&&next.curve.identity===binding.curve.identity)return {...next,parameter:binding.parameter};return 'curve'in next?next:binding;};mapGroupAnchors(group,upgrade);}

  if(group.recipe.kind==='material-auxiliary'){
   const resolved=resolveMaterialAuxiliaryRecipe(stage,group.recipe,group.auxiliaryBinding!,anchorStages);if(refreshReferences)group.recipe=resolved;else if(!equal(resolved,group.recipe))bad('辅助线端点与保存的材料来源不一致。');
  }else if(group.recipe.kind==='material-reference-face'){
   if(group.recipe.face!==null){const face=resolveMaterialFaceRegion(stage,group.region!,anchorStages,refreshReferences);if(!origins[face].includes(group.baseFace))bad('参考面已不属于原材料来源。');if(refreshReferences)group.recipe={...group.recipe,face};else if(face!==group.recipe.face)bad('参考面与原材料来源不一致。');}
  }else if(group.recipe.kind==='material-line-properties'){
   const resolved=resolveMaterialTopologyRecipe({kind:'material-cut',segmentIds:group.recipe.segmentIds},group.edges!,anchorStages);if(resolved.kind!=='material-cut')bad('属性来源无效。');if(refreshReferences)group.recipe={...group.recipe,segmentIds:resolved.segmentIds};else if(!equal(group.recipe.segmentIds,resolved.segmentIds))bad('保存属性选区与原材料完整区间不一致。');
  }else if(group.recipe.kind==='material-edge-reflect'){
   const resolved=resolveMaterialReflectRecipe(stage,group.recipe,group.reflection!,anchorStages);if(refreshReferences)group.recipe=resolved;else if(!equal(resolved,group.recipe))bad('保存镜像线段与完整来源区间不一致。');
  }else if(group.recipe.kind==='material-clipboard-paste'){
   if(!equal(group.recipe.clipboard,freezeMaterialClipboard(group.recipe.clipboard)))bad('粘贴源快照含未保存的工程数据。');if(group.baseFace!==originTag(group.id)+(material(group.recipe.clipboard.doc).startingFace??0))bad('粘贴原面必须属于本组独立来源。');
  }else if(group.recipe.kind==='material-face-insert'){
   const [from,to]=group.anchors!.map(a=>resolveMaterialAnchor(a,anchorStages)),face=resolveMaterialFaceRegion(stage,group.region!,anchorStages,refreshReferences,[from,to]),resolved={...group.recipe,face,from,to};if(!origins[face].includes(group.baseFace))bad('插面当前面不属于原材料来源。');if(refreshReferences)group.recipe=resolved;else if(!equal(resolved,group.recipe))bad('插面参数与端点/材料侧来源不一致。');
  }else if(group.recipe.kind==='material-face-remove'){
   const resolved=resolveMaterialTopologyRecipe({kind:'material-cut',segmentIds:group.recipe.segmentIds},group.edges!,anchorStages);if(resolved.kind!=='material-cut')bad('删除来源无效。');if(refreshReferences)group.recipe={...group.recipe,segmentIds:resolved.segmentIds};else if(!equal(resolved.segmentIds,group.recipe.segmentIds))bad('删除内边与完整来源区间不一致。');
  }else if(isCopy(group.recipe)||group.recipe.kind==='material-clipboard-cut'||group.recipe.kind==='material-construction-move'){
   const segmentIds=resolveMaterialCopySelection(stage,group.selection!,group.auxiliaryIds!,anchorStages);if(refreshReferences)group.recipe={...group.recipe,segmentIds};else if(!equal(segmentIds,group.recipe.segmentIds))bad('保存复制源与实际材料来源身份不一致。');
  }else if(group.recipe.kind==='material-transform'){
   const components=resolveMaterialSelection(stage,group.selection!,anchorStages);if(refreshReferences)group.recipe={...group.recipe,components};else if(!equal(components,group.recipe.components))bad('保存的变换部件与来源身份不一致。');
  }else if(isTopology(group.recipe)){
   const resolved=resolveMaterialTopologyRecipe(group.recipe,group.edges!,anchorStages);if(refreshReferences)group.recipe=resolved;else if(!equal(resolved,group.recipe))bad('保存切开/粘合边与来源区间不一致。');
  }else if(isTrace(group.recipe)){
   const recipe=group.recipe,refs=group.anchors!.map(a=>resolveMaterialAnchor(a,anchorStages)),component:number|'all'=recipe.component==='all'?'all':m!.components.findIndex(c=>c.edges.some(e=>m!.edgeSegmentIds[e]===refs[0].edgeId));
   if(component!== 'all'&&component<0)bad('参数组的原材料侧所属部件已不存在。');
   const resolved=recipe.kind==='material-face-traces'?{...recipe,component,lines:recipe.lines.map((l,i)=>({...l,from:refs[2*i],to:refs[2*i+1]}))}:recipe.kind==='material-face-ray'?{...recipe,component,from:refs[0]}:{...recipe,component,from:refs[0],to:refs[1]};
   if(refreshReferences)group.recipe=resolved;else if(component!==recipe.component||anchors(recipe).some((a,i)=>{
    const b=refs[i];if(a.edgeId===b.edgeId)return Math.abs(a.fraction-b.fraction)>Number.EPSILON*64;
    if(![0,1].includes(a.fraction)||![0,1].includes(b.fraction))return true;
    const edgeA=m!.edgeSegmentIds.indexOf(a.edgeId),edgeB=m!.edgeSegmentIds.indexOf(b.edgeId);
    return edgeA<0||edgeB<0||m!.graph.edges_vertices[edgeA][a.fraction]!==m!.graph.edges_vertices[edgeB][b.fraction];
   }))bad('保存端点与原材料来源比例不一致。');
  }else{
   const matches=origins.flatMap((baseFaces,f)=>baseFaces.some(v=>(group.baseFaces??[group.baseFace]).includes(v))&&materialFaceInside(m!.graph,f,group.recipe.kind==='material-face-curves'||group.recipe.kind==='material-face-network'?group.recipe.fixedPoint:[NaN,NaN])?[f]:[]);
   if(matches.length!==1)bad(`构造组 ${group.id} 的固定点没有唯一原材料子面，未按旧编号绑定其它面。`);
   if(refreshReferences)group.recipe.face=matches[0];else if(group.recipe.face!==matches[0])bad('参数构造的面编号与原材料/固定点引用不一致。');
   if(group.baseFaces){if(refreshReferences){group.baseFaces=[...origins[matches[0]]];group.baseFace=group.baseFaces[0];group.baseComponent=originComponent(doc,model,group.baseFace);}else if(!equal(group.baseFaces,origins[matches[0]]))bad('保存的合并面来源集合不一致。');}
  }
  const result=namespaceResult(build(stage,structuredClone(group.recipe)),stage,group.id,anchorStages);
  const sources=result.faceSources??result.faceParents?.map(f=>[f]);if(!sources||sources.some(row=>!row.length&&!result.paste||row.some(f=>!Number.isInteger(f)||!origins[f])))bad('构造未提供完整原面来源，不能保存重放。');
  baseIds=new Set([...baseIds].flatMap(id=>result.descendants.get(id)??[id]));origins=sources.map((row,f)=>row.length?[...new Set(row.flatMap(f=>origins[f]))].sort((a,b)=>a-b):[originTag(group.id)+f-(sources.length-material((group.recipe as import('../app/materialClipboard').MaterialPasteIntent).clipboard.doc).graph.faces_vertices!.length)]);parents=origins.map(row=>row[0]);stage=result.doc;results.push(result);anchorStages.push({id:group.id,doc:stage,result});
 }
 return {doc:stage,stages,results,parents,origins,baseIds,anchorStages};
}
export function inspectMaterialCurveModel(doc:Doc):{ok:true;model:MaterialCurveModel;stages:Doc[];parents:number[];origins:number[][]}|{ok:false;reason:string}{
 try{const model=read(doc),computed=replay(doc,model);if(!equal(snapshot(computed.doc,Object.hasOwn(model.base,'auxiliarySegments'),versionOf(model)>=9),model.applied))bad('参数组独立重算与实际材料不一致；不能信任保存的快照。');return {ok:true,model,stages:computed.stages,parents:computed.parents,origins:computed.origins};}catch(e){return {ok:false,reason:(e as Error).message};}
}
function store(doc:Doc,model:MaterialCurveModel,current:Doc=doc){
 const keyedCurves=model.groups.filter(g=>g.recipe.kind==='material-face-curves'&&g.recipe.curveIds);
 if(versionOf(model)<16&&keyedCurves.some(g=>g.recipe.kind==='material-face-curves'&&g.recipe.curves.some(c=>c.kind!=='ellipse'&&c.nodeIds))){
  model.schema='zhezhi-material-curve-model-v16';
 }else if(versionOf(model)<15&&keyedCurves.length){
  model.schema='zhezhi-material-curve-model-v15';
 }
 const colors=new Map(current.segments.map(s=>[s.id,s.displayColor]));doc={...doc,segments:doc.segments.map(s=>colors.get(s.id)?{...s,displayColor:colors.get(s.id)}:s)};model.applied=snapshot(doc,Object.hasOwn(model.base,'auxiliarySegments'),versionOf(model)>=9);const next={...doc,metadata:{...doc.metadata,materialCurveModel:structuredClone(model)}};validateDoc(next);return next;
}
function newModel(doc:Doc,ordinary=false):MaterialCurveModel{const base=snapshot(doc,ordinary,ordinary);return {schema:ordinary?'zhezhi-material-curve-model-v9':'zhezhi-material-curve-model-v1',base,...(Object.hasOwn(doc.metadata??{},'materialCurveConstruction')?{baseConstruction:structuredClone(doc.metadata!.materialCurveConstruction)}:{}),groups:[],nextId:1,applied:structuredClone(base)};}
/** Migrate legacy anchors only while their original geometry has independently
 * replayed. Full-edge intervals keep their conservative legacy contract. */
function mapGroupAnchors(group:MaterialCurveGroup,upgrade:(binding:MaterialAnchorBinding)=>MaterialAnchorBinding){
 if(group.anchors)group.anchors=group.anchors.map(upgrade);if(group.selection)group.selection=group.selection.map(upgrade);if(group.region)group.region.anchor=upgrade(group.region.anchor);if(group.auxiliaryBinding)group.auxiliaryBinding.anchors=group.auxiliaryBinding.anchors.map(binding=>binding?upgrade(binding):null);
}
function upgradeContinuousAnchors(doc:Doc,model:MaterialCurveModel){
 const original=replay(doc,model);
 for(const group of model.groups)if(group.recipe.kind==='material-face-curves')group.recipe.curves=materialCurvesWithNodeIdentities(group.recipe.curves);
 // Original references are first proved against the unchanged old replay.
 // Rebind on the identical new replay while each preceding source is present.
 replay(doc,model,true,original.anchorStages);
}

function namespaceResult<T extends Geometry>(result:T,source:Doc,group:string,stages?:MaterialAnchorStage[]):T{
 if(result.curveSources&&stages){const proof=materialCurveSideProofs(source,stages);result.curveSources=result.curveSources.map(interval=>{const side=proof.faces[interval.inputFace];if(proof.faces.filter(value=>value===side).length!==1)bad('曲线没有唯一可证明的输入材料侧。');return {...interval,side,fromBanks:[...new Set(interval.fromBanks.map(id=>proof.banks.get(id)!))].sort(),toBanks:[...new Set(interval.toBanks.map(id=>proof.banks.get(id)!))].sort()};});}

 const existing=new Set([...source.segments.map(s=>s.id),...(source.objects??[]).map(o=>o.id)]),inserted=new Set(result.insertedIds??(result.insertedId?[result.insertedId]:[])),map=new Map<string,string>();let crease=0,part=0;
 const copyNames=new Map<string,string>();if(result.auxiliary)result.auxiliary.createdIds.forEach((id,i)=>copyNames.set(id,`${group}::aux-${result.auxiliary!.createdKeys[i]}`));if(result.copy){const c=result.copy,size=c.copiedIds.length/c.copies,materialIds=new Set((result.doc.metadata!.materialTopology as MaterialTopologyData).edgeSegmentIds);let edge=0,aux=0;c.copiedIds.forEach((id,i)=>{if(i%size===0){edge=0;aux=0;}copyNames.set(id,`${group}::copy-${Math.floor(i/size)}-${materialIds.has(id)?'edge-'+edge++:'aux-'+aux++}`);});}
 for(const s of result.doc.segments){if(existing.has(s.id))continue;const base=copyNames.get(s.id)??`${group}::${inserted.has(s.id)?'crease-'+crease++:'part-'+part++}`;let id=base,n=1;while(existing.has(id))id=`${base}-${n++}`;existing.add(id);map.set(s.id,id);}
 const convert=(id:string)=>map.get(id)??id;if(result.curveSources)result.curveSources=result.curveSources.map(s=>({...s,edgeId:convert(s.edgeId)}));result.doc.segments=result.doc.segments.map(s=>({...s,id:convert(s.id)}));const topology=result.doc.metadata?.materialTopology as MaterialTopologyData|undefined;if(topology)topology.edgeSegmentIds=topology.edgeSegmentIds.map(convert);
 if(result.auxiliary){result.auxiliary.createdIds=result.auxiliary.createdIds.map(convert);result.auxiliary.changedIds=result.auxiliary.changedIds.map(convert);result.auxiliary.removedIds=result.auxiliary.removedIds.map(convert);}if(result.paste)result.paste.pastedIds=result.paste.pastedIds.map(convert);if(result.copy)result.copy.copiedIds=result.copy.copiedIds.map(convert);if(result.referenceEdges)result.referenceEdges=result.referenceEdges.map(convert);result.insertedIds=(result.insertedIds??(result.insertedId?[result.insertedId]:[])).map(convert);if(result.insertedId)result.insertedId=convert(result.insertedId);if(result.batch)result.batch.pieces=result.batch.pieces.map(p=>({...p,id:convert(p.id)}));if(result.curves)(result.doc.metadata!.materialCurveConstruction as {insertedSegmentIds:string[]}).insertedSegmentIds=[...result.insertedIds];result.descendants=new Map([...result.descendants].map(([id,ids])=>[id,ids.map(convert)]));if(result.clipboardCut?.empty||result.auxiliary&&!Object.hasOwn(result.doc.metadata??{},'materialTopology'))validateDoc(result.doc);else material(result.doc);return result;
}
export function appendMaterialCurveGroup(doc:Doc,recipe:MaterialCurveIntent){
 const present=Object.hasOwn(doc.metadata??{},'materialCurveModel'),checked=present?inspectMaterialCurveModel(doc):null;if(checked&&!checked.ok)bad(checked.reason);
 const model=checked?.ok?checked.model:newModel(doc);if(model.groups.length>=8)bad('参数模型最多8个曲线组，未截断或丢弃已保存的组。');if(model.nextId>=1_000_000)bad('参数曲线组编号已达到容量。');
 const m=material(doc);if(!Number.isInteger(recipe.face)||recipe.face<0||recipe.face>=m.graph.faces_vertices!.length)bad('曲线组参考面无效。');const baseFace=checked?.ok?checked.parents[recipe.face]:recipe.face,baseComponent=originComponent(doc,model,baseFace);
 const id=`curve-group-${model.nextId++}`,source=structuredClone(doc);delete source.metadata!.materialCurveModel;const result=namespaceResult(buildMaterialCurveGeometry(source,recipe),source,id,checked?.ok?replay(doc,model).anchorStages:[{id:'base',doc:source}]);const savedRecipe={...structuredClone(recipe),curves:materialCurvesWithNodeIdentities(recipe.curves),curveIds:materialCurveIdentities(recipe)};if(result.curveSources)result.curveSources=result.curveSources.map(interval=>{const curve=savedRecipe.curves[interval.curve];return curve.kind==='ellipse'?interval:{...interval,nodes:[curve.nodeIds![interval.segment],curve.nodeIds![(interval.segment+1)%curve.nodes.length]] as [string,string]};});model.groups.push({id,recipe:savedRecipe,baseFace,baseComponent,...(versionOf(model)>=7&&checked?.ok?{baseFaces:checked.origins[recipe.face]}:{})});result.doc=store(result.doc,model,doc);return result;
}
/** Recording is an explicit network option. A stale old model is retained in
 * the existing archive, while the actual current material becomes the base. */
export function appendMaterialNetworkGroup(doc:Doc,intent:MaterialFaceNetworkIntent){
 buildMaterialNetworkGeometry(doc,intent); // Validate flags and geometry before any archival/rebase.
 const present=Object.hasOwn(doc.metadata??{},'materialCurveModel'),checked=present?inspectMaterialCurveModel(doc):null;
 const current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,valid=checked?.ok?checked:inspectMaterialCurveModel(current),model=valid.ok?valid.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未截断或丢弃已保存的组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 const {parametric:_,...recipe}=structuredClone(intent),m=material(current),baseFace=valid.ok?valid.parents[recipe.face]:recipe.face,baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const result=namespaceResult(buildMaterialNetworkGeometry(source,recipe),source,id);if(model.schema==='zhezhi-material-curve-model-v1')model.schema='zhezhi-material-curve-model-v2';model.groups.push({id,recipe,baseFace,baseComponent,...(versionOf(model)>=7&&valid.ok?{baseFaces:valid.origins[recipe.face]}:{})});result.doc=store(result.doc,model,current);return result;
}
/** Source edge references are recorded before geometry changes; stale models
 * are archived atomically just as with explicit network recording. */
export function appendMaterialTraceGroup(doc:Doc,intent:MaterialTraceRecipe):Geometry{
 if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');
 const {parametric:_,...recipe}=structuredClone(intent);build(doc,recipe);
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,valid=checked?.ok?checked:inspectMaterialCurveModel(current),model=valid.ok?valid.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 const source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const computed=replay(current,model),m=material(current),face=recipe.component==='all'?materialRoot(current,m):m.components[recipe.component].faces[0],baseFace=computed.parents[face],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,bindings=anchors(recipe).map(a=>bindMaterialAnchor(a,computed.anchorStages)),result=namespaceResult(build(source,recipe),source,id);
 if(versionOf(model)<4)model.schema='zhezhi-material-curve-model-v3';model.groups.push({id,recipe,baseFace,baseComponent,anchors:bindings});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialTopologyGroup(doc:Doc,intent:MaterialTopologyRecipe):Geometry{
 if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=structuredClone(intent);build(doc,recipe);
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,valid=checked?.ok?checked:inspectMaterialCurveModel(current),model=valid.ok?valid.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 const computed=replay(current,model),m=material(current),baseFace=computed.parents[materialRoot(current,m)],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const edges=bindMaterialTopologyRecipe(recipe,computed.anchorStages),resolved=resolveMaterialTopologyRecipe(recipe,edges,computed.anchorStages),result=namespaceResult(build(source,resolved),source,id);if(versionOf(model)<4)model.schema='zhezhi-material-curve-model-v4';model.groups.push({id,recipe:resolved,baseFace,baseComponent,edges});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialTransformGroup(doc:Doc,intent:MaterialComponentTransformIntent):Geometry{
 if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...raw}=structuredClone(intent);build(doc,raw);const recipe={...raw,components:[...raw.components].sort((a,b)=>a-b)};
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,valid=checked?.ok?checked:inspectMaterialCurveModel(current),model=valid.ok?valid.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 const computed=replay(current,model),m=material(current),baseFace=computed.parents[m.components[recipe.components[0]].faces[0]],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const selection=bindMaterialSelection(source,recipe.components,computed.anchorStages),result=namespaceResult(build(source,recipe),source,id);if(versionOf(model)<5)model.schema='zhezhi-material-curve-model-v5';model.groups.push({id,recipe,baseFace,baseComponent,selection});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialCopyGroup(doc:Doc,intent:MaterialCopyIntent):Geometry{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...raw}=structuredClone(intent);build(doc,raw);
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,valid=checked?.ok?checked:inspectMaterialCurveModel(current),model=valid.ok?valid.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 // Older recipes do not alter auxiliaries. Capture their current geometry when
 // upgrading; v6 must replay generated auxiliaries instead of copying them twice.
 if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<6)model.schema='zhezhi-material-curve-model-v6';
 const computed=replay(current,model),m=material(current),bindings=bindMaterialCopySelection(current,raw,computed.anchorStages),segmentIds=resolveMaterialCopySelection(current,bindings.selection,bindings.auxiliaryIds,computed.anchorStages),recipe={...raw,segmentIds},chosen=new Set(segmentIds),component=m.components.find(c=>c.edges.every(e=>chosen.has(m.edgeSegmentIds[e])))!,baseFace=computed.parents[component.faces[0]],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const result=namespaceResult(build(source,recipe),source,id);model.groups.push({id,recipe,baseFace,baseComponent,...bindings});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialConstructionCopyGroup(doc:Doc,intent:MaterialConstructionCopyIntent):Geometry{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...raw}=structuredClone(intent);build(doc,raw);
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,valid=checked?.ok?checked:inspectMaterialCurveModel(current),model=valid.ok?valid.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<8)model.schema='zhezhi-material-curve-model-v8';
 const computed=replay(current,model),m=material(current),bindings=bindMaterialCopySources(current,raw.segmentIds,computed.anchorStages),segmentIds=resolveMaterialCopySelection(current,bindings.selection,bindings.auxiliaryIds,computed.anchorStages),recipe={...raw,segmentIds},chosen=new Set(segmentIds),component=m.components.find(c=>c.edges.every(e=>chosen.has(m.edgeSegmentIds[e])))!,baseFace=computed.parents[component.faces[0]],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const result=namespaceResult(build(source,recipe),source,id);model.groups.push({id,recipe,baseFace,baseComponent,...bindings});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialFaceOperationGroup(doc:Doc,intent:MaterialFaceOperationRecipe):Geometry{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...raw}=structuredClone(intent);build(doc,raw);
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,valid=checked?.ok?checked:inspectMaterialCurveModel(current),model=valid.ok?valid.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<7)model.schema='zhezhi-material-curve-model-v7';
 const computed=replay(current,model),m=material(current),source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const bindings=raw.kind==='material-face-insert'?{anchors:[raw.from,raw.to].map(a=>bindMaterialAnchor(a,computed.anchorStages)),region:bindMaterialFaceRegion(current,raw.face,computed.anchorStages)}:{edges:bindMaterialTopologyRecipe({kind:'material-cut',segmentIds:raw.segmentIds},computed.anchorStages)};
 const resolved=raw.kind==='material-face-insert'?{...raw,face:resolveMaterialFaceRegion(current,bindings.region!,computed.anchorStages),from:resolveMaterialAnchor(bindings.anchors![0],computed.anchorStages),to:resolveMaterialAnchor(bindings.anchors![1],computed.anchorStages)}:{...raw,segmentIds:(resolveMaterialTopologyRecipe({kind:'material-cut',segmentIds:raw.segmentIds},bindings.edges!,computed.anchorStages) as import('./materialCut').MaterialCutIntent).segmentIds};
 const face=resolved.kind==='material-face-insert'?resolved.face:m.graph.edges_faces![m.edgeSegmentIds.indexOf(resolved.segmentIds[0])][0],baseFace=computed.parents[face],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,result=namespaceResult(build(source,resolved),source,id);model.groups.push({id,recipe:resolved,baseFace,baseComponent,...bindings});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialLinePropertiesGroup(doc:Doc,intent:MaterialLinePropertiesIntent):Geometry{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...raw}=structuredClone(intent),initial=build(doc,raw);if(!initial.properties!.changedIds.length&&!(raw.cpOnly&&material(doc).foldedVertices))bad('所选属性没有变化，未添加参数组。');
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,model=checked?.ok?checked.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<12)model.schema='zhezhi-material-curve-model-v12';
 const computed=replay(current,model),edges=bindMaterialTopologyRecipe({kind:'material-cut',segmentIds:raw.segmentIds},computed.anchorStages),ids=(resolveMaterialTopologyRecipe({kind:'material-cut',segmentIds:raw.segmentIds},edges,computed.anchorStages) as import('./materialCut').MaterialCutIntent).segmentIds,recipe={...raw,segmentIds:ids},m=material(current),face=m.graph.edges_faces![m.edgeSegmentIds.indexOf(ids[0])][0],baseFace=computed.parents[face],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;const result=namespaceResult(build(source,recipe),source,id);model.groups.push({id,recipe,edges,baseFace,baseComponent});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialAuxiliaryGroup(doc:Doc,intent:MaterialAuxiliaryIntent):Geometry{
 const {parametric:_,...raw}=structuredClone(intent),pure=build(doc,raw);if(!pure.auxiliary!.createdIds.length&&!pure.auxiliary!.changedIds.length&&!pure.auxiliary!.removedIds.length)bad('辅助线没有变化。');
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,model=checked?.ok?checked.model:newModel(current,!inspectMaterialTopology(current).ok);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<14)model.schema='zhezhi-material-curve-model-v14';
 const computed=replay(current,model),auxiliaryBinding=bindMaterialAuxiliaryRecipe(current,raw,computed.anchorStages),recipe=resolveMaterialAuxiliaryRecipe(current,raw,auxiliaryBinding,computed.anchorStages),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;const result=namespaceResult(build(source,recipe),source,id);model.groups.push({id,recipe,baseFace:-1,baseComponent:-1,auxiliaryBinding});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialReferenceFaceGroup(doc:Doc,intent:MaterialReferenceFaceIntent):Geometry{
 const {parametric:_,...raw}=structuredClone(intent),pure=build(doc,raw);
 if(!pure.referenceFace!.changed)bad('参考面没有变化。');
 // A stale contour is repaired using the explicit new choice before taking a
 // base snapshot. Any existing invalid recipe is archived by the usual flow.
 const before=material(doc),seed=resolveStartingFace(doc,before.graph).stale?pure.doc:doc,checked=Object.hasOwn(seed.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(seed):null,current=checked&&!checked.ok?editMaterialCurveModel(seed,{kind:'material-curves-rebase'}).doc:seed,model=checked?.ok?checked.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<13)model.schema='zhezhi-material-curve-model-v13';
 const computed=replay(current,model),m=material(current),face=raw.face??m.startingFace??0,baseFace=computed.parents[face],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const result=namespaceResult(build(source,raw),source,id),group={id,recipe:raw,baseFace,baseComponent};model.groups.push(raw.face===null?group:{...group,region:bindMaterialFaceRegion(current,face,computed.anchorStages)});result.doc=store(result.doc,model,current);result.referenceFace=pure.referenceFace;return result;
}
export function appendMaterialConstructionMoveGroup(doc:Doc,intent:MaterialConstructionMoveIntent):Geometry{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')bad('保存参数设置必须为布尔值。');const {parametric:_,...raw}=structuredClone(intent);build(doc,raw);
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,model=checked?.ok?checked.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<11)model.schema='zhezhi-material-curve-model-v11';
 const computed=replay(current,model),bindings=bindMaterialCopySources(current,raw.segmentIds,computed.anchorStages),segmentIds=resolveMaterialCopySelection(current,bindings.selection,bindings.auxiliaryIds,computed.anchorStages),recipe={...raw,segmentIds},m=material(current),chosen=new Set(segmentIds),component=m.components.find(c=>c.edges.every(e=>chosen.has(m.edgeSegmentIds[e])))!,baseFace=computed.parents[component.faces[0]],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;
 const result=namespaceResult(build(source,recipe),source,id);model.groups.push({id,recipe,baseFace,baseComponent,...bindings});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialReflectGroup(doc:Doc,intent:MaterialEdgeReflectIntent):Geometry{
 const {parametric:_,...raw}=structuredClone(intent);build(doc,raw);const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,model=checked?.ok?checked.model:newModel(current);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<10)model.schema='zhezhi-material-curve-model-v10';
 const computed=replay(current,model),reflection=bindMaterialReflectRecipe(current,raw,computed.anchorStages),recipe=resolveMaterialReflectRecipe(current,raw,reflection,computed.anchorStages),m=material(current),face=m.graph.edges_faces![m.edgeSegmentIds.indexOf(recipe.sourceId)][0],baseFace=computed.parents[face],baseComponent=originComponent(current,model,baseFace),id=`curve-group-${model.nextId++}`,source=structuredClone(current);delete source.metadata!.materialCurveModel;const result=namespaceResult(build(source,recipe),source,id);model.groups.push({id,recipe,reflection,baseFace,baseComponent});result.doc=store(result.doc,model,current);return result;
}
export function appendMaterialClipboardGroup(doc:Doc,intent:MaterialClipboardRecipe):Geometry{
 const {parametric:_,...raw}=structuredClone(intent);build(doc,raw);
 const checked=Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,current=checked&&!checked.ok?editMaterialCurveModel(doc,{kind:'material-curves-rebase'}).doc:doc,model=checked?.ok?checked.model:newModel(current,true);
 if(model.groups.length>=8)bad('参数模型最多8个构造组，未丢弃旧组。');if(model.nextId>=1_000_000)bad('参数构造组编号已达到容量。');
 if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<9)model.schema='zhezhi-material-curve-model-v9';
 const computed=replay(current,model),id=`curve-group-${model.nextId++}`,source=structuredClone(current);source.metadata={...source.metadata};delete source.metadata.materialCurveModel;
 if(raw.kind==='material-clipboard-paste'){
  const recipe={...raw,clipboard:freezeMaterialClipboard(raw.clipboard)},m=material(recipe.clipboard.doc),baseFace=originTag(id)+(m.startingFace??0),baseComponent=originTag(id)+m.components.findIndex(c=>c.faces.includes(m.startingFace??0)),result=namespaceResult(build(source,recipe),source,id);
  model.groups.push({id,recipe,baseFace,baseComponent});result.doc=store(result.doc,model,current);return result;
 }
 const bindings=bindMaterialCopySources(current,raw.segmentIds,computed.anchorStages),segmentIds=resolveMaterialCopySelection(current,bindings.selection,bindings.auxiliaryIds,computed.anchorStages),recipe={...raw,segmentIds},m=material(current),chosen=new Set(segmentIds),component=m.components.find(c=>c.edges.every(e=>chosen.has(m.edgeSegmentIds[e])))!,baseFace=computed.parents[component.faces[0]],baseComponent=originComponent(current,model,baseFace),result=namespaceResult(build(source,recipe),source,id);
 model.groups.push({id,recipe,baseFace,baseComponent,...bindings});result.doc=store(result.doc,model,current);return result;
}
export function editMaterialCurveModel(doc:Doc,intent:MaterialCurveModelIntent):MaterialFaceEditResult{
 validateDoc(doc);const inspected=inspectMaterialTopology(doc),old=inspected.ok?inspected:null;if(!old&&Object.hasOwn(doc.metadata??{},'materialTopology'))bad(inspected.ok?'':inspected.reason);const identity=new Map(doc.segments.map(s=>[s.id,[s.id]]));
 if(intent.kind==='material-curves-rebase'){
  if(!keys(intent,'kind'))bad('新模型操作字段无效。');const next=structuredClone(doc),saved=next.metadata?.materialCurveModel;if(saved!==undefined){const archives=next.metadata!.materialCurveArchives??[];if(!Array.isArray(archives)||archives.length>=8)bad('曲线模型归档格式无效或超过8份；未丢弃旧模型。');next.metadata!.materialCurveArchives=[...structuredClone(archives),structuredClone(saved)];}next.metadata={...next.metadata,materialCurveModel:newModel(doc,!old)};validateDoc(next);return {doc:next,descendants:identity,facesBefore:old?.graph.faces_vertices!.length??0,facesAfter:old?.graph.faces_vertices!.length??0,addedVertices:0,removedEdges:0,synchronizedBanks:0,insertedIds:[],placement:old?.foldedVertices?'preserved':'unavailable'};
 }
 if(!keys(intent,intent.kind==='material-curve-group-edit'?'group,kind,recipe':'group,kind')||typeof intent.group!=='string')bad('参数曲线组编辑意图无效。');
 const checked=inspectMaterialCurveModel(doc);if(!checked.ok)bad(checked.reason);const model=checked.model,index=model.groups.findIndex(g=>g.id===intent.group);if(index<0)bad('参数曲线组已不存在。');
 // Upgrade old direction-only regions while their original geometry is still
 // valid, before changing an earlier mirror or deleting any source operation.
 if(model.groups.some(g=>g.recipe.kind==='material-face-insert'&&!Object.hasOwn(g.region!,'owner')))replay(doc,model,true);
 upgradeContinuousAnchors(doc,model);
 if(intent.kind==='material-curve-group-remove')model.groups.splice(index,1);
 else if(intent.kind==='material-curve-group-edit'){
  const recipe=structuredClone(intent.recipe);if(!recipe||!['material-face-curves','material-face-network','material-face-trace','material-face-ray','material-face-traces','material-cut','material-join','material-transform','material-copy','material-face-insert','material-face-remove','material-construction-copy','material-clipboard-paste','material-clipboard-cut','material-edge-reflect','material-construction-move','material-line-properties','material-reference-face','material-auxiliary'].includes(recipe.kind)||recipe.kind!==model.groups[index].recipe.kind||Object.hasOwn(recipe,'parametric'))bad('新构造组参数或构造类型无效。');const stageMaterial=inspectMaterialTopology(checked.stages[index]),source=stageMaterial.ok?stageMaterial:null,prior=replay(doc,{...model,groups:model.groups.slice(0,index)}),sourceParents=prior.parents;
  if(recipe.kind==='material-face-curves'){
   const previous=model.groups[index].recipe as MaterialCurveIntent;
   if(!Object.hasOwn(recipe,'curveIds')){
    if(recipe.curves.length!==previous.curves.length||recipe.curves.length>1&&!equal(recipe.curves,previous.curves))bad('多曲线变更必须携带持久来源编号，未按数组下标推断身份。');
    recipe.curveIds=materialCurveIdentities(previous);
   }
   materialCurveIdentities(recipe);
   for(const [position,identity] of recipe.curveIds!.entries()){
    const original=previous.curves[previous.curveIds!.indexOf(identity)],replacement=recipe.curves[position];if(replacement.kind==='ellipse')continue;
    if(!Object.hasOwn(replacement,'nodeIds')){
     if(original&&original.kind!=='ellipse'){
      const depended=model.groups.slice(index+1).some(group=>[...(group.anchors??[]),...(group.selection??[]),...(group.auxiliaryBinding?.anchors??[]),group.region?.anchor].some(ref=>ref&&'curve'in ref&&ref.source===model.groups[index].id&&ref.curve.identity===identity));
      if(original.nodes.length!==replacement.nodes.length||depended&&!equal(original.nodes,replacement.nodes))bad('贝塞尔结构或依赖控制点变更必须携带持久节点来源编号，未按当前下标重绑。');
      replacement.nodeIds=materialCurveNodeIdentities(original);
     }else replacement.nodeIds=materialCurveNodeIdentities(replacement);
    }
    materialCurveNodeIdentities(replacement);
    const dependentRefs=model.groups.slice(index+1).flatMap(group=>[...(group.anchors??[]),...(group.selection??[]),...(group.auxiliaryBinding?.anchors??[]),group.region?.anchor]);
    for(const ref of dependentRefs)if(ref&&'curve'in ref&&ref.source===model.groups[index].id&&ref.curve.identity===identity&&'nodes'in ref.curve){const [from,to]=ref.curve.nodes,ids=replacement.nodeIds!,count=ids.length-(replacement.kind==='bezier-path'?1:0);if(!ids.slice(0,count).some((id,i)=>id===from&&ids[(i+1)%ids.length]===to||id===to&&ids[(i+1)%ids.length]===from))bad('贝塞尔来源依赖的原节点对已删除或不再相邻，不能按坐标或当前段编号转绑。');}
   }

  }
  if(recipe.kind==='material-auxiliary'){
   const stage=checked.stages[index];build(stage,recipe);const auxiliaryBinding=bindMaterialAuxiliaryRecipe(stage,recipe,prior.anchorStages),resolved=resolveMaterialAuxiliaryRecipe(stage,recipe,auxiliaryBinding,prior.anchorStages);model.groups[index]={id:model.groups[index].id,recipe:resolved,baseFace:-1,baseComponent:-1,auxiliaryBinding};
  }else if(recipe.kind==='material-reference-face'){
   const stage=checked.stages[index];build(stage,recipe);const face=recipe.face??source!.startingFace??0,baseFace=sourceParents[face],group={id:model.groups[index].id,recipe,baseFace,baseComponent:originComponent(doc,model,baseFace)};model.groups[index]=recipe.face===null?group:{...group,region:bindMaterialFaceRegion(stage,face,prior.anchorStages)};
  }else if(recipe.kind==='material-line-properties'){
   const stage=checked.stages[index];build(stage,recipe);const edges=bindMaterialTopologyRecipe({kind:'material-cut',segmentIds:recipe.segmentIds},prior.anchorStages),ids=(resolveMaterialTopologyRecipe({kind:'material-cut',segmentIds:recipe.segmentIds},edges,prior.anchorStages) as import('./materialCut').MaterialCutIntent).segmentIds,face=source!.graph.edges_faces![source!.edgeSegmentIds.indexOf(ids[0])][0],baseFace=sourceParents[face];model.groups[index]={...model.groups[index],recipe:{...recipe,segmentIds:ids},edges,baseFace,baseComponent:originComponent(doc,model,baseFace)};
  }else if(recipe.kind==='material-edge-reflect'){
   const stage=checked.stages[index];build(stage,recipe);const reflection=bindMaterialReflectRecipe(stage,recipe,prior.anchorStages),resolved=resolveMaterialReflectRecipe(stage,recipe,reflection,prior.anchorStages),face=source!.graph.edges_faces![source!.edgeSegmentIds.indexOf(resolved.sourceId)][0],baseFace=sourceParents[face];model.groups[index]={...model.groups[index],recipe:resolved,reflection,baseFace,baseComponent:originComponent(doc,model,baseFace)};
  }else if(recipe.kind==='material-clipboard-paste'){
   build(checked.stages[index],recipe);recipe.clipboard=freezeMaterialClipboard(recipe.clipboard);const m=material(recipe.clipboard.doc),tag=originTag(model.groups[index].id),baseFace=tag+(m.startingFace??0);model.groups[index]={...model.groups[index],recipe,baseFace,baseComponent:tag+m.components.findIndex(c=>c.faces.includes(m.startingFace??0))};
  }else if(recipe.kind==='material-face-insert'){
   const stage=checked.stages[index];build(stage,recipe);const refs=[recipe.from,recipe.to].map(a=>bindMaterialAnchor(a,prior.anchorStages)),region=bindMaterialFaceRegion(stage,recipe.face,prior.anchorStages),face=resolveMaterialFaceRegion(stage,region,prior.anchorStages),baseFace=sourceParents[face];model.groups[index]={...model.groups[index],recipe:{...recipe,face,from:resolveMaterialAnchor(refs[0],prior.anchorStages),to:resolveMaterialAnchor(refs[1],prior.anchorStages)},anchors:refs,region,baseFace,baseComponent:originComponent(doc,model,baseFace)};
  }else if(recipe.kind==='material-face-remove'){
   const stage=checked.stages[index];build(stage,recipe);const edges=bindMaterialTopologyRecipe({kind:'material-cut',segmentIds:recipe.segmentIds},prior.anchorStages),segmentIds=(resolveMaterialTopologyRecipe({kind:'material-cut',segmentIds:recipe.segmentIds},edges,prior.anchorStages) as import('./materialCut').MaterialCutIntent).segmentIds,face=source!.graph.edges_faces![source!.edgeSegmentIds.indexOf(segmentIds[0])][0],baseFace=sourceParents[face];model.groups[index]={...model.groups[index],recipe:{...recipe,segmentIds},edges,baseFace,baseComponent:originComponent(doc,model,baseFace)};
  }else if(isCopy(recipe)||recipe.kind==='material-clipboard-cut'||recipe.kind==='material-construction-move'){
   const stage=checked.stages[index];build(stage,recipe);const bindings=recipe.kind==='material-copy'?bindMaterialCopySelection(stage,recipe,prior.anchorStages):bindMaterialCopySources(stage,recipe.segmentIds,prior.anchorStages),segmentIds=resolveMaterialCopySelection(stage,bindings.selection,bindings.auxiliaryIds,prior.anchorStages),chosen=new Set(segmentIds),component=source!.components.find(c=>c.edges.every(e=>chosen.has(source!.edgeSegmentIds[e])))!,baseFace=sourceParents[component.faces[0]];model.groups[index]={...model.groups[index],recipe:{...recipe,segmentIds},baseFace,baseComponent:originComponent(doc,model,baseFace),...bindings};
  }else if(recipe.kind==='material-transform'){
   build(checked.stages[index],recipe);const baseFace=sourceParents[source!.components[recipe.components[0]].faces[0]];model.groups[index]={...model.groups[index],recipe,baseFace,baseComponent:originComponent(doc,model,baseFace),selection:bindMaterialSelection(checked.stages[index],recipe.components,prior.anchorStages)};
  }else if(isTopology(recipe)){
   build(checked.stages[index],recipe);const baseFace=sourceParents[materialRoot(checked.stages[index],source!)];model.groups[index]={...model.groups[index],recipe,baseFace,baseComponent:originComponent(doc,model,baseFace),edges:bindMaterialTopologyRecipe(recipe,prior.anchorStages)};
  }else if(isTrace(recipe)){
   build(checked.stages[index],recipe);
   const face=recipe.component==='all'?materialRoot(checked.stages[index],source!):source!.components[recipe.component].faces[0],baseFace=sourceParents[face];
   model.groups[index]={...model.groups[index],recipe,baseFace,baseComponent:originComponent(doc,model,baseFace),anchors:anchors(recipe).map(a=>bindMaterialAnchor(a,prior.anchorStages))};
  }else{
   if(!Number.isInteger(recipe.face)||recipe.face<0||recipe.face>=sourceParents.length)bad('构造组参考面无效。');if(!materialFaceInside(source!.graph,recipe.face,recipe.fixedPoint))bad('固定点须严格位于所选参考面内。');const baseFace=sourceParents[recipe.face];model.groups[index]={...model.groups[index],recipe,baseFace,baseComponent:originComponent(doc,model,baseFace),...(versionOf(model)>=7?{baseFaces:prior.origins[recipe.face]}:{})};
  }
 }else bad('未知参数曲线操作。');
 const result=replay(doc,model,true),next=store(result.doc,model,doc),inspectedNext=inspectMaterialTopology(next),m=inspectedNext.ok?inspectedNext:null,existing=new Set(next.segments.map(s=>s.id)),descendants=new Map(doc.segments.map(s=>[s.id,existing.has(s.id)?[s.id]:[]])),last=intent.kind==='material-curve-group-edit'?result.results[index]:result.results.at(-1);
 return {doc:next,descendants,facesBefore:old?.graph.faces_vertices!.length??0,facesAfter:(m?.graph.faces_vertices!.length??0),addedVertices:(m?.graph.vertices_coords.length??0)-(old?.graph.vertices_coords.length??0),removedEdges:(old?.graph.edges_vertices.length??0)-(m?.graph.edges_vertices.length??0),synchronizedBanks:result.results.reduce((n,r)=>n+r.synchronizedBanks,0),insertedIds:(m?.edgeSegmentIds??[]).filter(id=>!result.baseIds.has(id)),placement:m?.foldedVertices?'preserved':'unavailable',...(last?.curves?{curves:last.curves}:{}),...(last?.network?{network:last.network}:{}),...(last?.ray?{ray:last.ray}:{}),...(last?.trace?{trace:last.trace}:{}),...(last?.batch?{batch:last.batch}:{}),...(last?.cut?{cut:last.cut}:{}),...(last?.join?{join:last.join}:{}),...(last?.transform?{transform:last.transform}:{}),...(last?.auxiliary?{auxiliary:last.auxiliary}:{}),...(last?.referenceFace?{referenceFace:last.referenceFace}:{}),...(last?.properties?{properties:last.properties}:{}),...(last?.locationMove?{locationMove:last.locationMove}:{}),...(last?.reflection?{reflection:last.reflection}:{}),...(last?.copy?{copy:last.copy}:{}),...(last?.paste?{paste:last.paste}:{}),...(last?.clipboardCut?{clipboardCut:last.clipboardCut}:{})};
}
