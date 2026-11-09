import type {DiagramSymbolKind} from './diagramAnnotations';
import {SYMBOL_CATALOG} from './diagramSymbolCatalog';
import {getCadSymbolBlock,cadPropertyDefinitions,cadAttributeDefinitions} from './diagramCadSymbols';

export interface DiagramCadSymbolParameter {
  key:string;label:string;type:'number'|'boolean'|'choice';sourceType:'distance'|'angle'|'flip';
  defaultValue:number;min:number;max:number;step:number;values?:number[];
  editable:boolean;parameterHandle:number;description?:string;unit?:'°';
  origin?:'variant';
}
export interface DiagramCadSymbolAttribute {
  key:string;label:string;tag:string;defaultValue:string;editable?:boolean;
}
export interface DiagramCadSymbolCatalogEntry {
  kind:DiagramSymbolKind;cadName:string;label:string;group:string;
  /** Requested drawing variants reuse the named original block and controls. */
  variantOf?:DiagramSymbolKind;
  parameters:DiagramCadSymbolParameter[];attributes:DiagramCadSymbolAttribute[];
}

/** Adapt verified DWG metadata; requested variants identify their additional
 * drawing controls with origin:'variant' rather than attributing them to DWG.
 * Flip states retain their original numeric 0/1 representation. Numeric choices
 * exist only where the DWG parameter supplies an actual allowed-value list.
 * No original Lookup/Visibility arrowhead selector exists in this source file. */
export function getDiagramCadSymbol(kind:DiagramSymbolKind):DiagramCadSymbolCatalogEntry|undefined {
  const library=SYMBOL_CATALOG.find(entry=>entry.kind===kind),block=getCadSymbolBlock(kind);
  if(!library||!block)return undefined;
  return {
    kind,cadName:library.cadName,label:library.label,group:library.group,...(library.variantOf?{variantOf:library.variantOf}:{}),
    parameters:cadPropertyDefinitions(kind).map(definition=>({
      ...definition,
      sourceType:definition.type,
      type:definition.type==='flip'?'boolean':definition.values?.length?'choice':'number',
      step:definition.type==='flip'?1:definition.type==='angle'?1:.1,
      values:definition.values?[...definition.values]:undefined,
      ...(definition.type==='angle'&&definition.editable?{unit:'°' as const}:{}),
    })),
    attributes:cadAttributeDefinitions(kind).map(attribute=>({...attribute})),
  };
}
