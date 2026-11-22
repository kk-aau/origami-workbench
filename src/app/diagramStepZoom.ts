import type {Point} from '../core/types';
import type {DiagramPose,DiagramProject} from './diagramProject';
import {diagramImageBounds,type DiagramImage} from './diagramImages';
import {defaultModelView} from './modelViewState';
import {modelProjection} from './modelProjection';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {diagramDepthActive} from './diagramDepth';
import type {DiagramSimulationSurface} from './diagramSimulationSurface';
import {diagramSimulationSurfaceBounds} from './diagramSimulationSurfaceRender';
import {validateDiagramZoomBounds,validateDiagramZoomRegion,type DiagramZoomRegion,type DiagramZoomBounds} from './diagramZoomGeometry';

/** The glyph and the illustrated crop are independent: moving the arrow never
 * silently chooses another part of the paper. No physical CP identity is added. */
export interface DiagramZoomArea {region:DiagramZoomRegion;basis:DiagramZoomBounds}
export interface DiagramStepZoom {region:DiagramZoomRegion;sourceStepId:string;symbolId?:string}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function record(value:unknown,keys:readonly string[]):value is Record<string,unknown> {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}

/** Imported selections are data only; neither SVG paths nor cached clipping
 * results are accepted as saved instructions. */
export function validateDiagramZoomArea(value:unknown):asserts value is DiagramZoomArea {
  if(!record(value,['region','basis']))throw new Error('局部放大区域字段不完整或版本不支持。');
  validateDiagramZoomBounds(value.basis);
  validateDiagramZoomRegion(value.region);
}

/** Stable artwork bounds deliberately exclude arrows, callouts, text and the
 * temporary pan/zoom camera. Curves use the saved projection without rasterizing
 * an image; image-only steps use their actual raster corners. */
export function diagramZoomPaperBounds(pose:DiagramPose|null,images:readonly DiagramImage[]=[],paperVisible=true,fallback?:{width:number;height:number},surface?:DiagramSimulationSurface):DiagramZoomBounds {
  const points:Point[]=[];
  if(pose&&paperVisible){
    const view=pose.view??defaultModelView(),projection=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation,view?.projectionCenter);
    const mesh=pose.paperDeformation?.nodes.length||pose.hiddenFaces?.length||diagramDepthActive(pose)?diagramIllustrationMesh(pose):undefined;
    const vertices=mesh?.vertices??pose.result.geometry.vertices;
    if(mesh&&pose.hiddenFaces?.length){
      const hidden=new Set(pose.hiddenFaces),visible=new Set<number>();
      mesh.triangles.forEach((cells,face)=>{if(!hidden.has(face))for(const cell of cells)for(const index of cell)visible.add(index);});
      for(const index of visible)points.push(projection.project(vertices[index]));
    }else for(const vertex of vertices)points.push(projection.project(vertex));
  }
  if(surface&&paperVisible){
    const box=diagramSimulationSurfaceBounds(surface);
    points.push([box.x,box.y],[box.x+box.width,box.y+box.height]);
  }
  for(const image of images){const box=diagramImageBounds(image);points.push([box.minX,box.minY],[box.maxX,box.maxY]);}
  if(!points.length){
    const width=finite(fallback?.width)&&fallback.width>0?fallback.width:200,height=finite(fallback?.height)&&fallback.height>0?fallback.height:200;
    return {x:0,y:0,width,height};
  }
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(1e-5,Math.max(...xs)-x),height:Math.max(1e-5,Math.max(...ys)-y)};
}

export function mapDiagramZoomArea(area:DiagramZoomArea,target:DiagramZoomBounds):DiagramZoomRegion {
  const {basis,region}=area,sx=target.width/basis.width,sy=target.height/basis.height;
  const point=([x,y]:Point):Point=>[target.x+(x-basis.x)*sx,target.y+(y-basis.y)*sy];
  if(region.kind==='circle')return {kind:'circle',center:point(region.center),radius:region.radius*Math.max(sx,sy)};
  const origin=point([region.bounds.x,region.bounds.y]);
  return {kind:'wave',points:region.points.map(point),side:region.side,bounds:{x:origin[0],y:origin[1],width:region.bounds.width*sx,height:region.bounds.height*sy}};
}

/** A valid saved crop can become unrepresentable on a very different paper
 * shape. Keep the instruction intact for correction instead of inventing a
 * larger crop, clamping its points, or letting its rendering crash the editor. */
export function tryMapDiagramZoomArea(area:DiagramZoomArea,target:DiagramZoomBounds):DiagramZoomRegion|null {
  try{
    validateDiagramZoomArea(area);validateDiagramZoomBounds(target);
    const region=mapDiagramZoomArea(area,target);validateDiagramZoomRegion(region);return region;
  }catch{return null;}
}

// Vertices retain material coordinates when later folds subdivide or renumber faces.
const materialViews=new WeakMap<DiagramPose,Map<string,Point|null>>();
function materialView(pose:DiagramPose){
  const cached=materialViews.get(pose);if(cached)return cached;
  const mesh=diagramIllustrationMesh(pose),view=pose.view??defaultModelView();
  const projection=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation,view.projectionCenter);
  const hidden=new Set(pose.hiddenFaces),visible=new Set<number>(),vertices=new Map<string,Point|null>();
  mesh.triangles.forEach((cells,face)=>{if(!hidden.has(face))for(const cell of cells)for(const vertex of cell)visible.add(vertex);});
  for(const vertex of visible){
    const key=mesh.graph.vertices_coords[vertex].join(','),point=projection.project(mesh.vertices[vertex]),previous=vertices.get(key);
    // Two cut banks can share CP coordinates while occupying different positions.
    if(previous===undefined)vertices.set(key,point);
    else if(previous&&(previous[0]!==point[0]||previous[1]!==point[1]))vertices.set(key,null);
  }
  materialViews.set(pose,vertices);return vertices;
}

type ZoomInstruction={area:DiagramZoomArea;sourceStepId:string;symbolId?:string;sourcePose?:DiagramPose|null;sourceBounds?:DiagramZoomBounds};
function inheritedRegion(active:ZoomInstruction,target:DiagramZoomBounds,targetPose:DiagramPose|null){
  const mapped=tryMapDiagramZoomArea(active.area,target);
  if(mapped?.kind!=='circle'||!active.sourcePose||!active.sourceBounds||!targetPose||targetPose===active.sourcePose)return mapped;
  const selected=tryMapDiagramZoomArea(active.area,active.sourceBounds);
  if(selected?.kind!=='circle')return mapped;
  const next=materialView(targetPose);
  const matches:Point[]=[];
  let dx=0,dy=0;
  const source=active.sourceBounds,sx=target.width/source.width,sy=target.height/source.height;
  for(const [key,point] of materialView(active.sourcePose)){
    if(!point||Math.hypot(point[0]-selected.center[0],point[1]-selected.center[1])>selected.radius)continue;
    const destination=next.get(key);
    if(!destination)continue;
    dx+=destination[0]-(target.x+(point[0]-source.x)*sx);
    dy+=destination[1]-(target.y+(point[1]-source.y)*sy);
    matches.push(destination);
  }
  if(!matches.length)return mapped;
  const center:Point=[mapped.center[0]+dx/matches.length,mapped.center[1]+dy/matches.length];
  let radius=mapped.radius;
  for(const p of matches)radius=Math.max(radius,Math.hypot(p[0]-center[0],p[1]-center[1]));
  return {...mapped,center,radius};
}

function instructionFromStep(step:DiagramProject['steps'][number],symbolId:string,area:DiagramZoomArea):ZoomInstruction {
  const sourcePose=step.paperVisible===false?null:step.pose;
  return {area,sourceStepId:step.id,symbolId,sourcePose,sourceBounds:sourcePose?diagramZoomPaperBounds(sourcePose,step.images,true,undefined,step.simulationSurface):undefined};
}

function activeZoomInstruction(project:DiagramProject,stepId:string):(ZoomInstruction & {target:DiagramZoomBounds;targetPose:DiagramPose|null})|null {
  const index=project.steps.findIndex(step=>step.id===stepId);if(index<0)throw new Error('指定的折序步骤不存在。');
  const step=project.steps[index],paper=project.states[index].doc.paper;
  let active:ZoomInstruction|null=step.figureCrop?{area:step.figureCrop,sourceStepId:stepId}:null;
  for(let i=index-1;!active&&i>=0;i--){
    const source=project.steps[i],items=source.annotations??[];
    for(let j=items.length-1;j>=0;j--){
      const annotation=items[j];if(annotation.kind!=='symbol')continue;
      if(annotation.symbol==='zoomOut')return null;
      if(annotation.symbol==='zoom'&&annotation.zoomArea){active=instructionFromStep(source,annotation.id,annotation.zoomArea);break;}
    }
  }
  if(!active)return null;
  return {...active,targetPose:step.paperVisible===false?null:step.pose,target:diagramZoomPaperBounds(step.pose,step.images,step.paperVisible!==false,paper,step.simulationSurface)};
}

/** Instruction symbols take effect in the following step. Replaying this pure
 * scan makes navigation, history, duplication and deletion deterministic; no
 * second derived zoom state can become stale in saved projects. The mapping
 * preserves the selected extent and any identifiable enclosed material vertices. */
export function diagramStepZoom(project:DiagramProject,stepId:string):DiagramStepZoom|null {
  const active=activeZoomInstruction(project,stepId);
  if(!active)return null;
  const region=inheritedRegion(active,active.target,active.targetPose);
  return region?{region,sourceStepId:active.sourceStepId,symbolId:active.symbolId}:null;
}

/** An inserted panel follows its host in reading order, even when the child
 * is an image-only project with no local instruction history. */
export function diagramProcessFigureZoom(project:DiagramProject,host:DiagramProject['steps'][number],figure:DiagramProject):DiagramZoomRegion|null {
  const step=figure.steps[0],targetPose=step.paperVisible===false?null:step.pose;
  const bounds=()=>diagramZoomPaperBounds(targetPose,step.images,step.paperVisible!==false,figure.states[0].doc.paper,step.simulationSurface);
  for(const annotation of [...(host.annotations??[])].reverse()){
    if(annotation.kind!=='symbol')continue;
    if(annotation.symbol==='zoomOut')return null;
    if(annotation.symbol==='zoom'&&annotation.zoomArea)return inheritedRegion(instructionFromStep(host,annotation.id,annotation.zoomArea),bounds(),targetPose);
  }
  const inherited=activeZoomInstruction(project,host.id);
  if(inherited)return inheritedRegion(inherited,bounds(),targetPose);
  return diagramStepZoom(figure,step.id)?.region??null;
}

/** The step rail needs every inherited crop. Replay instructions once instead
 * of rescanning all preceding steps for each individual thumbnail. */
export function diagramStepZooms(project:DiagramProject):Map<string,DiagramStepZoom|null> {
  const result=new Map<string,DiagramStepZoom|null>(),states=new Map(project.states.map(state=>[state.id,state]));
  let active:ZoomInstruction|null=null;
  for(const step of project.steps){
    let zoom:DiagramStepZoom|null=null;
    const crop=step.figureCrop?{area:step.figureCrop,sourceStepId:step.id,symbolId:undefined}:active;
    if(crop){
      const target=diagramZoomPaperBounds(step.pose,step.images,step.paperVisible!==false,states.get(step.beforeId)?.doc.paper,step.simulationSurface);
      const region=inheritedRegion(crop,target,step.paperVisible===false?null:step.pose);
      if(region)zoom={region,sourceStepId:crop.sourceStepId,symbolId:crop.symbolId};
    }
    result.set(step.id,zoom);
    for(const annotation of step.annotations??[])if(annotation.kind==='symbol'){
      if(annotation.symbol==='zoomOut')active=null;
      else if(annotation.symbol==='zoom'&&annotation.zoomArea)active=instructionFromStep(step,annotation.id,annotation.zoomArea);
    }
  }
  return result;
}

/** Distinguish an inactive zoom from an authored selection that needs repair. */
export function diagramStepZoomIssue(project:DiagramProject,stepId:string):string|undefined {
  const active=activeZoomInstruction(project,stepId);
  if(active&&!tryMapDiagramZoomArea(active.area,active.target))return '放大选区无法应用到当前纸幅，已显示完整视图。请返回放置放大符号的步骤重新选择区域。';
  return undefined;
}
