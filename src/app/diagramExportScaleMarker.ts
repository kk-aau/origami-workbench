import {diagramPDFDirectionGlyph,type DiagramPDFDirection} from './diagramPDFDirection';
import {diagramSymbolPreview} from './diagramAnnotationSVG';
import type {DiagramPDFRect} from './diagramPDFLayout';
import type {DiagramStep} from './diagramProject';
import type {DiagramSymbolStyles} from './diagramSymbolStyles';

type ScaleSymbol='zoom'|'zoomOut';
/** Print points, independent of page grid, paper fit or distance to next step. */
export const DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE=16;

/** Place the marker outside the artwork without changing its fitted scale. */
export function diagramExportScaleLayout(rect:DiagramPDFRect){
  const size=DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE,gap=2;
  return {
    artworkRect:{...rect},
    markerRect:{x:rect.x+rect.width+gap,y:rect.y+(rect.height-size)/2,width:size,height:size},
  };
}

/** Prefer the nearest clear height beside the subject. The outer gutter stays
 * available even if hand-placed symbols occupy the full height of that edge. */
export function diagramExportMarkerPosition(panel:DiagramPDFRect,gutter:DiagramPDFRect,subject:DiagramPDFRect|undefined,symbols:readonly DiagramPDFRect[]):DiagramPDFRect {
  const gap=Math.min(2,gutter.width*.16);
  const x=subject?Math.max(panel.x,Math.min(gutter.x,subject.x+subject.width+gap)):gutter.x;
  const top=panel.y,bottom=panel.y+panel.height-gutter.height;
  const center=subject?subject.y+(subject.height-gutter.height)/2:gutter.y;
  const preferred=Math.max(top,Math.min(bottom,center));
  const intervals=symbols.filter(rect=>rect.x<x+gutter.width+gap&&rect.x+rect.width+gap>x)
    .map(rect=>({start:rect.y-gutter.height-gap,end:rect.y+rect.height+gap}))
    .sort((a,b)=>a.start-b.start);
  let y:number|undefined;
  function consider(start:number,end:number){
    if(start>end)return;
    const candidate=Math.max(start,Math.min(end,preferred));
    if(y===undefined||Math.abs(candidate-preferred)<Math.abs(y-preferred))y=candidate;
  }
  let freeStart=top;
  for(const interval of intervals){
    if(interval.end<=freeStart)continue;
    consider(freeStart,Math.min(bottom,interval.start));
    freeStart=interval.end;
    if(freeStart>bottom)break;
  }
  consider(freeStart,bottom);
  return y===undefined?{...gutter,y:preferred}:{...gutter,x,y};
}

export function hasDiagramExportScaleSymbol(step:Pick<DiagramStep,'annotations'>,kind:ScaleSymbol):boolean {
  return !!step.annotations?.some(annotation=>annotation.kind==='symbol'&&annotation.symbol===kind);
}

/** Page and PNG both embed this vector at the same physical size in points. */
export function diagramExportScaleMarkerSVG(kind:ScaleSymbol,box:DiagramPDFRect,styles?:DiagramSymbolStyles,direction?:DiagramPDFDirection):string {
  const label=kind==='zoom'?'视图放大':'视图缩小';
  const size=DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE,x=box.x+(box.width-size)/2,y=box.y+(box.height-size)/2;
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="-50 -50 100 100" data-diagram-scale-marker="${kind}" role="img" aria-label="${label}" color="#293d35"><title>${label}</title><g transform="${direction?diagramPDFDirectionGlyph(kind,direction):''}">${diagramSymbolPreview(kind,styles)}</g></svg>`;
}
