import type {DiagramPDFRect} from './diagramPDFLayout';
export type DiagramPDFDirection='right'|'bottom'|'left'|'top';
export const diagramPDFDirectionAngle=(direction:DiagramPDFDirection)=>({right:0,bottom:90,left:180,top:270})[direction];
export function diagramPDFTransitionDirection(from:DiagramPDFRect,to:DiagramPDFRect):DiagramPDFDirection {
  const dx=to.x+to.width/2-from.x-from.width/2,dy=to.y+to.height/2-from.y-from.height/2;
  // Staggered neighbours in one row retain the horizontal reading direction.
  const sameRow=Math.abs(dy)<Math.min(from.height,to.height)*.55;
  return sameRow||Math.abs(dx)>Math.abs(dy)*1.25?dx<0?'left':'right':dy<0?'top':'bottom';
}
/** Mirroring a rotation instruction would reverse clockwise/counterclockwise.
 * Rotate these glyphs rigidly; mirror only lateral, non-chiral view cues. */
export function diagramPDFDirectionGlyph(symbol:string,direction:DiagramPDFDirection):string {
  return direction==='left'&&!['rotate','rotateCCW'].includes(symbol)?'scale(-1 1)':`rotate(${diagramPDFDirectionAngle(direction)})`;
}
