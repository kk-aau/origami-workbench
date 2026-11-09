import type {Point} from '../core/types';
import type {DiagramImage} from '../app/diagramImages';
import {diagramImageCorners} from '../app/diagramImages';

export type DiagramImageCorner=0|1|2|3;
const LIMIT=1_000_000;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Image transforms affect illustration placement only, never paper geometry. */
export function translateDiagramImage(image:DiagramImage,start:Point,pointer:Point):DiagramImage {
  return {...image,position:[clamp(image.position[0]+pointer[0]-start[0],-LIMIT,LIMIT),clamp(image.position[1]+pointer[1]-start[1],-LIMIT,LIMIT)]};
}

/** Keep the opposite corner stationary, even when the image is rotated. */
export function resizeDiagramImage(image:DiagramImage,corner:DiagramImageCorner,pointer:Point,minimumSide=1e-6):DiagramImage {
  const corners=diagramImageCorners(image),anchor=corners[(corner+2)%4],moving=corners[corner];
  const dx=moving[0]-anchor[0],dy=moving[1]-anchor[1],denominator=dx*dx+dy*dy;
  if(denominator<=0||!Number.isFinite(pointer[0])||!Number.isFinite(pointer[1]))return image;
  const minimum=Math.max(1e-6,minimumSide)/Math.min(image.width,image.height),maximum=LIMIT/Math.max(image.width,image.height);
  const scale=clamp(((pointer[0]-anchor[0])*dx+(pointer[1]-anchor[1])*dy)/denominator,Math.min(minimum,maximum),maximum);
  const width=image.width*scale,height=image.height*scale;
  const center:Point=[anchor[0]+dx*scale/2,anchor[1]+dy*scale/2];
  return {...image,width,height,position:[clamp(center[0]-width/2,-LIMIT,LIMIT),clamp(center[1]-height/2,-LIMIT,LIMIT)]};
}
