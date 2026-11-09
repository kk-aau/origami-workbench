/** Geometry uses millimetres. M/V are semantic assignments, never display colours. */
import {type BackgroundImage} from './backgroundData.mjs';
import {type FlatFoldSettings} from './flatFoldSettings.mjs';
import {MAX_DRAWING_OBJECTS} from './capacity.mjs';
export type Point = [number, number];
export type Assignment = 'M' | 'V' | 'B' | 'U' | 'A' | 'F';
export interface Segment {
  id: string;
  a: Point;
  b: Point;
  assignment: Assignment;
  /** Signed target angle in degrees; negative M, positive V; null means unspecified. */
  angle: number | null;
  /** Optional auxiliary display override; never an assignment or solver input. */
  displayColor?: string;
}
export interface Doc {
  /** Missing/1 denotes legacy geometry-only projects; new saves use 2. */
  schemaVersion?: 1 | 2;
  name: string;
  paper: { width: number; height: number };
  segments: Segment[];
  /** Construction circles and annotations are never solver crease edges. */
  objects?: DrawingObject[];
  /** Embedded reference raster, excluded from fold geometry. */
  background?: BackgroundImage;
  metadata?: Record<string, unknown>;
  /** Persist geometry identity, never a graph-local face index. */
  flatFold?: FlatFoldSettings;
}
interface ObjectBase { id: string; color: string; }
export type DrawingObject =
  | (ObjectBase & { kind: 'circle'; center: Point; radius: number })
  | (ObjectBase & { kind: 'text'; position: Point; text: string; fontSize: number })
  | (ObjectBase & { kind: 'mark'; a: Point; b: Point });
export interface FoldGraph {
  vertices_coords: Point[];
  edges_vertices: [number, number][];
  edges_assignment: string[];
  edges_foldAngle: (number | null)[];
  faces_vertices?: number[][];
  faces_edges?: number[][];
  edges_faces?: number[][];
  faces_faces?: number[][];
  /** Indexed interior boundary rings. Outer rings are faces_vertices;
   * holes have the opposite winding and never create connecting CP edges. */
  faces_holes?: number[][][];
  faces_holeEdges?: number[][][];
  faces_holeFaces?: (number|null)[][][];
  /** Diagram-only F marks retain CP edges but do not partition material faces. */
  zhezhi_flatCreases?: 'marks';
  [key: string]: unknown;
}
export interface Issue {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  segmentIds: string[];
  point?: Point;
}
export interface DiagnosticResult {
  issues: Issue[];
  summary: { errors: number; warnings: number; checkedVertices: number; skippedVertices: number };
}
export interface ImportResult { doc: Doc; warnings: string[] }
export interface ExportResult { text: string; warnings: string[] }
export type DocumentFormat = 'fold' | 'cp' | 'opx' | 'ori' | 'orh' | 'json';
export interface FlatFoldOptions {
  /** Opt-in diagram semantics; the ordinary editor/3D F topology stays unchanged. */
  flatCreases?: 'marks';
  /** Zero-based candidate in the engine's deterministic solution-tree traversal. */
  solutionIndex?: number;
  /** Zero-based face index in the current buildFold graph; omitted means face 0. */
  startingFace?: number;
  /** Candidate visible faces for the folding colour constraint. */
  constraints?: FoldingConstraint[];
  /** Required overlapping face pairs in fixed +Z coordinates; never a soft preference. */
  relativeConstraints?:FlatLayerPreference[];
  /** Choose another valid layer candidate by the selected paper face's
   * position among its actual overlapping peers, viewed from this side. */
  layerAdjustment?:FlatLayerAdjustment;
  /** Material-mapped +Z relationships from unchanged faces of a previous
   * diagram step. A new legal solver candidate must certify them again. */
  layerPreferences?:FlatLayerPreference[];
}
export interface FlatLayerAdjustment {face:number;direction:'up'|'down'|'top'|'bottom';side:'front'|'back'}
export interface FlatLayerPreference {below:number;above:number}
export type FoldingConstraintSide = 'white' | 'color';
export interface FoldingConstraint { face: number; side: FoldingConstraintSide; }
export interface FlatFoldRequest { doc: Doc; options?: FlatFoldOptions; includeSource?: boolean }
export type FlatWorkerRequest = FlatFoldRequest | { kind: 'layers'; result: FlatFoldResult; options?: Pick<FlatFoldOptions,'solutionIndex'|'constraints'|'layerAdjustment'|'layerPreferences'|'relativeConstraints'> };
export type FlatConflictKind='maekawa'|'taco_taco'|'taco_tortilla'|'tortilla_tortilla'|'transitivity'|'adjacent'|'relative-order'|'visible-face'|'global';
/** Bounded evidence from a failed calculation. Face/vertex/edge indices always
 * refer to the public original-face geometry, never private subdivisions.
 * A branch witness explains a rejected candidate, not an independent proof
 * that those faces alone make the whole model impossible. */
export interface FlatFoldConflict {
  kind:FlatConflictKind;
  scope:'root'|'branch'|'condition'|'constraint';
  faces:number[];
  vertices?:number[];
  edges?:number[];
  relations?:{above:number;below:number}[];
  message:string;
}
export interface FlatFoldResult {
  /** Measured elapsed time of this finished worker task, including complete
   * result validation. Absent on older results and synchronous calculations. */
  computationTimeMs?: number;
  geometry: {
    status: 'ready' | 'invalid' | 'unsupported' | 'timeout' | 'cancelled' | 'error';
    message: string;
    vertices: Point[];
    faces: number[][];
    graph?: FoldGraph;
    /** Root used for this computation, not the currently inspected face. */
    startingFace?: number;
    /** Manual result deformation; never imply this still preserves source crease lengths. */
    modified?: boolean;
  };
  layers: {
    status: 'solved' | 'no-solution' | 'unknown' | 'unsupported' | 'timeout' | 'cancelled' | 'error';
    message: string;
    /** Exact coverage check and selected-candidate completion outcome. */
    selfDiagnosis?: {status:'verified'|'completed'|'conflict'|'error';missingPairs:number;stage:string};
    /** Only present for a proved no-solution result; not for timeouts/errors. */
    conflicts?:FlatFoldConflict[];
    /** FOLD faceOrders; relation is defined relative to face normals, not a draw-order index. */
    faceOrders?: [number, number, number][];
    /** Explicit back-to-front order, when available from the solver. */
    faceOrder?: number[];
    solutionCount?: number;
    /** Exact decimal count, including counts larger than Number.MAX_SAFE_INTEGER. */
    solutionCountExact?: string;
    solutionIndex?: number;
    /** Active visible-face candidates; face indices are local to this model result. */
    constraints?: FoldingConstraint[];
  /** Required overlapping face pairs in fixed +Z coordinates; never a soft preference. */
  relativeConstraints?:FlatLayerPreference[];
  };
  warnings: string[];
}
export const LIMITS = { objects: MAX_DRAWING_OBJECTS } as const;

export function defaultAngle(assignment: Assignment): number | null {
  return assignment === 'M' ? -180 : assignment === 'V' ? 180 : assignment === 'U' ? null : 0;
}

export {validateDoc} from './projectValidation.mjs';
