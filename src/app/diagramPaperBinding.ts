import type {Point} from '../core/types';
import {epsilonFor} from '../core/geometry';
import type {DiagramPose} from './diagramProject';
import {validateDiagramAnnotations,type DiagramAnnotation,type DiagramSymbolAnnotation} from './diagramAnnotations';
import type {DiagramPaperBinding} from './diagramPaperBindingTypes';
import {symbolNativeBaseline} from './diagramAnnotationSVG';
import {diagramIllustrationMesh,type DiagramIllustrationMesh} from './diagramIllustrationMesh';
import {modelProjection} from './modelProjection';

const arrowKinds=new Set(['fold','unfold','foldSmall','swivel','swivelDouble','mountainFold','unfoldDouble','sink','open','pull','return']);
export const canBindDiagramArrow=(a:DiagramSymbolAnnotation)=>arrowKinds.has(a.symbol)&&!!symbolNativeBaseline(a);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function weights(point:Point,triangle:Point[],eps:number,inside=true):number[]|null {
  const [a,b,c]=triangle,den=cross(a,b,c),scale=Math.max(distance(a,b),distance(b,c),distance(c,a));
  if(Math.abs(den)<=eps*Math.max(eps,scale))return null;
  if(inside&&triangle.some((p,i)=>Math.sign(den)*cross(p,triangle[(i+1)%3],point)<-eps*Math.max(eps,distance(p,triangle[(i+1)%3]))))return null;
  const wb=cross(a,point,c)/den,wc=cross(a,b,point)/den;return [1-wb-wc,wb,wc];
}
const interpolate=(triangle:Point[],w:number[]):Point=>[triangle.reduce((sum,p,i)=>sum+p[0]*w[i],0),triangle.reduce((sum,p,i)=>sum+p[1]*w[i],0)];
function material(mesh:DiagramIllustrationMesh,face:number):DiagramPaperBinding['material'] {
  const graph=mesh.baseGraph,outer=graph.faces_vertices?.[face];if(!outer)return [];
  return [outer,...(graph.faces_holes?.[face]??[])].map(ring=>ring.map(id=>[id,...graph.vertices_coords[id]] as [number,number,number]));
}
function frame(pose:DiagramPose) {
  const mesh=diagramIllustrationMesh(pose),projection=modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter);
  return {mesh,shown:mesh.vertices.map(projection.project),eps:epsilonFor(pose.sourceDoc)};
}

/** Offer all material faces under the tail. The user chooses between overlaps;
 * this is independent of any uncertified or merely cosmetic stack order. */
export function diagramArrowBindingFaces(pose:DiagramPose|null,annotation:DiagramSymbolAnnotation):number[] {
  if(!pose||!canBindDiagramArrow(annotation))return [];
  try{
    const {mesh,shown,eps}=frame(pose),root=symbolNativeBaseline(annotation)!.start;
    return mesh.triangles.flatMap((cells,face)=>!pose.hiddenFaces?.includes(face)&&cells.some(cell=>weights(root,cell.map(v=>shown[v]),eps))?[face]:[]);
  }catch{return [];}
}

/** Bind only the tail to the chosen material face; the local arrow direction is
 * transported by that material triangle, including reflection. No CP changes. */
export function bindDiagramArrow(pose:DiagramPose,annotation:DiagramSymbolAnnotation,face:number):DiagramSymbolAnnotation {
  if(!canBindDiagramArrow(annotation))throw Error('此符号没有可绑定的箭尾。');
  const {mesh,shown,eps}=frame(pose),baseline=symbolNativeBaseline(annotation)!;
  for(const cell of mesh.triangles[face]??[]){
    const target=cell.map(v=>shown[v]),w=weights(baseline.start,target,eps);if(!w)continue;
    const source=cell.map(v=>mesh.graph.vertices_coords[v]),tipWeights=weights(baseline.end,target,eps,false)!;
    const paperBinding:DiagramPaperBinding={face,material:material(mesh,face),root:interpolate(source,w),tip:interpolate(source,tipWeights),handedness:((annotation.mirrored?-1:1)*Math.sign(cross(...target as [Point,Point,Point])/cross(...source as [Point,Point,Point]))) as 1|-1};
    const result={...annotation,paperBinding};validateDiagramAnnotations([result]);return result;
  }
  throw Error('箭尾不在所选纸面内。请移回该纸面，或先解除绑定。');
}

/** Fit the existing glyph without discarding its original CAD properties or
 * curve controls. Rendering is idempotent: the binding is the absolute frame. */
export function fitDiagramArrow(annotation:DiagramSymbolAnnotation,start:Point,end:Point,mirrored=!!annotation.mirrored):DiagramSymbolAnnotation {
  let next={...annotation,mirrored},baseline=symbolNativeBaseline(next);
  if(!baseline)throw Error('此符号没有箭头基线。');
  if(mirrored===!!annotation.mirrored&&distance(baseline.start,start)<1e-9&&distance(baseline.end,end)<1e-9)return annotation;
  const from:Point=[baseline.end[0]-baseline.start[0],baseline.end[1]-baseline.start[1]],to:Point=[end[0]-start[0],end[1]-start[1]],length=Math.hypot(...from),targetLength=Math.hypot(...to);
  if(length<1e-10||targetLength<1e-10)throw Error('绑定纸面侧立或退化，箭头暂时保留原图。');
  const delta=Math.atan2(to[1],to[0])-Math.atan2(from[1],from[0]);
  next={...next,size:annotation.size*targetLength/length,rotation:((annotation.rotation+delta*180/Math.PI)%360+360)%360};
  baseline=symbolNativeBaseline(next)!;
  next.position=[next.position[0]+start[0]-baseline.start[0],next.position[1]+start[1]-baseline.start[1]];
  validateDiagramAnnotations([next]);return next;
}

export interface DiagramArrowBindingResult {annotation:DiagramSymbolAnnotation;issue?:string}
export function resolveDiagramArrowBinding(pose:DiagramPose|null,annotation:DiagramSymbolAnnotation):DiagramArrowBindingResult {
  const binding=annotation.paperBinding;if(!binding)return {annotation};
  if(!pose)return {annotation,issue:'当前没有纸面，绑定暂时停用。'};
  try{
    if(!canBindDiagramArrow(annotation))throw Error('符号类型已改变，请解除绑定。');
    const {mesh,shown,eps}=frame(pose);
    if(JSON.stringify(material(mesh,binding.face))!==JSON.stringify(binding.material))throw Error('原纸面已变化，请重新绑定。');
    for(const cell of mesh.triangles[binding.face]??[]){
      const source=cell.map(v=>mesh.graph.vertices_coords[v]),w=weights(binding.root,source,eps);if(!w)continue;
      const target=cell.map(v=>shown[v]),area=cross(...target as [Point,Point,Point]);
      if(!weights(interpolate(target,w),target,eps,false))throw Error('绑定纸面侧立或退化，箭头暂时保留原图。');
      const start=interpolate(target,w),end=interpolate(target,weights(binding.tip,source,eps,false)!);
      const mirrored=binding.handedness*Math.sign(area/cross(...source as [Point,Point,Point]))<0;
      return {annotation:fitDiagramArrow(annotation,start,end,mirrored)};
    }
    throw Error('箭尾已不在原纸面内，请重新绑定。');
  }catch(error){return {annotation,issue:error instanceof Error?error.message:String(error)};}
}
export function resolveDiagramPaperBindings(pose:DiagramPose|null,annotations:DiagramAnnotation[]):DiagramAnnotation[] {
  if(!annotations.some(a=>a.kind==='symbol'&&a.paperBinding))return annotations;
  return annotations.map(a=>a.kind==='symbol'&&a.paperBinding?resolveDiagramArrowBinding(pose,a).annotation:a);
}

const near=(a:number,b:number)=>Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
function samePlacement(a:DiagramSymbolAnnotation,b:DiagramSymbolAnnotation):boolean {
  return a.symbol===b.symbol&&a.position.every((n,i)=>near(n,b.position[i]))&&near(a.size,b.size)&&Math.abs(Math.sin((a.rotation-b.rotation)*Math.PI/360))<1e-9&&!!a.mirrored===!!b.mirrored&&
    ['params','curveControl','cadProperties'].every(key=>JSON.stringify(a[key as keyof DiagramSymbolAnnotation])===JSON.stringify(b[key as keyof DiagramSymbolAnnotation]));
}
/** Refresh the material frame only after an actual user placement/shape edit.
 * Pose changes and style-only edits must never move the attachment on paper. */
export function editDiagramPaperBindings(pose:DiagramPose|null,previous:DiagramAnnotation[],next:DiagramAnnotation[]):DiagramAnnotation[] {
  return next.map(a=>{
    if(a.kind!=='symbol'||!a.paperBinding)return a;
    const old=previous.find(p=>p.id===a.id);
    if(old?.kind==='symbol'&&(JSON.stringify(old.paperBinding)!==JSON.stringify(a.paperBinding)||samePlacement(old,a)||samePlacement(resolveDiagramArrowBinding(pose,old).annotation,a)))return a;
    if(!pose)throw Error('没有可绑定的纸面，请先解除箭头绑定。');
    if(resolveDiagramArrowBinding(pose,a).issue)throw Error('原纸面已变化，请先解除箭头绑定或重新绑定。');
    return bindDiagramArrow(pose,a,a.paperBinding.face);
  });
}
