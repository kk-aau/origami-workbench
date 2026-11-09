import {creasePatternSVG} from './creasePatternSVG';
import {DISPLAY_PIXEL_MM} from './creaseDisplay';
import {getDrawingBounds} from './paper';

/** A complete CP includes the outside half of boundary strokes and endpoint
 * markers. An explicitly requested operation-frame crop remains an exact crop. */
export function completeCreasePatternSVG(...args:Parameters<typeof creasePatternSVG>):string {
  const [doc,display,crop,layers,stroke,grid]=args;
  if(crop)return creasePatternSVG(...args);
  const bounds=getDrawingBounds(doc),units=stroke?.units??DISPLAY_PIXEL_MM;
  const padding=Math.max(display.lineWidth*units/2,display.auxLineWidth*units/2,(display.pointSize??0)*DISPLAY_PIXEL_MM,(display.markLineWidth??1.3)*DISPLAY_PIXEL_MM/2,.15)+.1;
  return creasePatternSVG(doc,display,{x:bounds.x-padding,y:bounds.y-padding,width:bounds.width+padding*2,height:bounds.height+padding*2},layers,stroke,grid);
}

export interface CPPrintOptions {paper:'A4'|'A3';orientation:'portrait'|'landscape'}
export const defaultCPPrintOptions:CPPrintOptions={paper:'A4',orientation:'portrait'};
export function cpPrintSize(options:CPPrintOptions=defaultCPPrintOptions){
  if(!['A4','A3'].includes(options.paper)||!['portrait','landscape'].includes(options.orientation))throw Error('CP 打印纸张设置无效。');
  const [short,long]=options.paper==='A3'?[297,420]:[210,297];
  return options.orientation==='landscape'?{width:long,height:short}:{width:short,height:long};
}
/** Numeric SVG units are PDF points for the native SVG-to-PDF converter.
 * The complete source viewBox is fitted proportionally inside 10 mm margins. */
export function cpPrintPageSVG(artwork:string,options:CPPrintOptions=defaultCPPrintOptions):string {
  const size=cpPrintSize(options),width=size.width*72/25.4,height=size.height*72/25.4,margin=10*72/25.4;
  const root=artwork.match(/^<svg\b([^>]*)>/),viewBox=root?.[1].match(/\bviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
  if(!root||!viewBox||viewBox.length!==4||viewBox.some(n=>!Number.isFinite(n))||viewBox[2]<=0||viewBox[3]<=0)throw Error('CP 图像范围无效，未导出。');
  const inner=artwork.replace(root[0],`<svg${root[1].replace(/\s(?:x|y|width|height|preserveAspectRatio)="[^"]*"/g,'')} x="${margin}" y="${margin}" width="${width-margin*2}" height="${height-margin*2}" preserveAspectRatio="xMidYMid meet">`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/>${inner}</svg>`;
}

/** Native and browser print share the same fitted page geometry as PDF. */
export function cpPrintHTML(artwork:string):string {
  return `<style>@page{size:A4;margin:0}@media print{html,body{margin:0!important;padding:0!important}.desktop-print-page{width:210mm;line-height:0}.desktop-print-page>svg{display:block;width:210mm;height:297mm;max-width:none;break-inside:avoid}}</style>${cpPrintPageSVG(artwork)}`;
}
