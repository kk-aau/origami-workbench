import type {Doc,Point} from '../core/types';
import type {DisplayLayers} from './displayLayers';
import {canvasInteractionDocument} from './canvasInteraction';
import {pickEraseSegment} from './erase';
import {distanceToSegment} from './state';
import {circleCircumferenceDistance,pickCircleCircumference} from './circleTools';

export type CanvasObjectHit={kind:'segment'|'circle';id:string;distance:number};

/** The general canvas uses one nearest-object decision for CP strokes and
 * construction circle circumferences. Exact cross-kind ties retain CP stroke
 * priority; same-kind ties are stable by ID rather than document order. */
export function pickCanvasObject(doc:Doc,point:Point,tolerance:number,lockBoundary=false,layers:Pick<DisplayLayers,'main'|'auxiliary'>={main:true,auxiliary:true}):CanvasObjectHit|undefined {
  const visible=canvasInteractionDocument(doc,layers);
  const segmentId=pickEraseSegment(visible,point,tolerance,lockBoundary);
  const segment=segmentId===undefined?undefined:visible.segments.find(value=>value.id===segmentId);
  const circle=pickCircleCircumference(doc.objects??[],point,tolerance,layers.auxiliary);
  const segmentHit:CanvasObjectHit|undefined=segment?{kind:'segment',id:segment.id,distance:distanceToSegment(point,segment)}:undefined;
  const circleHit:CanvasObjectHit|undefined=circle?{kind:'circle',id:circle.id,distance:circleCircumferenceDistance(circle,point)}:undefined;
  if(!segmentHit)return circleHit;
  if(!circleHit)return segmentHit;
  return circleHit.distance<segmentHit.distance?circleHit:segmentHit;
}
