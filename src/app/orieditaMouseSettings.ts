import {validateCanvasZoom,type CanvasZoomSettings} from './canvasZoom';
import {validateCanvasPicking,type CanvasPicking} from './canvasPicking';
export const MOUSE_ZOOM_LABELS={preciseZoom:'精细缩放',zoomSpeed:'缩放速度'};
export const MOUSE_PICKING_LABELS={mouseRadius:'拾取半径（像素）',displayPointSpotlight:'显示拾取范围圆',displayPointOffset:'显示鼠标中心指示线'};
/** Exact original field names only; absent values preserve current preferences. */
export function previewOrieditaMouse(config:Record<string,unknown>,zoom:CanvasZoomSettings,picking:CanvasPicking){
 function group<T extends object>(labels:Record<keyof T,string>,current:T,validate:(v:unknown)=>T){
  const candidate={...current},recognized:string[]=[],issues:string[]=[];
  for(const key of Object.keys(labels) as (keyof T & string)[]){
   if(!Object.hasOwn(config,key))continue;
   try{const next=validate({...candidate,[key]:config[key]});Object.assign(candidate,next);recognized.push(key);}
   catch(e){issues.push(`${key}：${e instanceof Error?e.message:String(e)}`);}
  }
  return {settings:issues.length?null:validate(candidate),recognized,issues};
 }
 return {
  zoom:group(MOUSE_ZOOM_LABELS,validateCanvasZoom(zoom),validateCanvasZoom),
  picking:group(MOUSE_PICKING_LABELS,validateCanvasPicking(picking),validateCanvasPicking),
  ignored:Object.keys(config).filter(key=>!Object.hasOwn(MOUSE_ZOOM_LABELS,key)&&!Object.hasOwn(MOUSE_PICKING_LABELS,key)),
 };
}
