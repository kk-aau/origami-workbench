import {validateRelativeLayerConstraints} from './relativeLayerConstraints';
import {buildFold} from './geometry';
import {validateDoc,type Doc,type FlatFoldResult,type FoldGraph,type Point,type FoldingConstraint,type FlatLayerPreference} from './types';
import {hasMaterialTopology,inspectMaterialTopology} from './materialTopology';

const FORMAT='zhezhi-folded-model';
/** Ordinary v1/v2 basis stays stable. Material v3 binds independent incidence;
 * diagram v4 opts into F marks without changing either existing contract. */
function basis(graph:FoldGraph,material=false){
  return {vertices:graph.vertices_coords,edges:graph.edges_vertices,faces:graph.faces_vertices??[],assignments:graph.edges_assignment,angles:graph.edges_foldAngle,
    ...(material?{faces_edges:graph.faces_edges,edges_faces:graph.edges_faces,faces_faces:graph.faces_faces?.map(row=>row.map(face=>face??null))}:{})};
}
function topology(graph:FoldGraph,material=false){const {vertices:_vertices,angles:_angles,...rest}=basis(graph,material);return rest;}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function record(value:unknown,keys:string[],label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label}必须是对象。`);
  if(Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw new Error(`${label}字段不完整或版本不支持。`);
  return value as Record<string,unknown>;
}
function points(value:unknown,count:number):Point[]{
  if(!Array.isArray(value)||value.length!==count||value.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('模型顶点数量不符或坐标无效。');
  return value.map(p=>[p[0],p[1]]);
}
function root(value:unknown,count:number):number{
  if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>=count)throw new Error('模型起始面索引无效。');
  return value;
}
function constraints(value:unknown,count:number):FoldingConstraint[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>count||value.some(c=>!c||typeof c!=='object'||Array.isArray(c)))throw new Error('模型正反色约束格式无效。');
  const seen=new Set<number>();
  return value.map(raw=>{
    const c=raw as Record<string,unknown>;
    if(Object.keys(c).length!==2||typeof c.face!=='number'||!Number.isInteger(c.face)||c.face<0||c.face>=count||(c.side!=='white'&&c.side!=='color')||seen.has(c.face))throw new Error('模型正反色约束面索引或颜色无效。');
    seen.add(c.face);return {face:c.face,side:c.side as FoldingConstraint['side']};
  });
}
function sourceGraph(source:unknown,flatCreases?:'marks'){
  validateDoc(source);
  if(hasMaterialTopology(source)){
    const inspected=inspectMaterialTopology(source);if(!inspected.ok)throw new Error(inspected.reason);
    return {graph:inspected.graph,material:true,warnings:source.segments.some(s=>s.assignment==='A')?['辅助线不参与材料纸面划分、平折与层序求解。']:[]};
  }
  const {graph,warnings}=buildFold(source,{flatCreases});
  if(!graph.faces_vertices?.length)throw new Error('原始折痕未形成可对应的纸面。');
  return {graph,warnings,material:false};
}

export interface LoadedModelSnapshot { source:Doc; graph:FoldGraph; result:FlatFoldResult }

/** Stores the calculation-time source, not whatever document is currently in the editor. */
export function exportModelSnapshot(source:Doc,result:FlatFoldResult):string{
  const model=result.geometry,flatCreases=model.graph?.zhezhi_flatCreases==='marks'?'marks':undefined;
  const {graph,material}=sourceGraph(source,flatCreases);
  if(model.status!=='ready'||!model.graph)throw new Error('请先生成有效的模型几何。');
  // Fresh planar solutions use ±180°, while imported snapshots retain source target angles.
  // Both describe the same indexed topology; the serialized basis still binds exact source angles.
  const flatAngles=graph.edges_assignment.map(a=>a==='M'?-180:a==='V'||a==='U'?180:0);
  const validAngles=same(model.graph.edges_foldAngle,graph.edges_foldAngle)||same(model.graph.edges_foldAngle,flatAngles);
  if(!validAngles||!same(topology(graph,material),topology(model.graph,material))||!same(model.faces,graph.faces_vertices)||!same(model.vertices,model.graph.vertices_coords))throw new Error('模型与原始折痕拓扑不对应，不能保存为同一快照。');
  const relativeConstraints=result.layers.relativeConstraints===undefined?[]:result.layers.relativeConstraints;validateRelativeLayerConstraints(relativeConstraints,model.faces.length);
  const snapshot={format:FORMAT,version:material?3:flatCreases?4:2,source:structuredClone(source),model:{basis:basis(graph,material),vertices:points(model.vertices,graph.vertices_coords.length),startingFace:root(model.startingFace??0,model.faces.length),constraints:constraints(result.layers.constraints,model.faces.length),...(relativeConstraints.length?{relativeConstraints:structuredClone(relativeConstraints)}:{}),...(flatCreases?{flatCreases}:{})}};
  return JSON.stringify(snapshot,null,2);
}

/** Rebuild all topology from validated source; loading never executes a layer solver. */
export function importModelSnapshot(text:string):LoadedModelSnapshot{
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new Error('模型快照不是有效 JSON。');}
  const value=record(parsed,['format','version','source','model'],'模型快照');
  if(value.format!==FORMAT||(value.version!==1&&value.version!==2&&value.version!==3&&value.version!==4))throw new Error('不支持的模型快照格式或版本。');
  const model=record(value.model,[...(value.version===4?['basis','vertices','startingFace','constraints','flatCreases']:value.version!==1?['basis','vertices','startingFace','constraints']:['basis','vertices','startingFace']),...(Object.hasOwn(value.model as object,'relativeConstraints')?['relativeConstraints']:[])],'模型数据');
  if(value.version===4&&model.flatCreases!=='marks')throw new Error('折序模型的展开折痕用途无效。');
  const {graph,warnings,material}=sourceGraph(value.source,value.version===4?'marks':undefined);
  if(material!==(value.version===3))throw new Error('材料切口源必须使用保留面边关联的第三版模型快照；普通源使用第一、第二或折序第四版。');
  // Exact ordering matters: coordinates are indexed by this original geometry.
  const expected=basis(graph,material),serialized=material?record(model.basis,Object.keys(expected),'材料模型拓扑'):model.basis;
  const matches=material?Object.entries(expected).every(([key,value])=>same((serialized as Record<string,unknown>)[key],value)):same(serialized,expected);
  if(!matches)throw new Error('快照拓扑与原始折痕不一致，或几何引擎版本已改变；未载入模型。');
  const vertices=points(model.vertices,graph.vertices_coords.length),startingFace=root(model.startingFace,graph.faces_vertices!.length),modelConstraints=constraints(model.constraints,graph.faces_vertices!.length);
  const relativeConstraints=(model.relativeConstraints===undefined?[]:model.relativeConstraints) as FlatLayerPreference[];validateRelativeLayerConstraints(relativeConstraints,graph.faces_vertices!.length);
  const folded=structuredClone(graph);folded.vertices_coords=vertices.map(p=>[...p]);
  // Treat every imported model as a manually supplied result, not a proven CP folding.
  const result:FlatFoldResult={geometry:{status:'ready',message:'已载入模型快照；顶点为保存的结果坐标，不证明原折痕可折。',vertices,faces:structuredClone(graph.faces_vertices!),graph:folded,startingFace,modified:true},layers:{status:'unknown',message:'快照不信任旧层序，请重新分析当前模型。',...(modelConstraints.length?{constraints:modelConstraints}:{}),...(relativeConstraints.length?{relativeConstraints:structuredClone(relativeConstraints)}:{})},warnings:[...warnings,'载入的模型仅保存结果几何；不证明等距折叠、连续折叠路径或实际可折性。']};
  return {source:structuredClone(value.source as Doc),graph,result};
}
