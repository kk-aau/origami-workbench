import type {Point} from '../core/types';
import type {DiagramAnnotation} from './diagramAnnotations';

export interface DiagramViewportRect {x:number;y:number;width:number;height:number}

/** Editor camera rotation is independent of the model's observation angle. */
export function rotateDiagramViewportPoint(point:Point,center:Point,degrees:number):Point {
  const radians=degrees*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),x=point[0]-center[0],y=point[1]-center[1];
  return [center[0]+x*c-y*s,center[1]+x*s+y*c];
}

/** The rotated bounds keep their center; they can be fitted with uniform SVG scaling. */
export function diagramViewportRotatedBounds(rect:DiagramViewportRect,degrees:number):DiagramViewportRect {
  const radians=degrees*Math.PI/180,c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
  const width=rect.width*c+rect.height*s,height=rect.width*s+rect.height*c;
  return {x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height};
}

/** Scale a camera around a world point, keeping that point stationary on screen even when rotated. */
export function zoomDiagramViewport(rect:DiagramViewportRect,anchor:Point,factor:number):DiagramViewportRect {
  if(!Number.isFinite(factor)||factor<=0)throw new Error('画布缩放倍数必须为有限正数。');
  return {x:anchor[0]+(rect.x-anchor[0])*factor,y:anchor[1]+(rect.y-anchor[1])*factor,width:rect.width*factor,height:rect.height*factor};
}

export function normalizeDiagramViewportAngle(degrees:number):number {
  return ((degrees+180)%360+360)%360-180;
}

/** Temporary screen-space geometry for picking; never validates or writes transformed file coordinates. */
export function diagramViewportAnnotations(annotations:DiagramAnnotation[],center:Point,degrees:number):DiagramAnnotation[] {
  return annotations.map(annotation=>annotation.kind==='line'
    ?{...annotation,a:rotateDiagramViewportPoint(annotation.a,center,degrees),b:rotateDiagramViewportPoint(annotation.b,center,degrees)}
    :{...annotation,position:rotateDiagramViewportPoint(annotation.position,center,degrees),rotation:annotation.rotation+degrees});
}
