import type {FoldingConstraint} from '../core/types';

/** Workbench canonical CP face numbers are one-based and signed by material side. */
export function primalDualTopFaceConstraints(face:number|undefined,count:number):FoldingConstraint[]|null{
  if(face===undefined)return [];
  if(!Number.isInteger(face)||face===0||Math.abs(face)>count)return null;
  return [{face:Math.abs(face)-1,side:face>0?'white':'color'}];
}
