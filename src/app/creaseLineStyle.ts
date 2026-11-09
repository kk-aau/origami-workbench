import type {Point,Segment} from '../core/types';
import {segmentDisplayColor} from './customColor';
import {adaptiveLineStroke} from './adaptiveLineStyle';
export const LINE_STYLES={WORKBENCH:'工作台默认',COLOR:'彩色实线',BLACK_WHITE:'黑灰实线',COLOR_AND_SHAPE:'彩色区分线型',BLACK_ONE_DOT:'黑色一点划线',BLACK_TWO_DOT:'黑色两点划线'} as const;
export type CreaseLineStyle=keyof typeof LINE_STYLES;
export function isCreaseLineStyle(value:unknown):value is CreaseLineStyle{return typeof value==='string'&&Object.hasOwn(LINE_STYLES,value);}
export const CANVAS_LINE_STYLES={BLACK_WHITE:'明暗（黑灰）',COLOR:'蓝红实线',WORKBENCH:'蓝红虚线',BLACK_ONE_DOT:'黑色虚线'} as const;
export type CanvasLineStyle=keyof typeof CANVAS_LINE_STYLES;
/** Classify the selected canvas choice only. Keep the actual stored style for
 * rendering/previews until the user explicitly chooses a different style. */
export function canvasLineStyleGroup(style:CreaseLineStyle):CanvasLineStyle {
 if(style==='COLOR_AND_SHAPE')return 'WORKBENCH';
 if(style==='BLACK_TWO_DOT')return 'BLACK_ONE_DOT';
 return style;
}
export const AUXILIARY_LINE_STYLES={solid:'实线',dashed:'虚线'} as const;
export type AuxiliaryLineStyle=keyof typeof AUXILIARY_LINE_STYLES;
export function isAuxiliaryLineStyle(value:unknown):value is AuxiliaryLineStyle{return typeof value==='string'&&Object.hasOwn(AUXILIARY_LINE_STYLES,value);}
/** Screen-pixel dash lengths from Oriedita DrawingUtil; auxiliary display never changes its non-folding assignment. */
export function creaseLineStyle(segment:Segment,style:CreaseLineStyle,units:number,auxLineStyle:AuxiliaryLineStyle='solid',solidCreases=false):{color:string;dash:string|undefined}{
 const a=segment.assignment;let color=segmentDisplayColor(segment),dash:number[]=[];
 if(a==='A'){if(auxLineStyle==='dashed')dash=[2,5];}else if(a==='U')dash=[3,2];
 else if(style==='WORKBENCH'){if(a==='M')dash=[10,3,2,3];else if(a==='V')dash=[7,4];}
 else{
  if(['BLACK_ONE_DOT','BLACK_TWO_DOT'].includes(style)&&(a==='M'||a==='V'||a==='B'))color='#000000';
  if(style==='BLACK_WHITE'){if(a==='M'||a==='B')color='#000000';else if(a==='V')color='#a2a2a2';}
  if(['COLOR_AND_SHAPE','BLACK_ONE_DOT','BLACK_TWO_DOT'].includes(style)){
   if(a==='M')dash=style==='BLACK_TWO_DOT'?[10,3,3,3,3,3]:[10,3,3,3];else if(a==='V')dash=[8,8];
  }
 }
 return {color,dash:!solidCreases&&dash.length?dash.map(n=>n*units).join(' '):undefined};
}

/** A CP segment is already the complete source stroke. Junction/snap markers do
 * not split its pattern, and unrelated collinear segments never share phase. */
export function creaseLineStroke(segment:Segment,style:CreaseLineStyle,widthPixels:number,units:number,enabled:boolean,roundedEnds=false,auxLineStyle:AuxiliaryLineStyle='solid',solidCreases=false){
 const base=creaseLineStyle(segment,style,units,auxLineStyle,solidCreases);
 const length=Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]);
 return {color:base.color,...adaptiveLineStroke(length,widthPixels*units,base.dash,{enabled,units,linecap:roundedEnds?'round':'butt'})};
}

export function creaseShortLineTitle(segment:Segment,limited:boolean):string|undefined {
 if(!limited)return undefined;
 const name=segment.assignment==='M'?'峰折（山折）':segment.assignment==='V'?'谷折':undefined;
 return name?`${name} · 线段过短，请放大查看完整线型。`:undefined;
}

/** Only use this with an explicitly identified source segment. Geometric
 * coincidence alone cannot identify a material bank or an authored stroke. */
export function creaseLineSourceSpan(source:Segment,a:Point,b:Point,scale=1){
 const dx=source.b[0]-source.a[0],dy=source.b[1]-source.a[1],length=Math.hypot(dx,dy);
 if(!(length>0)||!Number.isFinite(scale)||scale<=0)return undefined;
 const at=(p:Point)=>((p[0]-source.a[0])*dx+(p[1]-source.a[1])*dy)/(length*length),ta=at(a),tb=at(b),epsilon=Math.max(length,1)*1e-7;
 const onSource=(p:Point,t:number)=>t>=-1e-7&&t<=1+1e-7&&Math.hypot(p[0]-source.a[0]-t*dx,p[1]-source.a[1]-t*dy)<=epsilon;
 if(!onSource(a,ta)||!onSource(b,tb))return undefined;
 return {span:{length:length*scale,offset:Math.max(0,Math.min(ta,tb))*length*scale},reverse:ta>tb};
}
