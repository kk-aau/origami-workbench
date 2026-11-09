import type {Assignment,Segment} from '../core/types';
import type {Tool} from './tools';

const generatedLineTools:ReadonlySet<Tool>=new Set<Tool>([
  'line','restrictedline','drawdivide','drawratio','parallel','perpendicular','bisect','midperp','polygon',
  'tangentpoint','tangentcircles','mirrorline','mirrorselection','reflection','reflectionlines','transverse',
  'continuous','rabbitear','fishbone','axiom5','axiom7','bisectlines','offsetparallel','angledrag',
  'angledirection','angleconverge','angleproject','localflat','foldableinput','foldabledraw','copyselection','copyfour',
]);

/** Existing-line edits and auxiliary-only tools do not create swappable creases. */
export function canSwapGeneratedLines(tool:Tool):boolean {return generatedLineTools.has(tool);}

export function generatedAssignment(assignment:Assignment,swap=false):Assignment {
  return swap?(assignment==='M'?'V':assignment==='V'?'M':assignment):assignment;
}

/** Apply exactly once to newly constructed segments, before coverage/splitting.
 * Old fragments may acquire new IDs during overlay; IDs alone are not ownership.
 * Source fold magnitudes, unknown angles and non-fold line types are preserved. */
export function swapGeneratedLines(segments:Segment[],swap=false):Segment[] {
  if(!swap)return segments;
  return segments.map(segment=>{
    const assignment=generatedAssignment(segment.assignment,true);
    if(assignment===segment.assignment)return segment;
    return {...segment,assignment,angle:segment.angle===null?null:segment.angle===0?0:-segment.angle};
  });
}
