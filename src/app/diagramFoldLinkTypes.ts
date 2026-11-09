import type {Point,Segment} from '../core/types';
import type {DiagramLineStyle} from './diagramAnnotations';
import type {RigidFoldTransform3D} from '../core/rigidFoldGeometry';

/** SVG-style affine matrix: [xx, yx, xy, yy, tx, ty]. */
export type DiagramFoldMatrix=[number,number,number,number,number,number];
export interface DiagramFoldAnchor {
  point:Point;matrix:DiagramFoldMatrix;
  /** Actual stationary material frame. The 2D matrix is only its camera projection. */
  spatialTransform?:RigidFoldTransform3D;
  /** UI selection on a CP; point above remains an interior face seed. */
  target?:{stateId:string;kind:'face'|'vertex';point:Point};
}
export interface DiagramFoldLinkSettings {
  enabled:boolean;
  layers:'all'|'top'|'selected';
  selectedFaces:number[];
  /** Current editable handles already carry their material scope. Legacy
   * files without this marker still rebuild CP-authored handles on opening. */
  drawingVersion?:1;
  fixed?:DiagramFoldAnchor;
  /** Only the geometry owned by linked drawing operations, never arbitrary CP edges. */
  generated?:Segment[];
  /** CP-coordinate M/V intent for this step's out-and-return operations.
   * F/0° material is pressed and unfolded; an unchanged, same-direction old
   * MV hinge may open towards zero and return to its original folded angle.
   * Intent never carries into the next step or owns an unchanged old hinge. */
  precreases?:Segment[];
}
export interface DiagramFoldPreviewSegment {
  face:number;a:Point;b:Point;assignment:'M'|'V'|'F'|'U';
  foldAngle?:number|null;
  visibility:'visible'|'hidden'|'unknown';
  style?:DiagramLineStyle;
  existing?:boolean;
  /** This formerly folded M/V hinge is being opened to F on this step. */
  unfolding?:boolean;
  /** Display-only projected arc length. Clipping/occlusion retain the phase of
   * the complete, continuous crease on this indexed material. Never persisted. */
  strokeSpan?:{length:number;offset:number};
}
