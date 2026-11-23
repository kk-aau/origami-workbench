import {DIAGRAM_ANNOTATION_LIMITS,isDiagramSymbolKind,validateDiagramCadProperties,validateDiagramSymbolParams,type DiagramSymbolAnnotation,type DiagramSymbolKind,type DiagramSymbolParams} from './diagramAnnotations';
import {getCadSymbolBlock} from './diagramCadSymbols';
import {getDiagramCadSymbol} from './diagramCadSymbolCatalog';
import {diagramCadPropertySupported} from './diagramCadGripSource';
import {SYMBOL_CATALOG} from './diagramSymbolCatalog';
import {isDiagramRotationSymbol} from './diagramSymbolRotation';

export type DiagramSymbolFill='outline'|'solid';
export interface DiagramSymbolStyle {color?:string;width?:number;fill?:DiagramSymbolFill;adaptive?:boolean;cadProperties?:Record<string,number>;params?:Partial<DiagramSymbolParams>;calloutConnectors?:boolean}
/** Missing fields keep the authored drawing and original CAD fill. */
export type DiagramSymbolStyleKind=DiagramSymbolKind|'paperCallout'|'cpCallout';
export type DiagramSymbolStyles=Partial<Record<DiagramSymbolStyleKind,DiagramSymbolStyle>>;
export const DEFAULT_DIAGRAM_SYMBOL_PEN={color:'#293d35',width:.7};
const fillable=new Set<DiagramSymbolStyleKind>(['referencePoint','filledReferencePoint','angleMarker','equalAngle','star','paperFront','paperBack','fold','foldSmall','mountainFold','unfold','unfoldDouble','swivel','swivelDouble','rotate','rotateCCW','flip','repeatSmall','hold','zoom','zoomOut','sink','open','pull']);
export const supportsDiagramSymbolFill=(kind:DiagramSymbolStyleKind)=>fillable.has(kind);
export const isDiagramSymbolStyleKind=(kind:unknown):kind is DiagramSymbolStyleKind=>isDiagramSymbolKind(kind)||kind==='paperCallout'||kind==='cpCallout';

export interface DiagramSymbolGeometryField {
  group:'cadProperties'|'params';key:string;label:string;type:'number'|'boolean'|'choice';
  min:number;max:number;step:number;defaultValue:number;values?:readonly number[];unit?:'°';description?:string;
}
export function diagramSymbolGeometryFields(kind:DiagramSymbolStyleKind,mode?:'cad'|'legacy'):DiagramSymbolGeometryField[] {
  if(!isDiagramSymbolKind(kind))return [];
  const block=getCadSymbolBlock(kind);
  if(mode==='legacy'||!mode&&!block){
    return (SYMBOL_CATALOG.find(item=>item.kind===kind)?.parameters??[]).map(field=>({...field,group:'params',type:'number'}));
  }
  if(!block)return [];
  const fields=(getDiagramCadSymbol(kind)?.parameters??[]).filter(field=>
    field.editable&&(field.origin==='variant'||diagramCadPropertySupported(block,field.key))&&
    !(isDiagramRotationSymbol(kind)&&field.sourceType==='flip')
  );
  const operationName=(field:typeof fields[number])=>{
    if(field.origin==='variant')return field.label;
    if(kind==='fold'&&field.key==='距离1')return '箭身缩放';
    if(kind==='fold'&&field.key==='距离2')return '箭尖拉伸';
    const actions=block.actions.filter(action=>action.inputParameterHandle===field.parameterHandle);
    if(field.sourceType==='flip')return '镜像';
    if(field.sourceType==='angle')return '方向角';
    if(actions.every(action=>action.object==='BLOCKSCALEACTION')&&actions.length)return '组件缩放';
    if(actions.every(action=>action.object==='BLOCKSTRETCHACTION')&&actions.length)return '组件拉伸';
    if(actions.every(action=>action.object==='BLOCKMOVEACTION')&&actions.length)return '组件位移';
    return field.label;
  };
  const names=fields.map(operationName);
  return fields.map((field,index)=>{
    const name=names[index],duplicate=names.indexOf(name)!==names.lastIndexOf(name);
    const label=duplicate?`${name} ${names.slice(0,index+1).filter(item=>item===name).length}`:name;
    return {...field,label,group:'cadProperties',description:field.description??(field.origin==='variant'?undefined:`原 CAD 参数：${field.key}`)};
  });
}

/** Read geometry without promoting a legacy annotation to the CAD backend or
 * persisting inherited values as individual edits. */
export function resolveDiagramSymbolGeometry(annotation:DiagramSymbolAnnotation,styles?:DiagramSymbolStyles):DiagramSymbolAnnotation {
  const style=styles?.[annotation.symbol];
  if(!style||!style.params&&!style.cadProperties)return annotation;
  const usesCad=annotation.symbol!=='tearWindow'&&(annotation.cadProperties!==undefined||SYMBOL_CATALOG.find(item=>item.kind===annotation.symbol)?.sourceOnly);
  if(usesCad&&style.cadProperties&&Object.keys(style.cadProperties).some(key=>!Object.hasOwn(annotation.cadProperties??{},key)))return {...annotation,cadProperties:{...style.cadProperties,...annotation.cadProperties}};
  if(!usesCad&&style.params&&Object.keys(style.params).some(key=>!Object.hasOwn(annotation.params??{},key)))return {...annotation,params:{...style.params,...annotation.params}};
  return annotation;
}

export function validateDiagramSymbolStyles(value:unknown):asserts value is DiagramSymbolStyles {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('符号样式无效。');
  for(const [kind,style] of Object.entries(value)){
    if(!isDiagramSymbolStyleKind(kind)||!style||typeof style!=='object'||Array.isArray(style)||Object.keys(style).some(key=>!['color','width','fill','adaptive','cadProperties','params','calloutConnectors'].includes(key)))throw new Error('符号样式包含未知类别或字段。');
    if('color' in style&&(typeof style.color!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(style.color)))throw new Error('符号颜色必须为十六进制颜色。');
    if('width' in style&&(!Number.isFinite(style.width)||style.width<DIAGRAM_ANNOTATION_LIMITS.minimumWidth||style.width>DIAGRAM_ANNOTATION_LIMITS.width))throw new Error('符号线宽超出范围。');
    if('fill' in style&&(!supportsDiagramSymbolFill(kind)||!['outline','solid'].includes(style.fill)))throw new Error('符号不支持该填充样式。');
    if('adaptive' in style&&typeof style.adaptive!=='boolean')throw new Error('符号自适应线宽设置无效。');
    if('calloutConnectors' in style&&(!['paperCallout','cpCallout'].includes(kind)||typeof style.calloutConnectors!=='boolean'))throw new Error('放大框引线设置无效。');
    for(const group of ['cadProperties','params'] as const){
      if(!(group in style))continue;
      if(!isDiagramSymbolKind(kind))throw new Error('放大框不支持普通符号组件参数。');
      const values=style[group];
      if(group==='params')validateDiagramSymbolParams(values);
      else validateDiagramCadProperties(kind,values);
      const fields=diagramSymbolGeometryFields(kind,group==='params'?'legacy':'cad');
      if(!fields.length||Object.entries(values).some(([key,value])=>{
        const field=fields.find(item=>item.key===key);return !field||typeof value!=='number'||value<field.min||value>field.max;
      }))throw new Error('当前符号不支持该几何属性或数值超出范围。');
    }
  }
}

type SavedSymbolPen=Pick<DiagramSymbolAnnotation,'symbol'|'color'|'width'|'appearanceOverrides'>;
type PenField='color'|'width';
function symbolPenOverrides(symbol:SavedSymbolPen):PenField[] {
  if(symbol.appearanceOverrides)return symbol.appearanceOverrides;
  // Old files did not record which fields had been edited. Their non-default
  // values may have been hand-set and must survive adding a project style.
  const fields:PenField[]=[];
  if(symbol.color.toLowerCase()!==DEFAULT_DIAGRAM_SYMBOL_PEN.color)fields.push('color');
  if(symbol.width!==DEFAULT_DIAGRAM_SYMBOL_PEN.width)fields.push('width');
  return fields;
}

export function resolveDiagramSymbolStyle(symbol:SavedSymbolPen,styles?:DiagramSymbolStyles):{color:string;width:number;fill?:DiagramSymbolFill;adaptive:boolean} {
  const style=styles?.[symbol.symbol];
  if(!style)return {color:symbol.color,width:symbol.width,adaptive:true};
  const overrides=symbolPenOverrides(symbol);
  return {
    color:overrides.includes('color')?symbol.color:style.color??symbol.color,
    width:overrides.includes('width')?symbol.width:style.width??symbol.width,
    fill:style.fill,adaptive:true,
  };
}

export function overrideDiagramSymbolStyle<T extends SavedSymbolPen>(symbol:T,patch:Pick<DiagramSymbolStyle,'color'|'width'>):T {
  validateDiagramSymbolStyles({[symbol.symbol]:patch});
  const fields=new Set(symbolPenOverrides(symbol));
  if(patch.color!==undefined)fields.add('color');
  if(patch.width!==undefined)fields.add('width');
  return {...symbol,...patch,appearanceOverrides:[...fields]};
}
