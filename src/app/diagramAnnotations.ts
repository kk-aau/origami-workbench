import type {Point} from '../core/types';
import {validateDiagramPaperBinding,type DiagramPaperBinding} from './diagramPaperBindingTypes';
import {cadPropertyDefinitions,cadAttributeDefinitions} from './diagramCadSymbols';
import {validateDiagramZoomArea,type DiagramZoomArea} from './diagramStepZoom';

/** Step illustration objects use millimetres; they never modify the source CP. */
export type DiagramLineStyle='valley'|'mountain'|'crease'|'auxiliary'|'boundary';
/** Paint is independent of mountain/valley semantics. Missing on legacy files
 * uses the traditional pattern associated with that line's style. */
export type DiagramStrokePattern='solid'|'dashed'|'dash-dot'|'dotted';
export type DiagramLineAppearanceField='color'|'width'|'strokePattern';
export const DIAGRAM_LINE_APPEARANCE_FIELDS:readonly DiagramLineAppearanceField[]=['color','width','strokePattern'];
export function isDiagramLineAppearanceFields(value:unknown):value is DiagramLineAppearanceField[] {
  return Array.isArray(value)&&value.length<=DIAGRAM_LINE_APPEARANCE_FIELDS.length&&new Set(value).size===value.length&&
    Array.from(value).every(field=>DIAGRAM_LINE_APPEARANCE_FIELDS.includes(field as DiagramLineAppearanceField));
}
export const DIAGRAM_STROKE_PATTERNS:readonly DiagramStrokePattern[]=['solid','dashed','dash-dot','dotted'];
export function isDiagramStrokePattern(value:unknown):value is DiagramStrokePattern {
  return typeof value==='string'&&DIAGRAM_STROKE_PATTERNS.includes(value as DiagramStrokePattern);
}
export type DiagramSymbolKind=
  |'fold'|'unfold'|'flip'|'rotate'|'rotateCCW'|'repeat'|'zoom'
  |'paperFront'|'paperBack'|'referencePoint'|'equalLength'|'equalAngle'|'rightAngle'
  |'foldSmall'|'swivel'|'swivelDouble'|'mountainFold'|'unfoldDouble'|'sink'|'angleMarker'|'open'|'pull'
  |'zoomOut'|'return'|'repeatSmall'|'hold'|'flapFront'|'flapBack'|'star'|'view'|'cut'|'blow'
  |'equalDivision'|'filledReferencePoint'|'repeatMark'|'tearWindow';
export const DIAGRAM_SYMBOL_KINDS:readonly DiagramSymbolKind[]=[
  'fold','unfold','flip','rotate','rotateCCW','repeat','zoom','paperFront','paperBack','referencePoint','equalLength','equalAngle','rightAngle',
  'foldSmall','swivel','swivelDouble','mountainFold','unfoldDouble','sink','angleMarker','open','pull','zoomOut','return','repeatSmall','hold',
  'flapFront','flapBack','star','view','cut','blow',
  'equalDivision','filledReferencePoint','repeatMark','tearWindow',
];
export function isDiagramSymbolKind(value:unknown):value is DiagramSymbolKind {
  return typeof value==='string'&&DIAGRAM_SYMBOL_KINDS.includes(value as DiagramSymbolKind);
}
export interface DiagramSymbolParams {
  length:number;height:number;curve:number;headLength:number;headWidth:number;radius:number;gap:number;count:number;markSize:number;
}
export interface DiagramLineAnnotation {
  id:string;kind:'line';a:Point;b:Point;style:DiagramLineStyle;color:string;width:number;
  strokePattern?:DiagramStrokePattern;
  /** Explicit per-line exceptions to the global category appearance. Missing
   * legacy fields follow their saved paint until that category is customized. */
  appearanceOverrides?:DiagramLineAppearanceField[];
  /** Precreasing records a physical F/0° crease without retaining the fold.
   * Missing on legacy M/V drawings means a retained fold. */
  foldAction?:'fold'|'precrease';
  /** Target magnitude in degrees. Legacy drawings retain the 180° default. */
  foldAngle?:number|null;
  /** Original source-paper faces affected by this linked crease, independent
   * of the current tool's default layer range. An empty array explicitly
   * suspends CP participation; missing on ordinary drawings. */
  foldFaces?:number[];
  /** Start this line's complete fold (including a precrease return) when the
   * referenced line reaches this fraction of its complete action. */
  animationTiming?:DiagramLineAnimationTiming;
  /** Material spans retain editable CP ink through a camera projection that
   * temporarily collapses a line to a point. Never used to modify CP geometry. */
  cameraSource?:DiagramLineCameraSource;
}
export interface DiagramLineAnimationTiming {afterLineId:string;startAfter:number}
export interface DiagramLineCameraSource {
  stateId:string;revision:number;
  spans:{face:number;a:Point;b:Point;assignment:'M'|'V'|'F'|'U'}[];
  shownA:Point;shownB:Point;shownStyle:DiagramLineStyle;
}
export interface DiagramSymbolAnnotation {
  id:string;kind:'symbol';symbol:DiagramSymbolKind;position:Point;size:number;rotation:number;color:string;width:number;
  /** Components in the symbol's local coordinate system; missing values use the catalogue defaults. */
  params?:Partial<DiagramSymbolParams>;
  mirrored?:boolean;
  /** Optional quadratic Bezier control point in the symbol's local coordinate system. */
  curveControl?:Point;
  /** Optional editable label for the catalogue's numbered or lettered symbols. */
  text?:string;
  /** Stable earlier-step identity. Missing legacy values remain illustration
   * labels only; visible text and component counts never select a target. */
  returnStepId?:string;
  /** Magnitude of a clockwise/counterclockwise view instruction in degrees.
   * Missing legacy values mean 45°; rotation remains glyph placement only. */
  turnAngle?:number;
  /** Presentation crop applied from the next step until a zoom-out symbol. */
  zoomArea?:DiagramZoomArea;
  /** Presence selects the original CAD component structure; absence preserves legacy drawings. */
  cadProperties?:Record<string,number>;
  /** Original ATTDEF handles identify independently editable labels. */
  cadAttributes?:Record<string,string>;
  /** A presentation-only cutaway hides these original paper faces inside
   * this tear window; no face is cut, renumbered or globally hidden. */
  cutawayFaces?:number[];
  /** Optional material attachment; ordinary arrows remain freely positioned. */
  paperBinding?:DiagramPaperBinding;
}
export type DiagramAnnotation=DiagramLineAnnotation|DiagramSymbolAnnotation;
export const isDiagramCPExistingLine=(a:DiagramAnnotation):a is DiagramLineAnnotation&{id:`cp-existing:${string}`}=>a.kind==='line'&&a.id.startsWith('cp-existing:');
export const isDiagramCPLine=(a:DiagramAnnotation):a is DiagramLineAnnotation&{id:`cp-link:${string}`|`cp-existing:${string}`}=>a.kind==='line'&&(a.id.startsWith('cp-link:')||isDiagramCPExistingLine(a));
export const DIAGRAM_ANNOTATION_LIMITS={coordinate:1_000_000,controlCoordinate:1000,size:1_000_000,width:1000,minimumSize:1e-6,minimumWidth:1e-6,rotation:360_000} as const;

function record(value:unknown,fields:string[],optional:string[]=[]):value is Record<string,unknown> {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&
    fields.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>fields.includes(key)||optional.includes(key));
}
function finite(value:unknown,min:number,max:number):value is number {
  return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
}
function point(value:unknown):value is Point {
  return Array.isArray(value)&&value.length===2&&value.every(n=>finite(n,-DIAGRAM_ANNOTATION_LIMITS.coordinate,DIAGRAM_ANNOTATION_LIMITS.coordinate));
}
function positive(value:unknown,min:number,max:number):value is number {
  return finite(value,min,max);
}

export const DIAGRAM_SYMBOL_PARAM_LIMITS:Readonly<Record<keyof DiagramSymbolParams,readonly [number,number]>>={
  length:[10,240],height:[5,200],curve:[-150,150],headLength:[2,50],headWidth:[2,50],radius:[3,100],gap:[0,80],count:[1,12],markSize:[1,60],
};
export function validateDiagramSymbolParams(value:unknown):asserts value is Partial<DiagramSymbolParams> {
  if(!record(value,[],Object.keys(DIAGRAM_SYMBOL_PARAM_LIMITS)))throw new Error('折纸符号组件参数字段无效或版本不支持。');
  for(const key of Object.keys(value) as (keyof DiagramSymbolParams)[]) {
    const [min,max]=DIAGRAM_SYMBOL_PARAM_LIMITS[key],n=value[key];
    if(!finite(n,min,max)||key==='count'&&!Number.isInteger(n))throw new Error('折纸符号组件参数无效或超出范围。');
  }
}
function plainRecord(value:unknown,keys:string[]):value is Record<string,unknown> {
  return record(value,[],keys)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
}
export function validateDiagramCadProperties(kind:DiagramSymbolKind,value:unknown):asserts value is Record<string,number> {
  const definitions=cadPropertyDefinitions(kind),supported=definitions.filter(definition=>definition.editable);
  if(!plainRecord(value,supported.map(definition=>definition.key)))throw new Error('原 CAD 符号属性字段无效、不受支持或版本不匹配。');
  for(const [key,n] of Object.entries(value)) {
    const definition=supported.find(definition=>definition.key===key)!;
    if(!finite(n,definition.min,definition.max)||definition.values&&!definition.values.includes(n))throw new Error(`原 CAD 符号属性「${key}」无效或超出允许范围。`);
  }
}
export function validateDiagramCadAttributes(kind:DiagramSymbolKind,value:unknown):asserts value is Record<string,string> {
  const keys=cadAttributeDefinitions(kind).filter(definition=>definition.editable).map(definition=>definition.key);
  if(!plainRecord(value,keys))throw new Error('原 CAD 符号文字字段无效或版本不匹配。');
  for(const text of Object.values(value)) {
    if(typeof text!=='string'||[...text].length>200||/[\u0000-\u001f\u007f-\u009f]/.test(text))throw new Error('原 CAD 符号文字必须为不含控制字符且不超过 200 字的文本。');
  }
}

/** Strictly validate imported or newly drawn illustration objects before committing. */
export function validateDiagramAnnotations(value:unknown):asserts value is DiagramAnnotation[] {
  if(!Array.isArray(value))throw new Error('步骤折线与符号必须为数组。');
  const ids=new Set<string>();
  for(const annotation of value) {
    const kind=annotation&&typeof annotation==='object'?(annotation as Record<string,unknown>).kind:undefined;
    const fields=kind==='line'?['id','kind','a','b','style','color','width']:
      kind==='symbol'?['id','kind','symbol','position','size','rotation','color','width']:null;
    if(!fields||!record(annotation,fields,kind==='symbol'?['params','mirrored','text','returnStepId','turnAngle','zoomArea','curveControl','cadProperties','cadAttributes','cutawayFaces','paperBinding']:['foldFaces','foldAction','foldAngle','strokePattern','animationTiming','appearanceOverrides','cameraSource']))throw new Error('步骤折线或符号字段不完整或版本不支持。');
    if(typeof annotation.id!=='string'||!annotation.id.trim()||annotation.id.length>256||/[\u0000-\u001f\u007f]/.test(annotation.id)||ids.has(annotation.id))throw new Error('步骤折线或符号编号无效或重复。');
    ids.add(annotation.id);
    if(typeof annotation.color!=='string'||!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(annotation.color))throw new Error('步骤折线或符号颜色必须为十六进制颜色。');
    if(!positive(annotation.width,DIAGRAM_ANNOTATION_LIMITS.minimumWidth,DIAGRAM_ANNOTATION_LIMITS.width))throw new Error('步骤折线或符号线宽无效或超出范围。');
    if(kind==='line') {
      if(!point(annotation.a)||!point(annotation.b))throw new Error('步骤折线端点无效或超出范围。');
      if(!['valley','mountain','crease','auxiliary','boundary'].includes(annotation.style as string))throw new Error('步骤折线样式无效。');
      if(Object.hasOwn(annotation,'strokePattern')&&!isDiagramStrokePattern(annotation.strokePattern))throw new Error('绘图线型必须为实线、虚线、点划线或点线。');
      if(Object.hasOwn(annotation,'appearanceOverrides')&&!isDiagramLineAppearanceFields(annotation.appearanceOverrides))throw new Error('单线外观覆盖必须为颜色、粗细或线型组成的不重复字段列表。');
      if(Object.hasOwn(annotation,'foldAction')&&(!['fold','precrease'].includes(annotation.foldAction as string)||!['valley','mountain'].includes(annotation.style as string)))throw new Error('折线用途仅支持谷折或峰折的本步折叠、预折后展开。');
      if(Object.hasOwn(annotation,'foldAngle')&&(annotation.foldAngle!==null&&!finite(annotation.foldAngle,0,180)||!['valley','mountain'].includes(annotation.style as string)))throw new Error('折叠角度须为 0 到 180 度，仅适用于谷折或峰折。');
      if(Object.hasOwn(annotation,'animationTiming')){
        const timing=annotation.animationTiming;
        if(!record(timing,['afterLineId','startAfter'])||typeof timing.afterLineId!=='string'||!timing.afterLineId.trim()||timing.afterLineId.length>256||/[\u0000-\u001f\u007f]/.test(timing.afterLineId)||timing.afterLineId===annotation.id||!finite(timing.startAfter,0,1))throw new Error('折痕启动条件必须引用另一条折痕，完成比例为 0% 到 100%。');
      }
      if(Object.hasOwn(annotation,'cameraSource')){
        const source=annotation.cameraSource;
        if(!record(source,['stateId','revision','spans','shownA','shownB','shownStyle'],[])||typeof source.stateId!=='string'||!source.stateId.trim()||source.stateId.length>256||!Number.isSafeInteger(source.revision)||Number(source.revision)<0||!point(source.shownA)||!point(source.shownB)||!['valley','mountain','crease','auxiliary','boundary'].includes(source.shownStyle as string)||!Array.isArray(source.spans)||!source.spans.length)throw Error('折线的视角材料绑定无效。');
        for(const span of source.spans)if(!record(span,['face','a','b','assignment'],[])||!Number.isSafeInteger(span.face)||Number(span.face)<0||!point(span.a)||!point(span.b)||!['M','V','F','U'].includes(span.assignment as string)||span.a[0]===span.b[0]&&span.a[1]===span.b[1])throw Error('折线的视角材料范围无效。');
      }
      if(annotation.a[0]===annotation.b[0]&&annotation.a[1]===annotation.b[1])throw new Error('步骤折线的两个端点不能重合。');
      if(Object.hasOwn(annotation,'foldFaces')&&(!Array.isArray(annotation.foldFaces)||
          new Set(annotation.foldFaces).size!==annotation.foldFaces.length||annotation.foldFaces.some(face=>typeof face!=='number'||!Number.isSafeInteger(face)||face<0)))throw new Error('联动折线的来源纸面必须为 不重复的非负安全整数。');
    } else {
      if(!isDiagramSymbolKind(annotation.symbol))throw new Error('折纸符号类型无效。');
      if(Object.hasOwn(annotation,'returnStepId')&&(annotation.symbol!=='return'||typeof annotation.returnStepId!=='string'||!annotation.returnStepId.trim()||annotation.returnStepId.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(annotation.returnStepId)))throw new Error('返回步骤目标仅适用于返回符号，且必须为有效的步骤编号。');
      if(Object.hasOwn(annotation,'paperBinding'))validateDiagramPaperBinding(annotation.paperBinding);
      if(Object.hasOwn(annotation,'zoomArea')){
        if(annotation.symbol!=='zoom')throw new Error('局部放大区域仅适用于放大符号。');
        validateDiagramZoomArea(annotation.zoomArea);
      }
      if(Object.hasOwn(annotation,'cutawayFaces')&&(annotation.symbol!=='tearWindow'||!Array.isArray(annotation.cutawayFaces)||new Set(annotation.cutawayFaces).size!==annotation.cutawayFaces.length||Array.from(annotation.cutawayFaces).some(face=>!Number.isSafeInteger(face)||face<0)))throw new Error('撕纸透视的隐藏纸层必须为 不重复的非负安全整数原纸面编号。');
      if(annotation.symbol==='tearWindow'&&(Object.hasOwn(annotation,'cadProperties')||Object.hasOwn(annotation,'cadAttributes')))throw new Error('撕纸透视使用原生绘制，不支持原 CAD 属性。');
      if(!point(annotation.position)||!positive(annotation.size,DIAGRAM_ANNOTATION_LIMITS.minimumSize,DIAGRAM_ANNOTATION_LIMITS.size)||
          !finite(annotation.rotation,-DIAGRAM_ANNOTATION_LIMITS.rotation,DIAGRAM_ANNOTATION_LIMITS.rotation))throw new Error('折纸符号位置、尺寸或旋转角度无效或超出范围。');
      if(Object.hasOwn(annotation,'params'))validateDiagramSymbolParams(annotation.params);
      if(Object.hasOwn(annotation,'cadProperties'))validateDiagramCadProperties(annotation.symbol,annotation.cadProperties);
      if(Object.hasOwn(annotation,'cadAttributes'))validateDiagramCadAttributes(annotation.symbol,annotation.cadAttributes);
      if(Object.hasOwn(annotation,'mirrored')&&typeof annotation.mirrored!=='boolean')throw new Error('折纸符号镜像设置必须为布尔值。');
      if(Object.hasOwn(annotation,'turnAngle')&&(!['rotate','rotateCCW'].includes(annotation.symbol)||!finite(annotation.turnAngle,0,360)))throw new Error('旋转动作角度仅适用于旋转符号，且必须为 0 到 360 度之间的有限数字。');
      if(Object.hasOwn(annotation,'curveControl')&&(!Array.isArray(annotation.curveControl)||annotation.curveControl.length!==2||
          !annotation.curveControl.every(n=>finite(n,-DIAGRAM_ANNOTATION_LIMITS.controlCoordinate,DIAGRAM_ANNOTATION_LIMITS.controlCoordinate))))throw new Error('折纸符号弧线控制点无效或超出局部坐标范围。');
      if(Object.hasOwn(annotation,'text')&&(typeof annotation.text!=='string'||[...annotation.text].length>200||/[\u0000-\u001f\u007f-\u009f]/.test(annotation.text)))throw new Error('折纸符号文字必须为不含控制字符且不超过 200 字的文本。');
    }
  }
}
