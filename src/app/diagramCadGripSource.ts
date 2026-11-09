import type {Point} from '../core/types';
import type {DiagramSymbolKind} from './diagramAnnotations';
import {getCadSymbolBlock,type CadSymbolBlock,type CadSymbolGripDefinition} from './diagramCadSymbols';

export interface DiagramCadGripSource extends Omit<CadSymbolGripDefinition,'point'> {
  point:Point;
  propertyKeys:string[];
  supported:boolean;
  reason?:string;
}

/** Geometry may expose a grip only when the actual original parameter/action
 * has been read reliably. Variant-only application controls are not DWG grips. */
export function diagramCadPropertySupported(block:CadSymbolBlock,key:string):boolean {
  const definition=block.propertyDefinitions.find(property=>property.key===key);
  return !!definition?.editable&&!block.actions.some(action=>action.inputParameterHandle===definition.parameterHandle&&action.verifiedReader!=='ACadSharp'&&Array.isArray(action.suspectFields)&&action.suspectFields.length>0);
}

/** Immutable-source allowlist. Points stay in native CAD coordinates: callers
 * must use the evaluated parameter frame and renderer normalization, never a
 * static metadata transform or a screen-space spacing substitute. */
export function diagramCadGripSources(kind:DiagramSymbolKind):DiagramCadGripSource[]{
  const block=getCadSymbolBlock(kind);if(!block)return [];
  return block.gripDefinitions.map(grip=>{
    const properties=block.propertyDefinitions.filter(property=>property.parameterHandle===grip.parameterHandle&&property.grips?.some(source=>source.handle===grip.handle));
    const missingBaseAction=grip.role==='base'&&!block.actions.some(action=>action.inputParameterHandle===grip.parameterHandle&&action.name==='BaseYDelta');
    const supported=properties.length>0&&!missingBaseAction&&properties.every(property=>diagramCadPropertySupported(block,property.key));
    return {...grip,point:[grip.point[0],grip.point[1]] as Point,propertyKeys:properties.map(property=>property.key),supported,
      ...(!supported?{reason:missingBaseAction?'原基端夹点没有已确认的基端动作，当前只支持末端标量变化。':properties.map(property=>property.description).filter(Boolean).join('；')||'原夹点缺少可验证的属性／动作绑定。'}:{})};
  });
}

/** INSERT's ordinary positioning grip exists even on a block without dynamic grips. */
export function diagramCadInsertBasePoint(kind:DiagramSymbolKind):Point|null {
  const block=getCadSymbolBlock(kind);return block?[block.basePoint[0],block.basePoint[1]]:null;
}
