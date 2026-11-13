import {creasePaintOrder} from './creasePaintOrder';
import {validateDoc,type Doc} from '../core/types';
import {getDrawingBounds,getPaperBounds,getGridReferenceBounds,paperPath,paperFillRule,type Bounds} from './paper';
import {objectsSVG} from './drawingObjects';
import {DISPLAY_PIXEL_MM,validateCreaseDisplay,type CreaseDisplay} from './creaseDisplay';
import {creaseLineStroke,creaseShortLineTitle} from './creaseLineStyle';
import {readAdaptiveLineStyle} from './adaptiveLineStyle';
import {creaseVerticesSVG} from './creaseVertices';
import {defaultDisplayLayers,validateDisplayLayers,type DisplayLayers} from './displayLayers';
import {paperGridGeometry,diagonalGridFamilies,triangularGridTile,validateDiagonalGridAngle,validateGridRotation,type GridPattern} from './gridGeometry';
import {GRID_MIN,GRID_MAX} from './gridControls';
import {defaultGridAppearance,validateGridAppearance,type GridAppearance} from './gridAppearance';
/** SVG world units are millimetres; preferences use CSS screen pixels (96 dpi). */
export {DISPLAY_PIXEL_MM} from './creaseDisplay';
export interface CreasePatternStrokeOptions {enabled?:boolean;units?:number;solidCreases?:boolean;hideExistingCreases?:boolean}
export interface CreasePatternGridOptions {divisions:number;pattern?:GridPattern;rotation?:number;diagonal?:boolean;diagonalAngle?:number;scope?:'paper'|'canvas';appearance?:GridAppearance}
function gridSVG(doc:Doc,bounds:Bounds,outline:string,units:number,options?:CreasePatternGridOptions):string{
 if(!options)return '';
 if(!Number.isInteger(options.divisions)||options.divisions<GRID_MIN||options.divisions>GRID_MAX)throw new Error(`导出网格等分须为 ${GRID_MIN}—${GRID_MAX} 的整数。`);
 if(options.diagonal!==undefined&&typeof options.diagonal!=='boolean'||options.scope!==undefined&&options.scope!=='paper'&&options.scope!=='canvas'||options.pattern!==undefined&&options.pattern!=='square'&&options.pattern!=='triangular')throw new Error('导出网格设置无效。');
 const appearance=validateGridAppearance(options.appearance??defaultGridAppearance());
 if(options.pattern!=='triangular'&&options.diagonalAngle!==undefined)validateDiagonalGridAngle(options.diagonalAngle);
 if(options.rotation!==undefined)validateGridRotation(options.rotation);
 const fixedReference=options.pattern!==undefined,reference=fixedReference?getGridReferenceBounds(doc):getPaperBounds(doc);
 const lattice=paperGridGeometry(reference,options.divisions,{pattern:options.pattern,rotation:options.rotation}),{origin:[x,y],stepX,stepY}=lattice,id='cp-export-grid';
 const transform=`translate(${x} ${y})${lattice.rotation?` rotate(${lattice.rotation})`:''}`;
 const scope=options.scope==='canvas'||!outline&&!fixedReference?'canvas':'paper';
 // During boundary editing the fixed reference clips only the grid. It never
 // fabricates a valid paper outline or changes the exported drawing bounds.
 const area=scope==='paper'?outline?`<path d="${outline}" fill="url(#${id})" fill-rule="${paperFillRule(doc)}"/>`:`<rect data-grid-reference-fallback="true" x="${reference.x}" y="${reference.y}" width="${reference.width}" height="${reference.height}" fill="url(#${id})"/>`:`<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="url(#${id})"/>`;
 if(options.pattern==='triangular'){
  const tile=triangularGridTile(lattice);
  return `<g data-export-grid="${scope}" data-grid-pattern="triangular" pointer-events="none"><defs><pattern id="${id}" width="${tile.width}" height="${tile.height}" patternUnits="userSpaceOnUse" patternTransform="translate(${x} ${y})"><path d="${tile.path}" fill="none" stroke="${appearance.gridColor}" stroke-width="${appearance.lineWidth*units}"/></pattern></defs>${area}</g>`;
 }
 // A pattern keeps cropped/distant exports aligned to the original paper,
 // without enumerating millions of lines outside a small drawing's bounds.
 // Adjacent tiles each contribute half of their clipped edge stroke.
 const pattern=`<defs><pattern id="${id}" width="${stepX}" height="${stepY}" patternUnits="userSpaceOnUse" patternTransform="${transform}"><path d="M 0 0 H ${stepX} V ${stepY} H 0 Z" fill="none" stroke="${appearance.gridColor}" stroke-width="${appearance.lineWidth*units}"/>${options.diagonal?`<path d="M 0 0 L ${stepX} ${stepY} M ${stepX} 0 L 0 ${stepY}" fill="none" stroke="${appearance.diagonalColor}" stroke-width="${Math.max(.1,appearance.lineWidth*.64)*units}"/>`:''}</pattern></defs>`;
 if(options.diagonal&&options.diagonalAngle!==undefined){
  const families=diagonalGridFamilies({...lattice,diagonal:true,diagonalAngle:options.diagonalAngle});
  const base=`<pattern id="${id}" width="${stepX}" height="${stepY}" patternUnits="userSpaceOnUse" patternTransform="${transform}"><path d="M 0 0 H ${stepX} V ${stepY} H 0 Z" fill="none" stroke="${appearance.gridColor}" stroke-width="${appearance.lineWidth*units}"/></pattern>`;
  const angled=families.map(({angle,step},index)=>`<pattern id="${id}-diagonal-${index}" data-grid-angle="${angle}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="translate(${x} ${y}) rotate(${angle})"><path d="M 0 0 H ${step} M 0 ${step} H ${step}" fill="none" stroke="${appearance.diagonalColor}" stroke-width="${Math.max(.1,appearance.lineWidth*.64)*units}"/></pattern>`).join('');
  return `<g data-export-grid="${scope}" pointer-events="none"><defs>${base}${angled}</defs>${area}${families.map((_,index)=>area.replace(`url(#${id})`,`url(#${id}-diagonal-${index})`)).join('')}</g>`;
 }
 return `<g data-export-grid="${scope}" pointer-events="none">${pattern}${area}</g>`;
}
export function creasePatternSVG(doc:Doc,preferences:CreaseDisplay,crop?:Bounds,layers:DisplayLayers=defaultDisplayLayers(),strokeOptions?:CreasePatternStrokeOptions,grid?:CreasePatternGridOptions):string{
 validateDoc(doc);const display=validateCreaseDisplay(preferences),visible=validateDisplayLayers(layers),bounds=crop??getDrawingBounds(doc);
 const units=strokeOptions?.units??DISPLAY_PIXEL_MM,adaptive=strokeOptions?.enabled??readAdaptiveLineStyle();
 if(!Number.isFinite(units)||units<=0||typeof adaptive!=='boolean')throw new Error('折痕线型显示参数无效。');
 if(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)throw new Error('导出范围无效。');
 const {x,y,width,height}=bounds,outline=paperPath(doc),backgroundGrid=gridSVG(doc,bounds,outline,units,grid);
 // Keep original paper and export bounds even when boundary strokes are hidden.
 const segments=doc.segments.filter(s=>!(strokeOptions?.hideExistingCreases&&s.assignment==='F')&&(s.assignment==='A'?visible.auxiliary:visible.main));
 const objects=doc.objects?.filter(o=>(o.kind!=='mark'||visible.marks)&&(o.kind!=='text'||visible.comments));
 const lines=creasePaintOrder(segments).map(s=>{
  const stroke=creaseLineStroke(s,display.lineStyle,s.assignment==='A'?display.auxLineWidth:display.lineWidth,units,adaptive,display.roundedEnds,display.auxLineStyle,strokeOptions?.solidCreases),title=creaseShortLineTitle(s,stroke.limited);
  const attributes=`x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="${display.roundedEnds?'round':'butt'}"${stroke.dash?` stroke-dasharray="${stroke.dash}"`:''}${stroke.dashOffset===undefined?'':` stroke-dashoffset="${stroke.dashOffset}"`}`;
  return title?`<line ${attributes}><title>${title}</title></line>`:`<line ${attributes}/>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" overflow="hidden" shape-rendering="${display.antiAlias?'geometricPrecision':'crispEdges'}" viewBox="${x} ${y} ${width} ${height}"><path d="${outline}" fill="white" fill-rule="${paperFillRule(doc)}"/>${backgroundGrid}${lines}${visible.main?creaseVerticesSVG(segments,display,DISPLAY_PIXEL_MM):''}${objectsSVG({...doc,objects},(display.markLineWidth??1.3)*DISPLAY_PIXEL_MM)}</svg>`;
}

