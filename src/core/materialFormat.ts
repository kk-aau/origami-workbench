import {createMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {defaultAngle,validateDoc,type Assignment,type Doc,type FoldGraph,type ImportResult,type Point} from './types';
import {resolveStartingFace} from '../app/flatFoldSettings';
import {validateFlatFoldSettings} from './flatFoldSettings.mjs';

const fields=['vertices_coords','edges_vertices','edges_assignment','edges_foldAngle','faces_vertices','faces_edges','edges_faces','faces_faces','faces_holes','faces_holeEdges','faces_holeFaces'] as const;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const points=(v:unknown):v is Point[]=>Array.isArray(v)&&v.length>0&&v.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)));
function graphOf(raw:Record<string,unknown>):FoldGraph{
  if(!points(raw.vertices_coords)||!Array.isArray(raw.edges_vertices)||!Array.isArray(raw.edges_assignment))throw new Error('材料 FOLD 缺少完整二维顶点、边与赋型。');
  const coords=raw.vertices_coords;
  if(raw.edges_vertices.some(e=>!Array.isArray(e)||e.length!==2||e.some(v=>!Number.isInteger(v)||v<0||v>=coords.length)))throw new Error('材料 FOLD 边索引无效。');
  if(raw.edges_assignment.length!==raw.edges_vertices.length||raw.edges_assignment.some(a=>typeof a!=='string'||!['B','M','V','F','U'].includes(a)))throw new Error('材料 FOLD 赋型不完整。');
  const graph=Object.fromEntries(fields.filter(k=>raw[k]!==undefined).map(k=>[k,structuredClone(raw[k])])) as unknown as FoldGraph;
  graph.edges_foldAngle=raw.edges_foldAngle===undefined?graph.edges_assignment.map(a=>defaultAngle(a as Assignment)):structuredClone(raw.edges_foldAngle) as (number|null)[];
  if(!Array.isArray(graph.edges_foldAngle)||graph.edges_foldAngle.length!==graph.edges_vertices.length)throw new Error('材料 FOLD 折角不完整。');
  return graph;
}

/** Recognize self-contained indexed CP/FF pairs or our explicit material
 * extension. Ordinary multi-frame files retain their existing import rules. */
export function importMaterialFold(raw:Record<string,unknown>,name:string):ImportResult|null{
  const extension=Object.hasOwn(raw,'zhezhi_material_topology');
  const pair=Array.isArray(raw.file_frames)&&raw.file_frames.length===1&&record(raw.file_frames[0])&&Array.isArray(raw.frame_classes)&&raw.frame_classes.includes('creasePattern')&&Array.isArray(raw.file_frames[0].frame_classes)&&raw.file_frames[0].frame_classes.includes('foldedForm')&&raw.file_frames[0].frame_inherit===false;
  if(!extension&&!pair)return null;
  if(raw.frame_parent!==undefined||raw.frame_inherit||Array.isArray(raw.frame_classes)&&!raw.frame_classes.includes('creasePattern'))throw new Error('材料 FOLD 必须有独立的二维展开帧。');
  if(raw.file_frames!==undefined&&(!Array.isArray(raw.file_frames)||raw.file_frames.length!==0&&!pair))throw new Error('材料 FOLD 只能包含一个独立 CP 和一个独立 FF 帧。');
  const graph=graphOf(raw),frame=pair?(raw.file_frames as Record<string,unknown>[])[0]:undefined;
  let folded:Point[]|undefined,root:number|undefined,ids=graph.edges_vertices.map((_,i)=>`material-${i}`);
  if(Object.hasOwn(raw,'zhezhi_material_starting_face'))root=raw.zhezhi_material_starting_face as number;
  if(frame){
    if(frame.frame_parent!==undefined||(frame.frame_unit??'unitless')!==(raw.frame_unit??'unitless'))throw new Error('材料折后帧不能依赖父帧或使用不同单位。');
    const ff=graphOf(frame);
    for(const k of fields.filter(k=>k!=='vertices_coords'))if(!same(graph[k],ff[k]))throw new Error('材料 CP 与 FF 的显式拓扑或赋型不一致。');
    folded=ff.vertices_coords;
  }
  if(extension){
    const saved=raw.zhezhi_material_topology;
    if(!record(saved)||!record(saved.graph)||!Array.isArray(saved.edgeSegmentIds)||saved.edgeSegmentIds.some(id=>typeof id!=='string'))throw new Error('材料 FOLD 扩展格式无效。');
    for(const k of fields)if(!same(graph[k],saved.graph[k]))throw new Error('材料 FOLD 展开图与保存的材料拓扑不一致。');
    if(frame&&!same(folded,saved.foldedVertices))throw new Error('材料 FOLD 折后帧与保存位置不一致。');
    if(saved.foldedVertices!==undefined&&!points(saved.foldedVertices))throw new Error('材料折后坐标无效。');
    if(Object.hasOwn(raw,'zhezhi_material_starting_face')&&root!==saved.startingFace)throw new Error('材料 FOLD 起始面声明不一致。');
    folded=saved.foldedVertices as Point[]|undefined;root=saved.startingFace as number|undefined;ids=saved.edgeSegmentIds as string[];
  }
  const unit=raw.frame_unit??'unitless',units:Record<string,number>={mm:1,cm:10,m:1000,in:25.4,inch:25.4,pt:25.4/72,unitless:1};
  if(typeof unit!=='string'||!Object.hasOwn(units,unit))throw new Error('材料 FOLD 单位不支持。');
  const scale=units[unit],scaled={...graph,vertices_coords:graph.vertices_coords.map(([x,y]):Point=>[x*scale,y*scale])};
  const xs=scaled.vertices_coords.map(p=>p[0]),ys=scaled.vertices_coords.map(p=>p[1]);
  const paper=record(raw.zhezhi_paper)?{width:Number(raw.zhezhi_paper.width)*scale,height:Number(raw.zhezhi_paper.height)*scale}:{width:Math.max(1,Math.max(...xs)-Math.min(...xs)),height:Math.max(1,Math.max(...ys)-Math.min(...ys))};
  const metadata=record(raw.zhezhi_metadata)?structuredClone(raw.zhezhi_metadata):{};delete metadata.materialTopology;
  const excluded=new Set<string>([...fields,'file_frames','zhezhi_material_topology','zhezhi_metadata','zhezhi_auxiliary','zhezhi_paper','zhezhi_flat_fold']);
  const extras=Object.fromEntries(Object.entries(raw).filter(([key])=>!excluded.has(key)));
  metadata.sourceFormat='fold';
  metadata.sourceFoldExtras={...(record(metadata.sourceFoldExtras)?metadata.sourceFoldExtras:{}),...structuredClone(extras)};
  if(frame){
    const frameExtras=Object.fromEntries(Object.entries(frame).filter(([key])=>!(fields as readonly string[]).includes(key)));
    metadata.sourceFoldFrameExtras=structuredClone(frameExtras);
  }
  const doc:Doc={name:typeof raw.file_title==='string'?raw.file_title:name,paper,metadata,segments:scaled.edges_vertices.map(([a,b],i)=>({id:ids[i],a:[...scaled.vertices_coords[a]],b:[...scaled.vertices_coords[b]],assignment:scaled.edges_assignment[i] as Assignment,angle:scaled.edges_foldAngle[i]}))};
  if(raw.zhezhi_auxiliary!==undefined){
    if(!Array.isArray(raw.zhezhi_auxiliary)||raw.zhezhi_auxiliary.some(s=>!record(s)||s.assignment!=='A'))throw new Error('材料 FOLD 辅助线无效。');
    for(const s of structuredClone(raw.zhezhi_auxiliary))doc.segments.push({...s,a:s.a?.map((n:number)=>n*scale),b:s.b?.map((n:number)=>n*scale)});
  }
  if(Object.hasOwn(raw,'zhezhi_flat_fold')){
    validateFlatFoldSettings(raw.zhezhi_flat_fold);
    const settings=raw.zhezhi_flat_fold as NonNullable<Doc['flatFold']>;
    doc.flatFold={...structuredClone(settings),startingFace:settings.startingFace.map(([x,y]):Point=>[x*scale,y*scale])};
  }
  validateDoc(doc);
  // Recreate through the same strict validator, never accept source trust flags.
  const data=createMaterialTopology(doc,scaled,ids,{...(folded?{foldedVertices:folded.map(([x,y]):Point=>[x*scale,y*scale])}:{}),...(root===undefined?{}:{startingFace:root})});
  if(extension){
    const original={...doc,segments:graph.edges_vertices.map(([a,b],i)=>({...doc.segments[i],a:graph.vertices_coords[a],b:graph.vertices_coords[b]})),metadata:{materialTopology:raw.zhezhi_material_topology}};
    const inspected=inspectMaterialTopology(original);
    if(!inspected.ok)throw new Error(inspected.reason);
  }
  doc.metadata={...metadata,materialTopology:data};validateDoc(doc);
  if(doc.flatFold&&resolveStartingFace(doc,data.graph).stale)throw new Error('材料 FOLD 的活动起始面与展开图不对应。');
  return {doc,warnings:['已保留独立材料拓扑与折后位置；载入时重新验证，层序须重新计算。',...(unit==='unitless'?['FOLD 未指定单位，本次按毫米读取。']:scale!==1?[`已将 ${unit} 坐标换算为毫米。`]:[])]};
}

export function exportMaterialFold(doc:Doc):Record<string,unknown>{
  const material=inspectMaterialTopology(doc);if(!material.ok)throw new Error(material.reason);
  const graph=material.graph,metadata={...doc.metadata};delete metadata.materialTopology;
  const topology=structuredClone(doc.metadata!.materialTopology) as Record<string,unknown>;
  if(doc.flatFold){const root=resolveStartingFace(doc,graph);if(root.stale)throw new Error('材料 FOLD 起始面已失效，请重新选择后导出。');}
  return {...structuredClone(graph),file_spec:1.2,file_creator:'折纸工坊',file_title:doc.name,frame_classes:['creasePattern'],frame_attributes:['2D'],frame_unit:'mm',
    zhezhi_material_topology:topology,zhezhi_paper:structuredClone(doc.paper),zhezhi_metadata:metadata,zhezhi_auxiliary:structuredClone(doc.segments.filter(s=>s.assignment==='A')),...(doc.flatFold?{zhezhi_flat_fold:structuredClone(doc.flatFold)}:{}),
    ...(material.foldedVertices?{file_frames:[{...structuredClone(graph),vertices_coords:structuredClone(material.foldedVertices),frame_classes:['foldedForm'],frame_attributes:['2D'],frame_unit:'mm',frame_inherit:false}]}:{})};
}
