import {preferenceStorage} from './preferenceStorage';
import {isCreaseLineStyle,isAuxiliaryLineStyle,type CreaseLineStyle,type AuxiliaryLineStyle} from './creaseLineStyle';
/** Reference CSS pixels converted once to the document's millimetres. */
export const DISPLAY_PIXEL_MM=25.4/96;
export type CreasePointStyle='hollow'|'circle'|'square';
export function isCreasePointStyle(value:unknown):value is CreasePointStyle{return value==='hollow'||value==='circle'||value==='square';}
export interface CreaseDisplay {lineWidth:number;auxLineWidth:number;auxLineStyle:AuxiliaryLineStyle;markLineWidth?:number;roundedEnds:boolean;lineStyle:CreaseLineStyle;pointSize:number;pointStyle?:CreasePointStyle;antiAlias:boolean;showToolGuide?:boolean;showCursorHint?:boolean}
export const CREASE_DISPLAY_KEY='zhezhi.crease-display.v1';
export const defaultCreaseDisplay=():CreaseDisplay=>({lineWidth:1.6,auxLineWidth:1.6,auxLineStyle:'solid',markLineWidth:1.3,roundedEnds:false,lineStyle:'WORKBENCH',pointSize:0,pointStyle:'hollow',antiAlias:true,showToolGuide:true,showCursorHint:true});
export function validateCreaseDisplay(value:unknown):CreaseDisplay{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('显示设置格式无效。');
 const v=value as Record<string,unknown>;
 const markLineWidth=v.markLineWidth===undefined?1.3:v.markLineWidth;
 if(typeof markLineWidth!=='number'||!Number.isFinite(markLineWidth)||markLineWidth<.5||markLineWidth>20)throw new Error('独立标记线宽须为 0.5—20 像素。');
 for(const key of ['lineWidth','auxLineWidth'])if(typeof v[key]!=='number'||!Number.isFinite(v[key])||v[key]<.5||v[key]>20)throw new Error('线宽须为 0.5—20 像素。');
 if(typeof v.roundedEnds!=='boolean')throw new Error('圆头端点设置须为布尔值。');
 const lineStyle=v.lineStyle===undefined?'WORKBENCH':v.lineStyle;
 if(!isCreaseLineStyle(lineStyle))throw new Error('未知的山谷线显示样式。');
 const auxLineStyle=v.auxLineStyle===undefined?'solid':v.auxLineStyle;
 if(!isAuxiliaryLineStyle(auxLineStyle))throw new Error('辅助线样式须为实线或虚线。');
 const pointSize=v.pointSize===undefined?0:v.pointSize;
 if(typeof pointSize!=='number'||!Number.isInteger(pointSize)||pointSize<0||pointSize>20)throw new Error('顶点标记大小须为 0—20 的整数。');
 const pointStyle=v.pointStyle===undefined||v.pointStyle==='auto'?'hollow':v.pointStyle;
 if(!isCreasePointStyle(pointStyle))throw new Error('点样式须为空心圆、实心方块或实心圆。');
 const antiAlias=v.antiAlias===undefined?true:v.antiAlias;
 if(typeof antiAlias!=='boolean')throw new Error('抗锯齿设置须为布尔值。');
 const showToolGuide=v.showToolGuide===undefined?true:v.showToolGuide,showCursorHint=v.showCursorHint===undefined?true:v.showCursorHint;
 if(typeof showToolGuide!=='boolean'||typeof showCursorHint!=='boolean')throw new Error('操作提示设置须为布尔值。');
 return {lineWidth:v.lineWidth as number,auxLineWidth:v.auxLineWidth as number,auxLineStyle,markLineWidth,roundedEnds:v.roundedEnds,lineStyle,pointSize,pointStyle,antiAlias,showToolGuide,showCursorHint};
}
export function readCreaseDisplay(storage?:Pick<Storage,'getItem'>):CreaseDisplay{
 try{const raw=(storage??preferenceStorage).getItem(CREASE_DISPLAY_KEY);if(!raw)return defaultCreaseDisplay();const v=JSON.parse(raw);if(v.version!==1)throw Error('version');return validateCreaseDisplay(v.settings);}catch{return defaultCreaseDisplay();}
}
export function saveCreaseDisplay(value:CreaseDisplay,storage:Pick<Storage,'setItem'>=preferenceStorage){const settings=validateCreaseDisplay(value);storage.setItem(CREASE_DISPLAY_KEY,JSON.stringify({version:1,settings}));}
/** Only exact application-model field matches; no Java anti-alias width compensation. */
export function previewOrieditaDisplay(config:Record<string,unknown>,current:CreaseDisplay,native=false){
 const candidate=validateCreaseDisplay(current),ignored:string[]=[],issues:string[]=[],recognized:string[]=[];
 for(const [key,value]of Object.entries(config)){
  if((key==='showToolGuide'||key==='showCursorHint')&&native){
   if(typeof value!=='boolean')issues.push('操作提示设置须为布尔值。');else{candidate[key]=value;recognized.push(key);}
  }else if(key==='markLineWidth'&&native){
   if(typeof value!=='number'||!Number.isFinite(value)||value<.5||value>20)issues.push('独立标记线宽须为 0.5—20 像素。');else{candidate.markLineWidth=value;recognized.push(key);}
  }else if(key==='auxLineStyle'&&native){
   if(!isAuxiliaryLineStyle(value))issues.push('辅助线样式须为实线或虚线。');else{candidate.auxLineStyle=value;recognized.push(key);}
  }else if(key==='pointStyle'&&native){
   const pointStyle=value==='auto'?'hollow':value;
   if(!isCreasePointStyle(pointStyle))issues.push('点样式须为空心圆、实心方块或实心圆。');else{candidate.pointStyle=pointStyle;recognized.push(key);}
  }else if(key==='lineWidth'||key==='auxLineWidth'){
   if(typeof value!=='number'||!Number.isFinite(value)||(!native&&!Number.isInteger(value))||value<(native?.5:1)||value>20)issues.push(`${key} 须为 1—20 的整数；未自动截断。`);
   else{candidate[key]=value;recognized.push(key);}
  }else if(key==='pointSize'){
   if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>20)issues.push('pointSize 须为 0—20 的整数。');else{candidate.pointSize=value;recognized.push(key);}
  }else if(key==='lineStyle'){
   if(!isCreaseLineStyle(value)||(!native&&value==='WORKBENCH'))issues.push('lineStyle 不是支持的 Oriedita 样式名称。');else{candidate.lineStyle=value;recognized.push(key);}
  }else if(key==='roundedEnds'){
   if(typeof value!=='boolean')issues.push('roundedEnds 须为布尔值。');else{candidate.roundedEnds=value;recognized.push(key);}
  }else if(key==='antiAlias'){
   if(typeof value!=='boolean')issues.push('antiAlias 须为布尔值。');else{candidate.antiAlias=value;recognized.push(key);}
  }else ignored.push(key);
 }
 return {settings:issues.length?null:candidate,recognized,ignored,issues};
}
