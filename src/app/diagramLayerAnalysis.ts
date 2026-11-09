import {followDiagramDepthAnnotations} from './diagramPaperFollow';
import {relativeLayerConstraintsMatch,validateRelativeLayerConstraints} from '../core/relativeLayerConstraints';
import type {FlatFoldResult,FlatLayerPreference} from '../core/types';
import {distance,epsilonFor,polygonArea} from '../core/geometry';
import {flatLayerEdges} from '../core/flatLayerOrder';
import type {DiagramPose,DiagramProject} from './diagramProject';
import {alignDiagramPaperAnchors,validateDiagramPaperDeformation} from './diagramPaperDeformation';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const derivedGraphKeys=new Set(['faceOrders','faces_normal','faces_matrix','faces_matrix2']);

/** The worker analyses only the base model. Added nodes are covered by that
 * result only while they interpolate the same material surface unchanged.
 * Ordinary edits to base vertices retain their existing analysis path. */
export function diagramPaperLayerAnalysisReason(pose:DiagramPose):string|undefined {
  if(pose.paperDeformation===undefined)return;
  const reason='局部拖角造型按图示层序显示；恢复平整状态后可重分析层序。';
  try{
    validateDiagramPaperDeformation(pose);
    if(!pose.paperDeformation.nodes.length)return;
    const {paperDeformation:_nodes,...base}=pose,[expected,current]=alignDiagramPaperAnchors(base,pose),eps=epsilonFor(pose.sourceDoc)*10;
    if(current.paperDeformation!.nodes.some((node,index)=>distance(node.point,expected.paperDeformation!.nodes[index].point)>eps))return reason;
  }catch{return reason;}
}

/** A saved candidate is a preference, never a trusted layer certificate. */
export function requestedDiagramLayerSolutionIndex(pose:DiagramPose):number {
  const index=pose.layerSolutionIndex??pose.result.layers.solutionIndex??0;
  return Number.isSafeInteger(index)&&index>=0?index:0;
}

/** Reanalysis can discard or rebuild graph caches. Every material field,
 * indexed coordinate, face, assignment and source mark remains part of the
 * identity; a new CP build must never be substituted for a saved pose. */
function geometryIdentity(result:FlatFoldResult):string|null {
  const geometry=result.geometry,graph=geometry?.graph;
  if(geometry?.status!=='ready'||!graph||!geometry.vertices.length||!geometry.faces.length||
    geometry.vertices.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))||
    geometry.faces.some(face=>!Array.isArray(face)||face.length<3||face.some(v=>!Number.isSafeInteger(v)||v<0||v>=geometry.vertices.length))||
    !same(geometry.vertices,graph.vertices_coords)||!same(geometry.faces,graph.faces_vertices))return null;
  const {message:_message,...physical}=geometry;
  return JSON.stringify({...physical,graph:Object.fromEntries(Object.entries(graph).filter(([key])=>!derivedGraphKeys.has(key)))});
}

/** Camera, visibility, drawing and selection changes do not invalidate a
 * physical layer request. Changing its material source or exact pose does. */
export function diagramLayerAnalysisKey(project:DiagramProject,stepId:string):string|null {
  if(project.activeStepId!==stepId)return null;
  return diagramStepLayerAnalysisKey(project,stepId);
}

/** A display preparation may analyse an inactive saved step. It still binds
 * every material field and selected candidate; navigation is not identity. */
export function diagramStepLayerAnalysisKey(project:DiagramProject,stepId:string):string|null {
  const step=project.steps.find(step=>step.id===stepId),pose=step?.pose;
  if(!pose||diagramPaperLayerAnalysisReason(pose))return null;
  const source=project.states.find(state=>state.id===pose.sourceStateId),geometry=geometryIdentity(pose.result);
  if(!source||source.revision!==pose.sourceRevision||!same(source.doc,pose.sourceDoc)||geometry===null)return null;
  return JSON.stringify([stepId,pose.sourceStateId,pose.sourceRevision,pose.sourceDoc,step.paperStates?.active??null,geometry,pose.spatial??null,pose.paperDeformation??null,pose.result.layers.constraints??[],pose.result.layers.relativeConstraints??[],pose.layerSolutionIndex??null,pose.result.layers.solutionIndex??null]);
}

export function validDiagramLayerCertificate(result:FlatFoldResult,pose:DiagramPose):boolean {
  // The flat-layer worker cannot supply a replacement for a spatial depth
  // solution, even when it happens to share identical projected vertices.
  if(pose.spatial&&(!same(result.geometry,pose.result.geometry)||!same(result.layers,pose.result.layers)))return false;
  const layers=result.layers,count=pose.result.geometry.faces.length,index=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<count;
  if(!layers||!['solved','no-solution','unknown','unsupported','timeout','cancelled','error'].includes(layers.status)||typeof layers.message!=='string'||
    !same(layers.constraints??[],pose.result.layers.constraints??[])||!same(layers.relativeConstraints??[],pose.result.layers.relativeConstraints??[]))return false;
  try{validateRelativeLayerConstraints(layers.relativeConstraints??[],count);}catch{return false;}
  const rows=layers.faceOrders,order=layers.faceOrder,seen=new Set<string>();
  if(rows!==undefined&&(!Array.isArray(rows)||rows.length>1_000_000||rows.some(row=>{
    if(!Array.isArray(row)||row.length!==3||!index(row[0])||!index(row[1])||row[0]===row[1]||row[2]!==1&&row[2]!==-1)return true;
    const key=row[0]<row[1]?`${row[0]}:${row[1]}`:`${row[1]}:${row[0]}`;
    if(seen.has(key))return true;seen.add(key);return false;
  })))return false;
  if(order!==undefined&&(!Array.isArray(order)||order.length!==count||new Set(order).size!==count||order.some(n=>!index(n))))return false;
  if(layers.status!=='solved'&&(rows!==undefined||order!==undefined))return false;
  if(layers.solutionIndex!==undefined&&(!Number.isSafeInteger(layers.solutionIndex)||layers.solutionIndex<0)||
    layers.solutionCount!==undefined&&(!Number.isSafeInteger(layers.solutionCount)||layers.solutionCount<0)||
    layers.solutionCountExact!==undefined&&(typeof layers.solutionCountExact!=='string'||!/^(0|[1-9]\d*)$/.test(layers.solutionCountExact)))return false;
  if(layers.status==='solved'&&(layers.solutionCount!==undefined&&(layers.solutionIndex??0)>=layers.solutionCount||
      layers.solutionCountExact!==undefined&&BigInt(layers.solutionIndex??0)>=BigInt(layers.solutionCountExact)))return false;
  if(rows&&order){
    const normals=pose.result.geometry.faces.map(face=>Math.sign(polygonArea(face.map(v=>pose.result.geometry.vertices[v])))),ranks=new Map(order.map((face,rank)=>[face,rank]));
    const edgeOn=pose.spatial?(pose.result.geometry.graph?.zhezhi_spatialEdgeOnFaces as number[]??[]):[];
    if(normals.some((n,f)=>!n&&!edgeOn.includes(f))||rows.some(row=>edgeOn.includes(row[0])||edgeOn.includes(row[1]))||flatLayerEdges(rows,normals).some(([lower,upper])=>ranks.get(lower)!>=ranks.get(upper)!))return false;
  }
  if(layers.status==='solved'&&!relativeLayerConstraintsMatch(result.geometry.vertices,result.geometry.faces,rows??[],layers.relativeConstraints??[]))return false;
  return true;
}

/** Merge only a layer certificate for the still-current saved pose. Preserve
 * CPs, source-face IDs, geometry, annotations, bindings and all view choices.
 * The worker owns its result; no mutable arrays cross into the project. */
export function applyDiagramLayerAnalysis(project:DiagramProject,stepId:string,key:string,result:FlatFoldResult):DiagramProject {
  if(!key||diagramLayerAnalysisKey(project,stepId)!==key)return project;
  return applyDiagramStepLayerAnalysis(project,stepId,key,result);
}

/** Background/export counterpart. Callers must still cancel old requests;
 * exact material/candidate/state checks reject any changed step at merge. */
export function applyDiagramStepLayerAnalysis(project:DiagramProject,stepId:string,key:string,result:FlatFoldResult):DiagramProject {
  if(!key||diagramStepLayerAnalysisKey(project,stepId)!==key)return project;
  const step=project.steps.find(step=>step.id===stepId)!,pose=step.pose!;
  if(result.layers.status==='solved'&&(result.layers.solutionIndex??0)!==requestedDiagramLayerSolutionIndex(pose))return project;
  if(geometryIdentity(result)!==geometryIdentity(pose.result)||!validDiagramLayerCertificate(result,pose)||same(result.layers,pose.result.layers))return project;
  const analysed={...pose,result:{...pose.result,layers:structuredClone(result.layers)}};
  let paperStates=step.paperStates;
  if(paperStates){
    const cached=paperStates[paperStates.active];if(!cached)return project;
    if(cached.sourceStateId!==pose.sourceStateId||cached.sourceRevision!==pose.sourceRevision||!same(cached.sourceDoc,pose.sourceDoc)||geometryIdentity(cached.result)!==geometryIdentity(pose.result)||!same(cached.paperDeformation,pose.paperDeformation)||
      requestedDiagramLayerSolutionIndex(cached)!==requestedDiagramLayerSolutionIndex(pose)||!same(cached.result.layers.constraints??[],pose.result.layers.constraints??[])||!same(cached.result.layers.relativeConstraints??[],pose.result.layers.relativeConstraints??[]))return project;
    paperStates={...paperStates,[paperStates.active]:{...cached,result:{...cached.result,layers:structuredClone(result.layers)}}};
  }
  return {...project,steps:project.steps.map(item=>item.id===stepId?{...step,pose:analysed,annotations:followDiagramDepthAnnotations(pose,analysed,step.annotations??[]),...(paperStates?{paperStates}:{})}:item)};
}

/** Commit a freshly solved, explicitly selected candidate. Failed searches
 * leave the previous visible solution intact, including its certificate. */
export function applyDiagramLayerSolution(project:DiagramProject,stepId:string,key:string,result:FlatFoldResult,index:number,relativeConstraints?:FlatLayerPreference[]):DiagramProject {
  // A required-relation request asks for any certified satisfying solution.
  // The triangle recovery path proves existence without enumerating/ranking
  // candidates. Keep that distinction instead of inventing candidate zero.
  const unnumbered=relativeConstraints!==undefined&&index===0&&result.layers.solutionIndex===undefined&&
    result.layers.solutionCount===undefined&&result.layers.solutionCountExact===undefined;
  if(!Number.isSafeInteger(index)||index<0||!key||diagramLayerAnalysisKey(project,stepId)!==key||
      result.layers.status!=='solved'||!unnumbered&&result.layers.solutionIndex!==index)return project;
  const step=project.steps.find(step=>step.id===stepId)!,pose=step.pose!;
  const expected=relativeConstraints===undefined?pose:{...pose,result:{...pose.result,layers:{...pose.result.layers,relativeConstraints}}};
  if(geometryIdentity(result)!==geometryIdentity(pose.result)||!validDiagramLayerCertificate(result,expected))return project;
  const selected=(current:DiagramPose):DiagramPose=>{
    const {displayOrder:_previousOrder,layerSolutionIndex:_previousIndex,...saved}=current;
    return {...saved,...(unnumbered?{}:{layerSolutionIndex:index}),result:{...current.result,layers:structuredClone(result.layers)},
      ...(result.layers.faceOrder?{displayOrder:[...result.layers.faceOrder]}:{})};
  };
  let paperStates=step.paperStates;
  if(paperStates){
    const cached=paperStates[paperStates.active];if(!cached)return project;
    if(cached.sourceStateId!==pose.sourceStateId||cached.sourceRevision!==pose.sourceRevision||
        !same(cached.sourceDoc,pose.sourceDoc)||geometryIdentity(cached.result)!==geometryIdentity(pose.result)||!same(cached.paperDeformation,pose.paperDeformation))return project;
    paperStates={...paperStates,[paperStates.active]:selected(cached)};
  }
  if(pose.layerSolutionIndex===(unnumbered?undefined:index)&&same(result.layers,pose.result.layers)&&
      same(pose.displayOrder,result.layers.faceOrder)&&(!paperStates||same(paperStates,step.paperStates)))return project;
  return {...project,steps:project.steps.map(item=>item.id===stepId?{...step,pose:selected(pose),annotations:followDiagramDepthAnnotations(pose,selected(pose),step.annotations??[]),...(paperStates?{paperStates}:{})}:item)};
}
