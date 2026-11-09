import sourceData from './diagramCadSymbols.data.json';
import type {DiagramSymbolKind} from './diagramAnnotations';

export interface CadSymbolPropertyDefinition {
  key:string;label:string;type:'distance'|'angle'|'flip';defaultValue:number;min:number;max:number;
  values?:readonly number[];editable:boolean;parameterHandle:number;description?:string;grips?:readonly CadSymbolGripDefinition[];sourceMinimum?:number;
  /** Application drawing-variant fields are explicitly distinct from DWG properties. */
  origin?:'variant';
}
export interface CadSymbolGripDefinition {id:string;handle:number;parameterHandle:number;kind:string;role:'base'|'end'|'flip'|'rotation';point:number[]}
export interface CadSymbolAttributeDefinition {key:string;label:string;tag:string;defaultValue:string;editable:boolean}
/** Original source fields are retained for the geometry interpreter; handles are stable numeric IDs. */
export interface CadSymbolEntity {entity:string;handle:number;[field:string]:unknown}
export interface CadSymbolParameter {object:string;handle:number;name:string;def_basept?:number[];def_endpt?:number[];[field:string]:unknown}
export interface CadSymbolAction {
  object:string;handle:number;name:string;inputParameterHandle:number|null;boundEntityHandles:number[];
  vertexBindings:{entityHandle:number;indexes:number[]}[];[field:string]:unknown;
}
export interface CadSymbolBlock {
  handle:number;cadName:string;basePoint:number[];entities:CadSymbolEntity[];parameters:CadSymbolParameter[];actions:CadSymbolAction[];
  propertyDefinitions:CadSymbolPropertyDefinition[];attributeDefinitions:CadSymbolAttributeDefinition[];warnings:string[];
  grips:{object:string;handle:number;nodeId:number;[field:string]:unknown}[];gripDefinitions:CadSymbolGripDefinition[];
  normalization:{nativeBounds:{x:number;y:number;width:number;height:number};uniformScale:number;nativeCenter:number[];
    svgYDownMatrix:number[];baseline:{parameterHandle:number;start:number[];end:number[]}|null;basis:string};
}
export interface CadSymbolSourceData {source:Record<string,unknown>;kindToBlock:Record<DiagramSymbolKind,number>;blocks:CadSymbolBlock[]}
function freeze<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)) {
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}
const data=freeze(sourceData as unknown as CadSymbolSourceData);
export const CAD_SYMBOL_SOURCE=data.source;
export const CAD_SYMBOL_BLOCKS:Readonly<Record<number,CadSymbolBlock>>=Object.freeze(Object.fromEntries(data.blocks.map(block=>[block.handle,block])));
export function getCadBlockByHandle(handle:number):CadSymbolBlock|undefined {return CAD_SYMBOL_BLOCKS[handle];}
export function getCadSymbolBlock(kind:DiagramSymbolKind):CadSymbolBlock|undefined {return getCadBlockByHandle(data.kindToBlock[kind==='swivelDouble'?'swivel':kind==='rotateCCW'?'rotate':kind]);}
const doubleStepFoldProperties=freeze<CadSymbolPropertyDefinition[]>([
  ...getCadSymbolBlock('swivel')!.propertyDefinitions,
  {key:'箭头间距',label:'箭头间距',type:'distance',defaultValue:48,min:0,max:1_000_000,editable:true,parameterHandle:-1,origin:'variant',description:'双向段折绘图变体的两箭头横向间距，使用局部图形单位；非原 DWG 动态属性。'},
  {key:'上下错位',label:'上下错位',type:'distance',defaultValue:6,min:-1_000_000,max:1_000_000,editable:true,parameterHandle:-2,origin:'variant',description:'双向段折绘图变体的两箭头沿箭身方向错位，正值让右箭头更靠前；非原 DWG 动态属性。'},
]);
export function cadPropertyDefinitions(kind:DiagramSymbolKind):readonly CadSymbolPropertyDefinition[] {return kind==='swivelDouble'?doubleStepFoldProperties:getCadSymbolBlock(kind)?.propertyDefinitions??[];}
export function cadAttributeDefinitions(kind:DiagramSymbolKind):readonly CadSymbolAttributeDefinition[] {return getCadSymbolBlock(kind)?.attributeDefinitions??[];}
