import {validateModelColors,type ModelColors} from './modelColors';
import type {Point} from '../core/types';
import type {DiagramDepth} from './diagramDepth';
export type ModelCameraKey='front-solid'|'front-transparent'|'back-solid'|'back-transparent';
export type ModelViewLayout='single'|'both'|'four';
export type ModelDisplayStyle='paper'|'wire';
export interface ModelCamera {rotation:number;x:number;y:number;width:number;height:number}
export interface ModelBoardPlacement {x:number;y:number;width:number;height:number;visible:boolean}
export interface ModelViewState {depth?:DiagramDepth;showExistingCreases?:boolean;projectionCenter?:Point;side:'front'|'back';rotation:number;xray:boolean;cameras:Partial<Record<ModelCameraKey,ModelCamera>>;colors?:ModelColors;shadows?:boolean;antiAlias?:boolean;displayNumbers?:boolean;layout?:ModelViewLayout;displayStyle?:ModelDisplayStyle;board?:ModelBoardPlacement}
export const defaultModelView=():ModelViewState=>({side:'front',rotation:0,xray:false,antiAlias:true,displayNumbers:false,cameras:{}});
const keys=['front-solid','front-transparent','back-solid','back-transparent'];
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const angle=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<360;
export function validateModelView(value:unknown):asserts value is ModelViewState{
  if(!record(value)||Object.keys(value).some(key=>!['depth','showExistingCreases','projectionCenter','cameras','rotation','side','xray','colors','shadows','antiAlias','displayNumbers','layout','displayStyle','board'].includes(key))||(value.side!=='front'&&value.side!=='back')||!angle(value.rotation)||typeof value.xray!=='boolean'||!record(value.cameras))throw new Error('模型视图设置无效。');
  if(Object.hasOwn(value,'depth')){const d=value.depth;if(!record(d)||Object.keys(d).sort().join(',')!=='amount,direction'||typeof d.amount!=='number'||!Number.isFinite(d.amount)||d.amount<0||d.amount>.15||!angle(d.direction))throw Error('图解立体化的展开量或方向无效。');}
  if(Object.hasOwn(value,'showExistingCreases')&&typeof value.showExistingCreases!=='boolean')throw new Error('已有折痕显示设置必须为布尔值。');
  if(Object.hasOwn(value,'projectionCenter')&&(!Array.isArray(value.projectionCenter)||value.projectionCenter.length!==2||value.projectionCenter.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e9)))throw new Error('模型视图中心无效。');
  if(Object.hasOwn(value,'board'))validateModelBoardPlacement(value.board);
  if(Object.hasOwn(value,'colors'))validateModelColors(value.colors);
  if(Object.hasOwn(value,'shadows')&&typeof value.shadows!=='boolean')throw new Error('模型阴影设置必须为布尔值。');
  if(Object.hasOwn(value,'antiAlias')&&typeof value.antiAlias!=='boolean')throw new Error('模型抗锯齿设置必须为布尔值。');
  if(Object.hasOwn(value,'displayNumbers')&&typeof value.displayNumbers!=='boolean')throw new Error('模型编号设置必须为布尔值。');
  if(Object.hasOwn(value,'layout')&&!['single','both','four'].includes(value.layout as string))throw new Error('模型组合显示设置无效。');
  if(Object.hasOwn(value,'displayStyle')&&!['paper','wire'].includes(value.displayStyle as string))throw new Error('模型显示样式无效。');
  for(const [key,camera] of Object.entries(value.cameras)){
    if(!keys.includes(key)||!record(camera)||Object.keys(camera).sort().join(',')!=='height,rotation,width,x,y'||!angle(camera.rotation))throw new Error('模型相机设置无效。');
    for(const field of ['x','y','width','height']){
      const n=camera[field];if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e9||((field==='width'||field==='height')&&n<=0))throw new Error('模型相机坐标或尺寸无效。');
    }
  }
}
export function validateModelBoardPlacement(value:unknown):asserts value is ModelBoardPlacement{
  if(!record(value)||Object.keys(value).sort().join(',')!=='height,visible,width,x,y'||typeof value.visible!=='boolean')throw new Error('模型同屏位置设置无效。');
  for(const key of ['x','y','width','height']){
    const n=value[key],size=key==='width'||key==='height';
    if(typeof n!=='number'||!Number.isFinite(n)||n<(size?240:0)||n>(size?2000:100000))throw new Error('模型同屏位置或尺寸超出范围。');
  }
}
export function copyModelView(value:ModelViewState|undefined):ModelViewState{
  if(value===undefined)return defaultModelView();
  validateModelView(value);return structuredClone(value);
}
