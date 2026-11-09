import {preferenceStorage} from './preferenceStorage';
export interface CanvasZoomSettings {preciseZoom:boolean;zoomSpeed:number}
export const CANVAS_ZOOM_KEY='zhezhi.canvas-zoom.v1';
export const defaultCanvasZoom=():CanvasZoomSettings=>({preciseZoom:true,zoomSpeed:1});
export function validateCanvasZoom(value:unknown):CanvasZoomSettings{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('缩放设置格式无效。');
 const v=value as Record<string,unknown>;
 if(typeof v.preciseZoom!=='boolean')throw Error('精细缩放设置须为布尔值。');
 if(typeof v.zoomSpeed!=='number'||!Number.isFinite(v.zoomSpeed)||v.zoomSpeed<0||v.zoomSpeed>10)throw Error('缩放速度须为 0—10。');
 return {preciseZoom:v.preciseZoom,zoomSpeed:v.zoomSpeed};
}
export function readCanvasZoom(storage?:Pick<Storage,'getItem'>):CanvasZoomSettings{
 try{const raw=(storage??preferenceStorage).getItem(CANVAS_ZOOM_KEY);if(!raw)return defaultCanvasZoom();const data=JSON.parse(raw);if(data.version!==1)throw Error('version');return validateCanvasZoom(data.settings);}catch{return defaultCanvasZoom();}
}
export function saveCanvasZoom(value:CanvasZoomSettings,storage:Pick<Storage,'setItem'>=preferenceStorage){storage.setItem(CANVAS_ZOOM_KEY,JSON.stringify({version:1,settings:validateCanvasZoom(value)}));}
/** Browser units are not Java wheel rotations: define 100 px / 3 lines / 1 page per notch. */
export function wheelZoomFactor(deltaY:number,deltaMode:number,settings:CanvasZoomSettings):number{
 const {preciseZoom,zoomSpeed}=validateCanvasZoom(settings);
 if(!Number.isFinite(deltaY)||deltaY===0||zoomSpeed===0)return 1;
 const unit=deltaMode===0?100:deltaMode===1?3:deltaMode===2?1:0;
 if(!unit)return 1;
 const rotation=preciseZoom?deltaY/unit:Math.sign(deltaY);
 // Reciprocal of Oriedita CameraModel scale: this canvas stores visible world width.
 return Math.pow(1+zoomSpeed/10,Math.max(-20,Math.min(20,rotation)));
}
