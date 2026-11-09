import type {Assignment,Doc,Segment} from '../core/types';

/** A target angle is a property of the crease, never proof of a completed fold. */
export type FoldAngleValue=number|null|'mixed'|'none';
export interface FoldAngleSummary {value:FoldAngleValue;editableCount:number;ignoredCount:number}

export function validateFoldAngleMagnitude(magnitude:number|null):void {
  if(magnitude!==null&&(typeof magnitude!=='number'||!Number.isFinite(magnitude)||magnitude<0||magnitude>180))
    throw new Error('折叠角度须为 0–180° 的有限数，或明确设为未知。');
}

export function parseFoldAngleDraft(text:string):number {
  if(!text.trim())throw new Error('请输入 0–180° 的折叠角度。');
  const magnitude=Number(text);validateFoldAngleMagnitude(magnitude);return magnitude;
}

/** The UI edits a magnitude; assignment alone determines the stored sign. */
export function signedFoldAngle(assignment:'M'|'V',magnitude:number|null):number|null {
  validateFoldAngleMagnitude(magnitude);
  return magnitude===null?null:magnitude===0?0:assignment==='M'?-magnitude:magnitude;
}

function isFold(assignment:Assignment):assignment is 'M'|'V' {return assignment==='M'||assignment==='V';}

/** Ignore paper edges, auxiliary/flat/unassigned lines without hiding that fact. */
export function summarizeFoldAngles(segments:readonly Segment[],selected?:ReadonlySet<string>):FoldAngleSummary {
  let value:FoldAngleValue='none',editableCount=0,ignoredCount=0;
  for(const segment of segments){
    if(selected&&!selected.has(segment.id))continue;
    if(!isFold(segment.assignment)){ignoredCount++;continue;}
    const magnitude=segment.angle===null?null:Math.abs(segment.angle);
    if(!editableCount)value=magnitude;
    else if(value!==magnitude)value='mixed';
    editableCount++;
  }
  return {value,editableCount,ignoredCount};
}

/** Produces one immutable proposal. The caller owns material validation and undo. */
export function setSelectedFoldAngle(doc:Doc,selected:ReadonlySet<string>,magnitude:number|null):{doc:Doc;changed:number} {
  validateFoldAngleMagnitude(magnitude);let changed=0;
  const segments=doc.segments.map(segment=>{
    if(!selected.has(segment.id)||!isFold(segment.assignment))return segment;
    const angle=signedFoldAngle(segment.assignment,magnitude);
    if(segment.angle===angle)return segment;
    changed++;return {...segment,angle};
  });
  return {doc:changed?{...doc,segments}:doc,changed};
}

/** Only pass newly authored geometry here, before deduplication and splitting.
 * Copied/moved geometry and fragments of existing lines keep their source angle.
 * Omitting the preference preserves each construction's original defaults. */
export function applyDrawingFoldAngle(segments:Segment[],magnitude?:number|null):Segment[] {
  if(magnitude===undefined)return segments;
  validateFoldAngleMagnitude(magnitude);
  return segments.map(segment=>{
    if(!isFold(segment.assignment))return segment;
    const angle=signedFoldAngle(segment.assignment,magnitude);
    return segment.angle===angle?segment:{...segment,angle};
  });
}
