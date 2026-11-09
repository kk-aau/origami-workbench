import {validateModelView,type ModelViewState,type ModelCameraKey} from './modelViewState';

export interface ModelViewPane {
 key:ModelCameraKey;side:'front'|'back';xray:boolean;label:string;
}
/** Oriedita BOTH_2: both directions; TRANSPARENT_3 + PAPER_5: four cameras.
 * These are presentations of one geometry, not additional model instances.
 */
export function modelViewPanes(view:ModelViewState):ModelViewPane[]{
 validateModelView(view);
 if(view.displayStyle==='wire')return (view.layout&&view.layout!=='single'?['front','back'] as const:[view.side]).map(side=>({key:`${side}-solid`,side,xray:false,label:(side==='front'?'正面':'背面')+' · 线框'}));
 const pane=(side:'front'|'back',xray:boolean):ModelViewPane=>({key:`${side}-${xray?'transparent':'solid'}`,side,xray,label:(side==='front'?'正面':'背面')+(xray?' · X 光':' · 实体')});
 switch(view.layout??'single'){
  case 'single':return [pane(view.side,view.xray)];
  case 'both':return [pane('front',view.xray),pane('back',view.xray)];
  case 'four':return [pane('front',false),pane('back',false),pane('front',true),pane('back',true)];
 }
}
