import type {DiagramPose,DiagramProject,DiagramStep} from './diagramProject';
import type {DiagramPDFOptions,DiagramPDFRect,DiagramPanelRef} from './diagramPDFLayout';
import {diagramPDFBranchPanels,diagramPanelRoute} from './diagramPDFBranchPanels';
import {projectDiagramSpatialPoint,type DiagramSpatialPose} from './diagramSpatialPose';
import {arcballCamera,centeredOrbitCamera,sameSpatialCamera} from './diagramArcball';
import {diagramSimulationSurfaceViewFromCamera} from './diagramSimulationSurfaceCamera';
import {startDiagramSpatialReprojection} from './diagramSpatialTask';
import {validateSimulationView,type SimulationPose} from '../engine/simPose';
import {defaultModelView} from './modelViewState';

export type DiagramGalleryPlace='cover'|'result';
/** Position and width as fractions of the whole page. Height follows the artwork. */
export interface DiagramGalleryPlacement {x:number;y:number;width:number}
export interface DiagramGalleryBox {index:number;place:DiagramGalleryPlace;box:DiagramPDFRect;captionHeight?:number}
export interface DiagramGalleryView {
  stepId:string;
  angle?:GalleryAngle;
  caption:string;
  cover:boolean;
  result:boolean;
  layout?:Partial<Record<DiagramGalleryPlace,DiagramGalleryPlacement>>;
  side:'front'|'back';
  rotation:number;
  drawingRotation:number;
  mirrorX?:boolean;
  mirrorY?:boolean;
  camera?:DiagramSpatialPose['camera'];
  simulationView?:SimulationPose['view'];
}
export const galleryAngles={saved:'当前视角',opposite:'背面',left:'左斜视',right:'右斜视',custom:'自选视角'} as const;
export type GalleryAngle=keyof typeof galleryAngles;
type GalleryPreset=Exclude<GalleryAngle,'custom'>;
export function galleryAnglesFor(step:DiagramStep):GalleryPreset[] {
  if(step.paperVisible===false||(!step.pose&&!step.simulationSurface)||step.images?.length)return ['saved'];
  return step.simulationSurface||step.pose?.spatial&&!step.pose.paperDeformation?.nodes.length?['saved','opposite','left','right']:['saved','opposite'];
}
export function captureGalleryView(step:DiagramStep,angle:GalleryPreset):DiagramGalleryView {
  const view=step.pose?.view??defaultModelView(),drawingRotation=step.canvas?.drawingRotation??0;
  if(!galleryAnglesFor(step).includes(angle))throw Error('当前形态不支持此视角。');
  const item:DiagramGalleryView={stepId:step.id,angle,caption:'',cover:false,result:true,side:view.side,rotation:view.rotation,drawingRotation};
  if(step.simulationSurface){
    const current=step.simulationSurface.pose.view;
    const yawOffset={saved:0,opposite:Math.PI,left:-Math.PI/5,right:Math.PI/5}[angle];
    item.simulationView={...structuredClone(current),yaw:current.yaw+yawOffset,pitch:angle==='opposite'?-current.pitch:current.pitch};
  }else{
    if(angle==='opposite')item.side=view.side==='front'?'back':'front';
    if(step.pose?.spatial){
      const {camera,vertices}=step.pose.spatial;
      item.camera=angle==='left'||angle==='right'?arcballCamera(centeredOrbitCamera(camera,vertices),[50,50],[angle==='left'?25:75,43],{width:100,height:100},view.side==='back',view.rotation+drawingRotation):structuredClone(camera);
    }
  }
  return item;
}

/** Store the camera in the same coordinate system used to render this source. */
export function captureCustomGalleryView(step:DiagramStep,camera:DiagramSpatialPose['camera'],initialView?:DiagramGalleryView):DiagramGalleryView {
  if(!galleryAnglesFor(step).includes('left'))throw Error('当前步骤没有可以自由转动的成品。');
  projectDiagramSpatialPoint([0,0,0],camera);
  const item=captureGalleryView(step,'saved');
  const previous=initialView?.stepId===step.id?initialView:undefined;
  item.angle='custom';
  if(previous){
    item.side=previous.side;
    item.rotation=previous.rotation;
    item.drawingRotation=previous.drawingRotation;
  }
  if(step.simulationSurface){
    const sourceView=previous?.simulationView??step.simulationSurface.pose.view;
    item.simulationView=diagramSimulationSurfaceViewFromCamera(sourceView,camera);
  }else{
    item.camera=structuredClone(camera);
  }
  return item;
}

export function validateGalleryViews(value:unknown):void {
  if(value===undefined)return;
  if(!Array.isArray(value))throw Error('成品图列表无效。');
  for(const item of value){
    if(!item||typeof item.stepId!=='string'||!item.stepId||typeof item.caption!=='string'||item.caption.length>100||
       typeof item.cover!=='boolean'||typeof item.result!=='boolean'||item.angle!==undefined&&!Object.hasOwn(galleryAngles,item.angle)||!['front','back'].includes(item.side)||
       ![item.rotation,item.drawingRotation].every(a=>Number.isFinite(a)&&a>=0&&a<360))throw Error('成品图来源、视角或图注无效。');
    if(item.camera!==undefined)projectDiagramSpatialPoint([0,0,0],item.camera);
    if(item.simulationView!==undefined)validateSimulationView(item.simulationView);
    if([item.mirrorX,item.mirrorY].some(value=>value!==undefined&&typeof value!=='boolean'))throw Error('成品图的镜像设置无效。');
    if(item.angle==='custom'&&(item.camera===undefined)===(item.simulationView===undefined))throw Error('自选视角需要一份空间或曲面相机数据。');
    if(item.layout!==undefined){
      if(!item.layout||typeof item.layout!=='object'||Array.isArray(item.layout))throw Error('成品图布局无效。');
      for(const [place,value] of Object.entries(item.layout)){
        if(place!=='cover'&&place!=='result'||!value||typeof value!=='object')throw Error('成品图布局无效。');
        const {x,y,width}=value as DiagramGalleryPlacement;
        if(![x,y,width].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||width<=0)throw Error('成品图位置或大小超出页面范围。');
      }
    }
  }
}
interface GallerySource {step:DiagramStep;ref:DiagramPanelRef}
const sourceCache=new WeakMap<DiagramProject,Map<string,GallerySource>>();
export function gallerySources(project:DiagramProject):ReadonlyMap<string,GallerySource>{
  const cached=sourceCache.get(project);
  if(cached)return cached;
  const sources=new Map<string,GallerySource>();
  if(project.branchSteps?.length){
    const steps=new Map(project.steps.map(step=>[step.id,step]));
    for(const {step} of project.branchSteps)steps.set(step.id,step);
    for(const ref of diagramPDFBranchPanels(project).refs.values()){
      if(ref.figureIndex!==undefined)continue;
      const step=steps.get(ref.branchStepId!)!;
      sources.set(step.id,{ref,step});
    }
  }else project.steps.forEach((step,stepIndex)=>sources.set(step.id,{step,ref:{stepIndex}}));
  sourceCache.set(project,sources);
  return sources;
}
/** The index identifies the settings row even when the same view is added twice. */
export function galleryRows(project:DiagramProject,options:DiagramPDFOptions,place:DiagramGalleryPlace) {
  if(!options.gallery?.length)return [];
  const sources=gallerySources(project);
  return options.gallery.flatMap((item,index)=>{
    const source=sources.get(item.stepId);
    return item[place]&&source?[{item,index,ref:source.ref}]:[];
  });
}
export function galleryItems(project:DiagramProject,options:DiagramPDFOptions,place:DiagramGalleryPlace) {
  return galleryRows(project,options,place).map(row=>row.item);
}
/** Read the same page-space rectangles used to embed the vector art. */
export function readDiagramPDFGalleryBoxes(root:ParentNode):DiagramGalleryBox[]{
  return Array.from(root.querySelectorAll<SVGGElement>('[data-gallery-view]')).flatMap(element=>{
    const {galleryPlace:place,galleryView,galleryX,galleryY,galleryWidth,galleryHeight}=element.dataset;
    const index=Number(galleryView),box={x:Number(galleryX),y:Number(galleryY),width:Number(galleryWidth),height:Number(galleryHeight)};
    if((place!=='cover'&&place!=='result')||!Number.isInteger(index)||index<0||!Object.values(box).every(Number.isFinite)||box.width<=0||box.height<=0)return [];
    const caption=element.querySelector(':scope > text');
    return [{index,place:place as DiagramGalleryPlace,box,...(caption?{captionHeight:Number(caption.getAttribute('font-size'))*1.6}:{})}];
  });
}
export function clampDiagramGalleryPlacement(value:DiagramGalleryPlacement,aspect:number,page:Pick<DiagramPDFRect,'width'|'height'>):DiagramGalleryPlacement {
  const maxWidth=Math.min(1,page.height*aspect/page.width);
  const width=Math.min(maxWidth,Math.max(1/page.width,value.width));
  const height=width*page.width/(aspect*page.height);
  return {x:Math.max(0,Math.min(value.x,1-width)),y:Math.max(0,Math.min(value.y,1-height)),width};
}
export function galleryImageBox(slot:DiagramPDFRect,aspect:number,labelHeight:number,page:Pick<DiagramPDFRect,'width'|'height'>,layout?:DiagramGalleryPlacement):DiagramPDFRect {
  if(layout){
    const {x,y,width}=clampDiagramGalleryPlacement(layout,aspect,page);
    return {x:x*page.width,y:y*page.height,width:width*page.width,height:width*page.width/aspect};
  }
  const height=Math.min(slot.height-labelHeight,slot.width/aspect),width=Math.min(slot.width,height*aspect);
  return {x:slot.x+(slot.width-width)/2,y:slot.y+(slot.height-height-labelHeight)/2,width,height};
}
export function galleryPlacementFits(image:DiagramPDFRect,captionHeight:number,bounds:DiagramPDFRect,occupied:readonly DiagramPDFRect[]):boolean {
  const bottom=image.y+image.height+captionHeight,right=image.x+image.width,tolerance=1e-7;
  return image.x>=bounds.x-tolerance&&image.y>=bounds.y-tolerance&&right<=bounds.x+bounds.width+tolerance&&bottom<=bounds.y+bounds.height+tolerance&&
    occupied.every(r=>image.x>=r.x+r.width-tolerance||right<=r.x+tolerance||image.y>=r.y+r.height-tolerance||bottom<=r.y+tolerance);
}
/** Pick the grid that shows the most paper. A tall figure and a wide bird need different grids. */
export function galleryGrid(box:DiagramPDFRect,aspects:number[]):DiagramPDFRect[]{
  const count=aspects.length;
  if(!count)return [];
  let columns=1,bestArea=0;
  for(let n=1;n<=count;n++){
    const rows=Math.ceil(count/n),width=box.width/n,height=box.height/rows;
    const area=aspects.reduce((sum,aspect)=>sum+Math.min(width,height*aspect)*Math.min(height,width/aspect),0);
    if(area>bestArea){columns=n;bestArea=area;}
  }
  const rows=Math.ceil(count/columns);
  const gap=Math.min(12,box.width/columns*.06,box.height/rows*.06);
  const width=(box.width-gap*(columns-1))/columns,height=(box.height-gap*(rows-1))/rows;
  return Array.from({length:count},(_,i)=>{
    const row=Math.floor(i/columns),inRow=Math.min(columns,count-row*columns);
    return {x:box.x+(columns-inRow)*(width+gap)/2+(i%columns)*(width+gap),y:box.y+row*(height+gap),width,height};
  });
}

type Projection=Pick<DiagramPose,'result'|'spatial'>;
const prepared=new WeakMap<DiagramPose,Map<string,Projection>>();
export async function prepareGalleryViews(project:DiagramProject,options:DiagramPDFOptions,signal?:AbortSignal){
  for(const {item,ref} of [...(options.cover==='none'?[]:galleryRows(project,options,'cover')),...galleryRows(project,options,'result')]){
    if(signal?.aborted)throw new DOMException('导出已取消。','AbortError');
    if(!item.camera)continue;
    const route=diagramPanelRoute(project,ref),index=ref.stepIndex,pose=route.steps[index].pose;
    if(!pose?.spatial)throw Error('成品图的空间姿态已变更，请在成品页设置中重新添加此视角。');
    if(sameSpatialCamera(item.camera,pose.spatial.camera))continue;
    const key=JSON.stringify(item.camera),known=prepared.get(pose)??new Map<string,Projection>();
    if(known.has(key))continue;
    const history=route.steps.slice(0,index).flatMap(s=>s.paperStates?.spatial??s.paperStates?.flat??s.pose??[]);
    const task=startDiagramSpatialReprojection(pose,item.camera,[...history,pose]);
    signal?.addEventListener('abort',task.cancel,{once:true});
    try{known.set(key,await task.promise);prepared.set(pose,known);}
    catch(error){if(signal?.aborted)throw new DOMException('导出已取消。','AbortError');throw Error('第 '+(index+1)+' 步成品图无法生成此视角。'+(error instanceof Error?error.message:''));}
    finally{signal?.removeEventListener('abort',task.cancel);}
  }
}
export function galleryStep(project:DiagramProject,item:DiagramGalleryView):DiagramStep {
  const source=gallerySources(project).get(item.stepId);
  if(!source)throw Error('成品图来源步骤已移除。');
  const step=diagramPanelRoute(project,source.ref).steps[source.ref.stepIndex];
  let pose=step.pose,surface=step.simulationSurface;
  if(item.simulationView){
    if(!surface)throw Error('成品图的模拟曲面已变更，请重新添加此视角。');
    surface={...surface,pose:{...surface.pose,view:item.simulationView}};
  }
  if(pose){
    const projection=item.camera&&pose.spatial&&!sameSpatialCamera(pose.spatial.camera,item.camera)?prepared.get(pose)?.get(JSON.stringify(item.camera)):undefined;
    if(item.camera&&(!pose.spatial||!sameSpatialCamera(pose.spatial.camera,item.camera)&&!projection))throw Error('成品图视角尚未准备完成。');
    pose={...pose,...projection,view:{...(pose.view??defaultModelView()),side:item.side,rotation:item.rotation,cameras:{}}};
  }
  return {...step,pose,simulationSurface:surface,canvas:step.canvas?{...step.canvas,drawingRotation:item.drawingRotation}:undefined};
}

