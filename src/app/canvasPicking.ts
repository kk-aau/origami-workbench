import {preferenceStorage} from './preferenceStorage';
export interface CanvasPicking {mouseRadius:number;displayPointSpotlight:boolean;displayPointOffset:boolean}
export const CANVAS_PICKING_KEY='zhezhi.canvas-picking.v1';
export const defaultCanvasPicking=():CanvasPicking=>({mouseRadius:10,displayPointSpotlight:false,displayPointOffset:false});
export function validateCanvasPicking(value:unknown):CanvasPicking{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('拾取设置格式无效。');
 const v=value as Record<string,unknown>;
 if(typeof v.mouseRadius!=='number'||!Number.isFinite(v.mouseRadius)||v.mouseRadius<2||v.mouseRadius>100)throw Error('拾取半径须为 2—100 像素。');
 if(typeof v.displayPointSpotlight!=='boolean'||typeof v.displayPointOffset!=='boolean')throw Error('拾取指示设置须为布尔值。');
 return {mouseRadius:v.mouseRadius,displayPointSpotlight:v.displayPointSpotlight,displayPointOffset:v.displayPointOffset};
}
export function readCanvasPicking(storage?:Pick<Storage,'getItem'>):CanvasPicking{
 try{const raw=(storage??preferenceStorage).getItem(CANVAS_PICKING_KEY);if(!raw)return defaultCanvasPicking();const data=JSON.parse(raw);if(data.version!==1)throw Error('version');return validateCanvasPicking(data.settings);}catch{return defaultCanvasPicking();}
}
export function saveCanvasPicking(value:CanvasPicking,storage:Pick<Storage,'setItem'>=preferenceStorage){storage.setItem(CANVAS_PICKING_KEY,JSON.stringify({version:1,settings:validateCanvasPicking(value)}));}
export function pickingWorldRadius(settings:CanvasPicking,units:number):number{
 if(!Number.isFinite(units)||units<=0)throw Error('画布比例无效。');
 return validateCanvasPicking(settings).mouseRadius*units;
}
