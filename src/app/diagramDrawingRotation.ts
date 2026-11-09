import {diagramViewportRotatedBounds,normalizeDiagramViewportAngle,type DiagramViewportRect} from './diagramViewport';

function drawingAngle(degrees:number):number {
  if(!Number.isFinite(degrees))throw new Error('折图旋转角度必须为有限数值。');
  return normalizeDiagramViewportAngle(degrees);
}

/** A saved illustration turn applies to every drawing object, independently
 * of the paper observation angle and the editor's zoom and pan camera. */
export function diagramDrawingRotationFrame(frame:DiagramViewportRect,degrees=0):DiagramViewportRect {
  const angle=drawingAngle(degrees);return angle?diagramViewportRotatedBounds(frame,angle):{...frame};
}

export function diagramDrawingRotationMarkup(markup:string,frame:DiagramViewportRect,degrees=0):string {
  const angle=drawingAngle(degrees);if(!angle)return markup;
  return `<g data-diagram-drawing-rotation="${angle}" transform="rotate(${angle} ${frame.x+frame.width/2} ${frame.y+frame.height/2})">${markup}</g>`;
}

/** Rotate a completed, caption-free drawing only once. This also covers CP
 * fallbacks and the PDF's separately arranged exterior direction symbols. */
export function rotateDiagramDrawingSVG(svg:string,degrees=0):string {
  const angle=drawingAngle(degrees);if(!angle)return svg;
  const root=/^(<svg\b[^>]*>)([\s\S]*)(<\/svg>)$/.exec(svg),box=root?.[1].match(/\bviewBox="([^"]+)"/);
  const values=box?.[1].trim().split(/[\s,]+/).map(Number);
  if(!root||!values||values.length!==4||!values.every(Number.isFinite)||values[2]<=0||values[3]<=0)throw new Error('折图旋转尺寸无效。');
  const frame={x:values[0],y:values[1],width:values[2],height:values[3]},rotated=diagramDrawingRotationFrame(frame,angle);
  const open=root[1].replace(/\bviewBox="[^"]+"/,`viewBox="${rotated.x} ${rotated.y} ${rotated.width} ${rotated.height}"`);
  return open+diagramDrawingRotationMarkup(root[2],frame,angle)+root[3];
}
