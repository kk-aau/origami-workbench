import type {Point} from '../core/types';
import {pointBounds} from '../core/pointBounds';
import type {ModelCamera} from './modelViewState';
/** Shared initial framing for interactive model panes and camera-range exports. */
export function fittedModelCamera(vertices:Point[],rotation:number):ModelCamera{
 const {minX:x,minY:y,maxX,maxY}=pointBounds(vertices),w=Math.max(1,maxX-x),h=Math.max(1,maxY-y),pad=Math.max(w,h)*.16;
 return {rotation,x:x-pad,y:y-pad,width:w+2*pad,height:h+2*pad};
}
