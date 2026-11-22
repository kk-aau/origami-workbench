import type {Point} from '../core/types';
import type {DiagramSymbolAnnotation,DiagramSymbolKind} from './diagramAnnotations';
import {symbolNativeGrips} from './diagramAnnotationSVG';
import {diagramSymbolInitialSize} from './diagramSymbolCatalog';
import {resolveDiagramSymbolGeometry,type DiagramSymbolStyles} from './diagramSymbolStyles';

type SymbolBounds={width:number;height:number};
const paletteReference:SymbolBounds={width:480,height:480};

export function diagramSymbolAnchor(symbol:DiagramSymbolAnnotation):Point {
  const grips=symbolNativeGrips(symbol);
  return grips.find(grip=>grip.id==='center')?.point??grips.find(grip=>grip.id==='base')?.point??symbol.position;
}

/** Calibrate only new placements. Saved symbols are paper-space geometry,
 * shared with SVG/PDF; viewport sizing must never rescale existing arrows. */
export function diagramCanvasSymbols(_artwork:SymbolBounds,_paper:SymbolBounds,fitUnits:number,styles?:DiagramSymbolStyles) {
  const initialSize=(kind:DiagramSymbolKind)=>fitUnits*diagramSymbolInitialSize(kind,paletteReference);
  const scale=(_kind:DiagramSymbolKind)=>1;
  const projected=new WeakMap<DiagramSymbolAnnotation,DiagramSymbolAnnotation>();
  function display(symbol:DiagramSymbolAnnotation):DiagramSymbolAnnotation {
    const cached=projected.get(symbol);
    if(cached)return cached;
    const shown=resolveDiagramSymbolGeometry(symbol,styles);
    projected.set(symbol,shown);
    return shown;
  }
  function paperPoint(_symbol:DiagramSymbolAnnotation,point:Point):Point {
    return [...point];
  }
  return {initialSize,scale,display,paperPoint};
}

/** Edit the shape on screen while keeping untouched project defaults inherited. */
export function editDiagramSymbolGeometry(symbol:DiagramSymbolAnnotation,styles:DiagramSymbolStyles|undefined,edit:(shown:DiagramSymbolAnnotation)=>DiagramSymbolAnnotation):DiagramSymbolAnnotation {
  const shown=resolveDiagramSymbolGeometry(symbol,styles);
  const result=edit(shown);
  if(shown===symbol)return result;
  const next={...result};
  for(const field of ['params','cadProperties'] as const){
    const authored=symbol[field],displayed=shown[field],changed=result[field];
    if(!changed||!displayed||displayed===authored)continue;
    const overrides={...changed};
    for(const [key,value] of Object.entries(displayed)){
      if(!Object.hasOwn(authored??{},key)&&changed[key as keyof typeof changed]===value)delete overrides[key as keyof typeof overrides];
    }
    if(authored||Object.keys(overrides).length)next[field]=overrides;
    else delete next[field];
  }
  return next;
}
