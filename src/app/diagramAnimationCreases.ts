import {pointOnSegment} from '../core/geometry';
import type {Point,Segment} from '../core/types';
import type {SimulationStepAnimation} from '../engine/simStepAnimation';

/** Match the operation-after CP in material coordinates, before projecting the
 * animated sheet. The solver also contains before-only hinges and mesh seams. */
export function diagramAnimationTargetCreases(edges:readonly (readonly number[])[],material:readonly Point[],segments:readonly Segment[],eps:number):NonNullable<SimulationStepAnimation['targetCreases']>{
  const creases=segments.filter(s=>s.assignment==='M'||s.assignment==='V'||s.assignment==='F');
  return edges.map(([a,b])=>{
    const mark=creases.find(s=>pointOnSegment(material[a],s,eps)&&pointOnSegment(material[b],s,eps));
    if(mark?.assignment==='M'||mark?.assignment==='V'||mark?.assignment==='F')return mark.assignment;
    return null;
  });
}
