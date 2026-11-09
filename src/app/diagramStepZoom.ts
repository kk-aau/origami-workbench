import type {Point} from '../core/types';
import type {DiagramPose,DiagramProject} from './diagramProject';
import {diagramImageBounds,type DiagramImage} from './diagramImages';
import {defaultModelView} from './modelViewState';
import {modelProjection} from './modelProjection';
import {diagramPaperVertices} from './diagramPaperDeformation';
import type {DiagramSimulationSurface} from './diagramSimulationSurface';
import {diagramSimulationSurfaceBounds} from './diagramSimulationSurfaceRender';
import {validateDiagramZoomBounds,validateDiagramZoomRegion,type DiagramZoomRegion,type DiagramZoomBounds} from './diagramZoomGeometry';

/** The glyph and the illustrated crop are independent: moving the arrow never
 * silently chooses another part of the paper. No physical CP identity is added. */
export interface DiagramZoomArea {region:DiagramZoomRegion;basis:DiagramZoomBounds}
export interface DiagramStepZoom {region:DiagramZoomRegion;sourceStepId:string;symbolId:string}

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
    points.push(...diagramPaperVertices(pose).map(projection.project));
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
  if(region.kind==='circle')return {kind:'circle',center:point(region.center),radius:region.radius*Math.min(sx,sy)};
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

function activeZoomInstruction(project:DiagramProject,stepId:string):{area:DiagramZoomArea;sourceStepId:string;symbolId:string;target:DiagramZoomBounds}|null {
  const index=project.steps.findIndex(step=>step.id===stepId);if(index<0)throw new Error('指定的折序步骤不存在。');
  let active:{area:DiagramZoomArea;sourceStepId:string;symbolId:string}|null=null;
  for(let i=0;i<index;i++){
    const step=project.steps[i];
    for(const annotation of step.annotations??[])if(annotation.kind==='symbol'){
      if(annotation.symbol==='zoomOut')active=null;
      else if(annotation.symbol==='zoom'&&annotation.zoomArea)active={area:annotation.zoomArea,sourceStepId:step.id,symbolId:annotation.id};
    }
  }
  if(!active)return null;
  const step=project.steps[index],paper=project.states.find(state=>state.id===step.beforeId)?.doc.paper;
  return {...active,target:diagramZoomPaperBounds(step.pose,step.images,step.paperVisible!==false,paper,step.simulationSurface)};
}

/** Instruction symbols take effect in the following step. Replaying this pure
 * scan makes navigation, history, duplication and deletion deterministic; no
 * second derived zoom state can become stale in saved projects. The mapping
 * preserves the selected relative visual area as the paper shape changes; it
 * is deliberately not a claim of physical material tracking across folds. */
export function diagramStepZoom(project:DiagramProject,stepId:string):DiagramStepZoom|null {
  const active=activeZoomInstruction(project,stepId);
  if(!active)return null;
  const region=tryMapDiagramZoomArea(active.area,active.target);
  return region?{region,sourceStepId:active.sourceStepId,symbolId:active.symbolId}:null;
}

/** The step rail needs every inherited crop. Replay instructions once instead
 * of rescanning all preceding steps for each individual thumbnail. */
export function diagramStepZooms(project:DiagramProject):Map<string,DiagramStepZoom|null> {
  const result=new Map<string,DiagramStepZoom|null>(),states=new Map(project.states.map(state=>[state.id,state]));
  let active:{area:DiagramZoomArea;sourceStepId:string;symbolId:string}|null=null;
  for(const step of project.steps){
    let zoom:DiagramStepZoom|null=null;
    if(active){
      const target=diagramZoomPaperBounds(step.pose,step.images,step.paperVisible!==false,states.get(step.beforeId)?.doc.paper,step.simulationSurface);
      const region=tryMapDiagramZoomArea(active.area,target);
      if(region)zoom={region,sourceStepId:active.sourceStepId,symbolId:active.symbolId};
    }
    result.set(step.id,zoom);
    for(const annotation of step.annotations??[])if(annotation.kind==='symbol'){
      if(annotation.symbol==='zoomOut')active=null;
      else if(annotation.symbol==='zoom'&&annotation.zoomArea)active={area:annotation.zoomArea,sourceStepId:step.id,symbolId:annotation.id};
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
