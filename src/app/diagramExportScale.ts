import {DEFAULT_DIAGRAM_SCALE_CHANGE_PERCENT,type DiagramPDFRect} from './diagramPDFLayout';

/** Printed points per drawing unit, after the final artwork rotation and crop. */
export function diagramArtworkScale(artwork:string,rect:Pick<DiagramPDFRect,'width'|'height'>):number|null {
  const opening=/^\s*<svg\b[^>]*>/.exec(artwork)?.[0];
  const box=opening?.match(/\sviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
  if(box?.length!==4||!box.every(Number.isFinite)||![box[2],box[3],rect.width,rect.height].every(value=>Number.isFinite(value)&&value>0))return null;
  const scale=Math.min(rect.width/box[2],rect.height/box[3]);
  return Number.isFinite(scale)&&scale>0?scale:null;
}

export type DiagramScaleChange='zoom'|'zoomOut';

/** A symmetric threshold keeps the same transition significant in reverse. */
export function diagramScaleChange(previous:number|null,current:number|null,percent=DEFAULT_DIAGRAM_SCALE_CHANGE_PERCENT):DiagramScaleChange|null {
  if(previous===null||current===null||!Number.isFinite(previous)||!Number.isFinite(current)||previous<=0||current<=0)return null;
  if(!Number.isFinite(percent)||percent<0)return null;
  const ratio=Math.max(current,previous)/Math.min(current,previous),threshold=1+percent/100;
  // Fitting equivalent viewports can differ by a few units of floating-point precision.
  const tolerance=8*Number.EPSILON;
  if(ratio<=1+tolerance||ratio<threshold-threshold*tolerance)return null;
  return current>previous?'zoom':'zoomOut';
}
