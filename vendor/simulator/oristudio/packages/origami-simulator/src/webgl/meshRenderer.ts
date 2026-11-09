// Draws the folded mesh straight from the solver's position texture.
//
// This is the zero-readback render path: `drawElements` with the face index
// buffer, and the vertex shader `texelFetch`es the vertex position from the
// solver's `u_lastPosition` (+ `u_originalPosition`) using `gl_VertexID`, which
// under WebGL2 `drawElements` is the vertex index from the element buffer. So
// positions never leave the GPU -- no readback, no upload.
//
// The projection is the exact orbit projection the canvas-2D renderer used (see
// camera.ts), so the WebGL output matches what users already see. Faces are
// depth-tested (no painter's sort), two-tone via `gl_FrontFacing`, flat-lit from
// the screen-space derivative of view position. Edges are screen-space ribbons.
import type { GlCore } from './glCore.js';
import type { CameraUniforms, Mat3 } from './camera.js';
import type { FoldAssignment } from '../types.js';
import { CREASE_PLANE_DEPTH_GLSL } from './creasePlaneDepth.js';

export interface MeshTopology {
  /** Triangle vertex indices, 3 per face. */
  faceIndices: Uint32Array;
  /** Edge vertex indices, 2 per edge. */
  edgeIndices: Uint32Array;
  /**
   * Per-edge fold assignment as a code: 0=B(order), 1=M, 2=V, 3=F(acet), 4=U,
   * matching EDGE_ASSIGNMENT_CODES. Drives crease colour so mountains and
   * valleys read distinctly.
   */
  edgeAssignments: Uint8Array;
  /** Opposite triangle vertices on the two sides of each edge; -1 at a border. */
  edgeOpposites?: Int32Array;
  /** 1 for source-paper lines; 0 for numerical triangulation/bending supports. */
  edgeMaterial?: Uint8Array;
  /** Square texture edge length the solver packs vertices into. */
  textureDim: number;
}

/** Optional display-only mesh; its vertices never enter the solver textures. */
export interface MeshPositionFrame {
  positions: Float32Array;
  topology: MeshTopology;
  strain?: Float32Array;
}

interface PositionTextures {position:string;original:string;velocity:string}
const SOLVER_POSITION_TEXTURES:PositionTextures={position:'u_lastPosition',original:'u_originalPosition',velocity:'u_lastVelocity'};

/**
 * Dash patterns by crease kind. A pattern is alternating on/off runs in device
 * pixels — the same shape `CanvasRenderingContext2D.setLineDash` and SVG's
 * `stroke-dasharray` take, and the same values Oriedita uses.
 */
export interface CreaseDash {
  border: readonly number[] | null;
  mountain: readonly number[] | null;
  valley: readonly number[] | null;
}

/** Longest pattern the edge shader can hold, which bounds its uniform array. */
export const MAX_DASH_RUNS = 6;

/**
 * Pack dash patterns into the edge shader's flat uniform arrays, ordered by
 * assignment code so the fragment stage can index by `v_assignment` with no
 * per-kind branch.
 *
 * Exported because it is the whole of the shader's dash logic that can be
 * checked without a GL context: everything after this is a uniform upload and a
 * `mod`.
 */
export function packCreaseDash(dash: CreaseDash | undefined): {
  runs: Float32Array;
  counts: Int32Array;
} {
  const runs = new Float32Array(3 * MAX_DASH_RUNS);
  const counts = new Int32Array(3);
  // Index order is the assignment code: 0=B, 1=M, 2=V.
  const kinds = [dash?.border ?? null, dash?.mountain ?? null, dash?.valley ?? null];
  kinds.forEach((pattern, kind) => {
    if (!pattern || pattern.length === 0) return;
    // An odd-length pattern repeats inverted, as CSS and canvas both define it,
    // so doubling it here keeps the shader's "even run is ink" rule true without
    // the shader needing to know about parity.
    const normalized = pattern.length % 2 === 0 ? pattern : [...pattern, ...pattern];
    const count = Math.min(normalized.length, MAX_DASH_RUNS);
    counts[kind] = count;
    for (let i = 0; i < count; i += 1) {
      runs[kind * MAX_DASH_RUNS + i] = Math.max(0, normalized[i] ?? 0);
    }
  });
  return { runs, counts };
}

export interface RenderSettings {
  frontColor: [number, number, number];
  backColor: [number, number, number];
  /** Crease colours by assignment; mountain/valley must differ to be legible. */
  mountainColor: [number, number, number];
  valleyColor: [number, number, number];
  borderColor: [number, number, number];
  facetColor?: [number, number, number];
  unassignedColor?: [number, number, number];
  /** Drawing palette with physical fold boundaries, independent of assignment ink. */
  diagramStyle?: boolean;
  diagramInkColor?: [number, number, number];
  lightDir: [number, number, number];
  background: [number, number, number];
  /**
   * Opacity of {@link background}. 1 fills the frame; 0 clears it to nothing, so
   * whatever sits behind the canvas shows through wherever the model does not
   * cover it — which is how an inline simulation window reads as sitting on the
   * crease pattern rather than over a hole punched in it. Defaults to opaque.
   */
  backgroundAlpha?: number;
  showFaces: boolean;
  showEdges: boolean;
  /** Per-kind visibility only affects rendering, never the solver's topology. */
  showMountains?: boolean;
  showValleys?: boolean;
  showBoundaries?: boolean;
  /** Triangulation/flat facet edges are hidden unless explicitly enabled. */
  showFacets?: boolean;
  showUnassigned?: boolean;
  lighting: boolean;
  /** Crease line width in device pixels. */
  creaseWidthPx: number;
  /**
   * Frame edge, in device pixels, that {@link creaseWidthPx} is calibrated for.
   *
   * Left unset, a crease keeps a constant on-screen weight however large the
   * frame is. That is what a *viewport* wants: a Simulate-workspace pane is a
   * window onto the fold, and its linework should stay crisp when the pane is
   * resized.
   *
   * Set, the crease shrinks with the frame below this edge, so the fold reads
   * identically at every size. That is what an *object* wants: an inline
   * simulation window is a picture on the crease pattern, sized by the CP
   * camera, and the model is fitted to the frame (see `fitExtent`) while a
   * constant-weight crease is not — so at thumbnail size the creases bury the
   * paper they annotate. The crease-pattern canvas reached the same rule for
   * vertices, for the same reason and in the same words; see
   * `VERTEX_SHRINK_EXPONENT` in `CreasePatternWebglCanvas`.
   *
   * Above the reference nothing changes, so a window large enough to read as a
   * viewport is left alone.
   */
  creaseWidthReferenceEdge?: number;
  /**
   * How fast the crease shrinks below {@link creaseWidthReferenceEdge}. 0 =
   * constant screen weight (the same as leaving the reference unset), 1 =
   * lockstep with the frame, so a crease stays the same fraction of the paper at
   * every size. Defaults to 1.
   */
  creaseWidthShrinkExponent?: number;
  /**
   * Dash pattern per crease kind, as alternating on/off run lengths in device
   * pixels, or null for solid.
   *
   * Concrete arrays rather than a style name on purpose: the caller flattens its
   * style choice into colours and these patterns, so no renderer has to
   * interpret an enum. Three renderers each reading a style would be three
   * chances to disagree.
   */
  creaseDash?: CreaseDash;
  /** 0..1; below 1 draws faces translucent with depth write off (x-ray). */
  faceAlpha: number;
  /**
   * `paper` shades the two-tone sheet; `strain` colours each vertex by how far
   * its edges are stretched, which is where a crease pattern is not physically
   * foldable. `normals` maps the oriented face's view-space unit normal to
   * RGB=(normal+1)/2, independently of paper colours and lighting.
   * Defaults to `paper` when omitted.
   */
  colorMode?: 'paper' | 'strain' | 'normals';
  /**
   * Percent axial strain drawn fully red in `strain` mode. Upstream's
   * `strainClip`, default 5%.
   */
  strainClip?: number;
  /**
   * How far toward the viewer a crease is pushed, in NDC z, so it draws over the
   * face it lies on instead of z-fighting with it. Defaults to
   * {@link DEFAULT_CREASE_DEPTH_BIAS}.
   *
   * A caller only needs to set this when its model has **coplanar layers**,
   * because then the bias is not just a tie-break — it is also how far *behind*
   * the visible surface a crease may be and still be drawn. A folded figure
   * separates its layers by a hair (`folded3dMesh.ts`), so the default is
   * roughly a dozen layers deep and every buried layer's creases ride it to the
   * front; that is what {@link folded3dCreaseDepthBias} exists to replace. A
   * mass-spring simulation has no coincident layers at all and wants the
   * default.
   *
   * In world depth this is `bias · depthRange`, and `cameraUniforms` sets
   * `depthRange = 2 · radius` — so a value chosen as a fraction of a model's
   * layer gap is camera-independent.
   */
  creaseDepthBias?: number;
  /** Optional world-space normal of a verified planar display surface. Its
   * screen-width crease ribbons follow this plane across their width rather
   * than carrying the centre-line depth into the paper above them. Omit for
   * ordinary moving/bent simulation meshes. Does not change edge positions. */
  creasePlaneNormal?: readonly [number,number,number];
  /**
   * Whether the crease pass writes depth. Defaults to true.
   *
   * A caller draws creases *without* writing depth when something drawn later
   * has to be able to cover them. A folded figure does exactly that: its planes
   * are drawn far-to-near, and along a fold line two planes sit at the same
   * depth by construction — so the nearer one's paper must be able to paint over
   * the farther one's linework, which it can only do if that linework did not
   * claim the depth buffer first.
   *
   * Creases still *test* against depth either way. What this drops is their
   * ability to occlude, which for a line lying on the surface it annotates is
   * not something anything relies on.
   */
  creaseWritesDepth?: boolean;
}

/**
 * The crease depth bias a caller gets without asking.
 *
 * Sized for a model whose surfaces are never coincident, which is every
 * mass-spring simulation: it only has to beat the z-fight between a crease and
 * the one face it lies on, and `1.6e-3 · radius` of world depth does that with
 * room to spare at any frame size. It is *not* sized for coplanar layers — see
 * {@link RenderSettings.creaseDepthBias}.
 */
export const DEFAULT_CREASE_DEPTH_BIAS = 0.0008;

/** Full lockstep with the frame — see {@link RenderSettings.creaseWidthShrinkExponent}. */
const DEFAULT_CREASE_SHRINK_EXPONENT = 1;

/**
 * How much a crease's declared width is scaled by, given the frame it is drawn
 * in. 1 whenever the settings ask for constant screen weight, and whenever the
 * frame is at or above the reference edge.
 *
 * Keyed on the frame's short edge because that is what the model is fitted to
 * (see `fitExtent` in camera.ts), so the crease and the paper it lies on shrink
 * together.
 * Shared with the SVG renderer, which is what keeps an exported view the view
 * that was on screen.
 */
export function creaseFrameScale(
  settings: RenderSettings,
  width: number,
  height: number
): number {
  const reference = settings.creaseWidthReferenceEdge ?? 0;
  const edge = Math.min(width, height);
  if (!(reference > 0) || !(edge > 0) || edge >= reference) return 1;
  return Math.pow(edge / reference, settings.creaseWidthShrinkExponent ?? DEFAULT_CREASE_SHRINK_EXPONENT);
}

/**
 * Narrowest ribbon a rasterizer can carry, in device pixels.
 *
 * Below this the crease is drawn *at* this width and the weight it lost comes
 * out of its alpha instead, so the ink keeps thinning the whole way down rather
 * than pinning at a floor. Clamping the width alone would make a zoomed-out
 * window fatten again at the bottom of its range; shrinking the geometry alone
 * would flicker, because a sub-pixel ribbon lands on a sample or misses
 * depending on where it falls. The crease-pattern canvas's point program fades
 * sub-pixel dots for the same reason.
 */
const MIN_RASTER_CREASE_WIDTH_PX = 1;

/** The colour a fully transparent frame clears to — see the clear in `render`. */
const TRANSPARENT: readonly [number, number, number] = [0, 0, 0];

/**
 * The width and opacity a rasterizing renderer should draw creases at.
 *
 * Vector output does not go through this: SVG has no sample grid, so it draws
 * the true scaled width and needs no alpha.
 */
export function rasterCreaseInk(
  settings: RenderSettings,
  width: number,
  height: number
): { widthPx: number; alpha: number } {
  const wanted = settings.creaseWidthPx * creaseFrameScale(settings, width, height);
  const widthPx = Math.max(wanted, MIN_RASTER_CREASE_WIDTH_PX);
  return { widthPx, alpha: Math.max(0, Math.min(1, wanted / widthPx)) };
}

/** Fold assignment codes shared by the GPU, software and SVG renderers. */
const ASSIGNMENT_CODE: Record<FoldAssignment, number> = {
  B: 0,
  M: 1,
  V: 2,
  F: 3,
  U: 4,
  C: 0,
  J: 0,
};

export function edgeAssignmentCode(assignment:FoldAssignment|undefined):number {
  return ASSIGNMENT_CODE[assignment??'U']??4;
}

export const DEFAULT_FACET_COLOR:readonly [number,number,number]=[.72,.50,.12];
export const DEFAULT_UNASSIGNED_COLOR:readonly [number,number,number]=[.51,.32,.68];

export function edgeAssignmentVisible(assignment:number,settings:RenderSettings):boolean {
  switch(assignment){
    case 0:return settings.showBoundaries!==false;
    case 1:return settings.showMountains!==false;
    case 2:return settings.showValleys!==false;
    case 3:return settings.showFacets===true;
    case 4:return settings.showUnassigned!==false;
    default:return false;
  }
}

export function edgeAssignmentColor(assignment:number,settings:RenderSettings):readonly [number,number,number] {
  switch(assignment){
    case 1:return settings.mountainColor;
    case 2:return settings.valleyColor;
    case 3:return settings.facetColor??DEFAULT_FACET_COLOR;
    case 4:return settings.unassignedColor??DEFAULT_UNASSIGNED_COLOR;
    default:return settings.borderColor;
  }
}

/** F/U keep their own solid diagnostic ink even when M/V use neutral creases. */
export function edgeAssignmentDash(assignment:number,settings:RenderSettings):readonly number[]|null {
  if(settings.diagramStyle)return null;
  const pattern=assignment===0?settings.creaseDash?.border:assignment===1?settings.creaseDash?.mountain:assignment===2?settings.creaseDash?.valley:null;
  return pattern&&pattern.length?pattern:null;
}

export function normalDirectionColor(normal:readonly number[]):[number,number,number] {
  const length=Math.hypot(normal[0],normal[1],normal[2]);
  if(!Number.isFinite(length)||length===0)return [.5,.5,.5];
  return [0,1,2].map(axis=>Math.max(0,Math.min(1,normal[axis]/length*.5+.5))) as [number,number,number];
}

export const DEFAULT_DIAGRAM_INK:readonly [number,number,number]=[65/255,99/255,78/255];
/** Same low-contrast directional shading as the drawing canvas. No triangle ID
 * or centroid enters this expression: coplanar subdivisions have identical ink. */
export function diagramPaperColor(base:readonly number[],normal:readonly number[]):[number,number,number]{
  const length=Math.hypot(...normal),sign=normal[2]<0?-1:1;
  if(!length)return [...base] as [number,number,number];
  const light=sign*(-.35*normal[0]+.45*normal[1]+.82*normal[2])/length;
  const shade=Math.max(-.035,Math.min(.27,(.82-light)*.28));
  return base.map(c=>shade>0?c*(1-shade):c+(1-c)*-shade) as [number,number,number];
}

export function diagramEdgeColor(folded:boolean,settings:RenderSettings):readonly [number,number,number]{
  const ink=settings.diagramInkColor??DEFAULT_DIAGRAM_INK;
  return folded?ink:ink.map(c=>c*.45+.55) as [number,number,number];
}

/** Measure the current hinge from positions, never the requested target angle.
 * The small normal tolerance suppresses Float32 noise in a flat simulated sheet. */
export function diagramEdgeFolded(positions:ArrayLike<number>,a:number,b:number,c:number,d:number):boolean{
  if(c<0||d<0)return true;
  const u=[0,1,2].map(k=>positions[b*3+k]-positions[a*3+k]);
  const v=[0,1,2].map(k=>positions[c*3+k]-positions[a*3+k]);
  const w=[0,1,2].map(k=>positions[d*3+k]-positions[a*3+k]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const m=[w[1]*u[2]-w[2]*u[1],w[2]*u[0]-w[0]*u[2],w[0]*u[1]-w[1]*u[0]];
  const nl=Math.hypot(...n),ml=Math.hypot(...m);
  return nl===0||ml===0||Math.hypot(...n.map((x,k)=>x/nl-m[k]/ml))>1e-5;
}

/**
 * Derive render topology from a prepared model.
 *
 * Shared by every renderer rather than rebuilt per renderer: the WebGL mesh
 * renderer and the SVG one have to agree about which edges are creases and what
 * kind, and two copies of this mapping is exactly how they would stop agreeing.
 */
export function meshTopologyFor(
  prepared: {
    indices: Uint32Array;
    edgesVertices: ReadonlyArray<readonly [number, number]>;
    edgesAssignment: ReadonlyArray<FoldAssignment>;
    edgesFaces?:ReadonlyArray<readonly number[]>;
    triangleSourceFaces?:readonly number[];
    fold?:{[key:string]:unknown};
  },
  /**
   * The solver's texture edge, which only the GL path reads — it is how the
   * vertex shader finds a position, not a property of the topology. A vector
   * renderer has no textures and can leave it out.
   */
  textureDim = 0
): MeshTopology {
  const edgeIndices = new Uint32Array(prepared.edgesVertices.length * 2);
  const edgeAssignments = new Uint8Array(prepared.edgesVertices.length);
  const edgeOpposites = new Int32Array(prepared.edgesVertices.length*2).fill(-1);
  const edgeMaterial = new Uint8Array(prepared.edgesVertices.length);
  const incidence=new Map<string,number[]>();
  const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  if(!prepared.edgesFaces)for(let f=0;f<prepared.indices.length/3;f++)for(let k=0;k<3;k++){
    const a=prepared.indices[f*3+k],b=prepared.indices[f*3+(k+1)%3],stamp=key(a,b);
    const owners=incidence.get(stamp)??[];owners.push(f);incidence.set(stamp,owners);
  }
  const marker=prepared.fold?.zhezhi_simulation_mesh as {sourceEdgeCount?:number;edgeSourceEdges?:(number|null)[]}|undefined;
  prepared.edgesVertices.forEach((edge, index) => {
    edgeIndices[index * 2] = edge[0];
    edgeIndices[index * 2 + 1] = edge[1];
    edgeAssignments[index] = edgeAssignmentCode(prepared.edgesAssignment[index]);
    const owners=prepared.edgesFaces?.[index]??incidence.get(key(...edge))??[];
    owners.slice(0,2).forEach((face,side)=>{
      for(let k=0;k<3;k++){const v=prepared.indices[face*3+k];if(v!==edge[0]&&v!==edge[1]){edgeOpposites[index*2+side]=v;break;}}
    });
    const original=marker?.edgeSourceEdges?.length===prepared.edgesVertices.length
      ?marker.edgeSourceEdges[index]!==null
      :prepared.edgesAssignment[index]!=='F'||(marker?.sourceEdgeCount!==undefined&&index<marker.sourceEdgeCount)||
        owners.length===2&&!!prepared.triangleSourceFaces&&prepared.triangleSourceFaces[owners[0]]!==prepared.triangleSourceFaces[owners[1]];
    edgeMaterial[index]=original?1:0;
  });
  return {
    faceIndices: prepared.indices.slice(),
    edgeIndices,
    edgeAssignments,
    edgeOpposites,
    edgeMaterial,
    textureDim,
  };
}

// Interleaved edge-vertex layout: [this, a, b, side, assignment].
const EDGE_STRIDE = 8;
const EDGE_ATTRS: ReadonlyArray<readonly [string, number]> = [
  ['a_this', 0],
  ['a_a', 1],
  ['a_b', 2],
  ['a_side', 3],
  ['a_assignment', 4],
  ['a_c',5],['a_d',6],['a_material',7],
];

/** Ribbon vertices per drawn crease: two triangles. */
const EDGE_QUAD_VERTICES = 6;

/**
 * Expand each drawn crease into a 2-triangle screen-space ribbon. Only border,
 * mountain and valley edges are drawn (codes 0/1/2); facet edges from
 * triangulation and unassigned edges are skipped. Returns the interleaved
 * vertex buffer, and where each *source* edge's ribbon starts in it.
 *
 * The second half is what lets {@link MeshDrawOptions.edgeRange} be expressed in
 * the caller's own edge numbering: skipped edges make the mapping from an edge
 * index to a vertex offset non-linear, and a caller that assumed `6 · index`
 * would draw the wrong creases on any model with a facet edge in it. `start` is
 * `edgeCount + 1` long, so edges `[i, j)` own vertices `[start[i], start[j])`.
 */
function buildEdgeQuads(topology: MeshTopology): {
  interleaved: Float32Array;
  vertexStart: Uint32Array;
} {
  const edgeCount = topology.edgeAssignments.length;
  let drawn = 0;
  for (let e = 0; e < edgeCount; e += 1) {
    if (topology.edgeAssignments[e]! <= 4) drawn += 1;
  }

  const out = new Float32Array(drawn * EDGE_QUAD_VERTICES * EDGE_STRIDE);
  const vertexStart = new Uint32Array(edgeCount + 1);
  let v = 0;
  let oppositeA=-1,oppositeB=-1,material=1;
  const emit = (thisIndex: number, a: number, b: number, side: number, assignment: number) => {
    out[v] = thisIndex;
    out[v + 1] = a;
    out[v + 2] = b;
    out[v + 3] = side;
    out[v + 4] = assignment;
    out[v+5]=oppositeA;out[v+6]=oppositeB;out[v+7]=material;
    v += EDGE_STRIDE;
  };

  for (let e = 0; e < edgeCount; e += 1) {
    vertexStart[e] = v / EDGE_STRIDE;
    const assignment = topology.edgeAssignments[e]!;
    if (assignment > 4) continue;
    const a = topology.edgeIndices[e * 2]!;
    const b = topology.edgeIndices[e * 2 + 1]!;
    oppositeA=topology.edgeOpposites?.[e*2]??-1;oppositeB=topology.edgeOpposites?.[e*2+1]??-1;
    material=topology.edgeMaterial?.[e]??(assignment===3?0:1);
    // Two triangles: (Aleft, Aright, Bleft) and (Aright, Bright, Bleft).
    emit(a, a, b, 1, assignment);
    emit(a, a, b, -1, assignment);
    emit(b, a, b, 1, assignment);
    emit(a, a, b, -1, assignment);
    emit(b, a, b, -1, assignment);
    emit(b, a, b, 1, assignment);
  }
  vertexStart[edgeCount] = v / EDGE_STRIDE;
  return { interleaved: out, vertexStart };
}

/**
 * The view transform, written once and concatenated into both programs.
 *
 * Every shader here used to expand the yaw/pitch products itself, and the face
 * and edge programs each carried their own copy of the perspective divide with
 * a comment asking whoever changed one to change the other. `u_view` arrives
 * already composed by `camera.ts`'s `viewRotation`, so there is no camera
 * trigonometry in GLSL at all and no second statement of the projection.
 *
 * `toView` is a plain matrix multiply because `u_view` is uploaded transposed —
 * GLSL's `mat3` is column-major and `Mat3` is row-major.
 */
const VIEW_GLSL = `
uniform vec3 u_center;
uniform mat3 u_view;
uniform float u_scale;
uniform vec2 u_viewport;
uniform float u_depthRange;
uniform float u_camDist;

vec3 toView(vec3 world){
  return u_view * (world - u_center);
}

// One-point perspective: eye at +camDist along the view axis, so nearer points
// (larger depth) magnify and farther ones shrink -> parallels converge.
vec2 toNdc(vec3 view){
  float persp = u_camDist / max(u_camDist - view.z, 0.001);
  return vec2(
    view.x*persp*u_scale/(u_viewport.x*0.5),
    view.y*persp*u_scale/(u_viewport.y*0.5)
  );
}

float toNdcDepth(float depth){
  // Perspective depth must be affine in inverse eye distance, not view z.
  // Otherwise crossing/slanted sheets occlude each other at the wrong pixels.
  float distance = max(u_camDist - depth, 0.001);
  return u_camDist/u_depthRange
    - (u_camDist*u_camDist-u_depthRange*u_depthRange)/(u_depthRange*distance);
}

vec4 toClip(vec3 view){
  float w = max(u_camDist - view.z, 0.001)/u_camDist;
  return vec4(toNdc(view)*w, toNdcDepth(view.z)*w, w);
}
`;

const FACE_VERT = `#version 300 es
precision highp float;
uniform sampler2D u_lastPosition;
uniform sampler2D u_originalPosition;
uniform sampler2D u_lastVelocity;
uniform int u_textureDim;
${VIEW_GLSL}
out vec3 v_view;
out float v_strain;

vec3 fetchPosition(int index){
  ivec2 texel = ivec2(index % u_textureDim, index / u_textureDim);
  return texelFetch(u_lastPosition, texel, 0).xyz + texelFetch(u_originalPosition, texel, 0).xyz;
}

void main(){
  ivec2 texel = ivec2(gl_VertexID % u_textureDim, gl_VertexID / u_textureDim);
  // velocityCalc stores this node's mean axial strain in the velocity alpha, the
  // same channel upstream reads back for its strain visualization.
  v_strain = texelFetch(u_lastVelocity, texel, 0).w;
  vec3 view = toView(fetchPosition(gl_VertexID));
  v_view = view;
  gl_Position = toClip(view);
}`;

const FACE_FRAG = `#version 300 es
precision highp float;
in vec3 v_view;
in float v_strain;
uniform vec3 u_frontColor;
uniform vec3 u_backColor;
uniform vec3 u_lightDir;
uniform float u_lighting;
uniform float u_diagramStyle;
uniform float u_alpha;
uniform float u_strainMode;
uniform float u_normalsMode;
uniform float u_strainClip;
out vec4 fragColor;

// Upstream colours strain with THREE.Color.setHSL(hue, 1, 0.5), so match that
// exactly rather than inventing a ramp.
vec3 hueToRgb(float h){
  float r = abs(h*6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h*6.0 - 2.0);
  float b = 2.0 - abs(h*6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main(){
  vec3 normal = normalize(cross(dFdx(v_view), dFdy(v_view)));
  vec3 base = gl_FrontFacing ? u_frontColor : u_backColor;
  if (u_normalsMode > 0.5){
    // Derivatives face the screen; undo their back-face flip to retain the
    // oriented triangle normal, matching cross(b-a,c-a) in CPU and SVG.
    vec3 oriented = gl_FrontFacing ? normal : -normal;
    fragColor = vec4(oriented*0.5+0.5, u_alpha);
    return;
  }
  if (u_strainMode > 0.5){
    // Percent strain, clipped, mapped hue 0.7 (blue, relaxed) -> 0 (red, at the
    // clip). Upstream: scaledVal = (1 - e/clip) * 0.7.
    float e = min(v_strain*100.0, u_strainClip);
    base = hueToRgb(clamp((1.0 - e/max(u_strainClip, 0.0001)) * 0.7, 0.0, 1.0));
    // Flat-shade strain: lighting would read as strain that is not there.
    fragColor = vec4(base, u_alpha);
    return;
  }
  float shade = 1.0;
  if (u_lighting > 0.5){
    vec3 n = normal.z < 0.0 ? -normal : normal;
    if(u_diagramStyle>0.5){
      float darkness=clamp((0.82-dot(n,vec3(-0.35,0.45,0.82)))*0.28,-0.035,0.27);
      vec3 paper=darkness>0.0?base*(1.0-darkness):base+(vec3(1.0)-base)*(-darkness);
      fragColor=vec4(paper,u_alpha);
      return;
    }
    float diffuse = max(0.0, dot(n, normalize(u_lightDir)));
    shade = clamp(0.74 + diffuse*0.3 + n.z*0.04, 0.68, 1.08);
  }
  fragColor = vec4(base*shade, u_alpha);
}`;

// Creases are drawn as screen-space quads, not GL LINES: native line width is
// clamped to 1px on Metal/ANGLE, which makes creases nearly invisible on a busy
// model. Each edge becomes a camera-facing ribbon of constant pixel width. The
// vertex shader projects both endpoints, takes the screen-space perpendicular,
// and offsets this vertex by +/- half the width.
const EDGE_VERT = `#version 300 es
precision highp float;
in float a_this;       // node index to place this vertex at
in float a_a;          // edge endpoint A (for direction)
in float a_b;          // edge endpoint B
in float a_side;       // +1 / -1 across the ribbon
in float a_assignment; // crease type
in float a_c;
in float a_d;
in float a_material;
uniform float u_diagramStyle;
uniform sampler2D u_lastPosition;
uniform sampler2D u_originalPosition;
uniform int u_textureDim;
${VIEW_GLSL}
uniform float u_halfWidthPx;
uniform float u_depthBias;
${CREASE_PLANE_DEPTH_GLSL}
flat out int v_assignment;
flat out float v_material;
flat out float v_folded;
flat out vec4 v_creasePlane;
// Distance along the edge in pixels, for dashing. Exact across a straight
// two-triangle ribbon, so the fragment stage can measure the run it is in.
out float v_alongPx;

vec3 fetchPosition(int index){
  ivec2 texel = ivec2(index % u_textureDim, index / u_textureDim);
  return texelFetch(u_lastPosition, texel, 0).xyz + texelFetch(u_originalPosition, texel, 0).xyz;
}

// Shares toNdc with the face pass rather than restating it, so creases cannot
// drift off their faces.
vec2 projectNdc(int index){
  return toNdc(toView(fetchPosition(index)));
}

float projectDepth(int index){
  return toNdcDepth(toView(fetchPosition(index)).z);
}

void main(){
  v_assignment = int(a_assignment + 0.5);
  v_material=a_material;
  v_folded=1.0;
  if(u_diagramStyle>0.5&&a_c>=0.0&&a_d>=0.0){
    vec3 a=fetchPosition(int(a_a+0.5)),u=fetchPosition(int(a_b+0.5))-a;
    vec3 n=cross(u,fetchPosition(int(a_c+0.5))-a),m=cross(fetchPosition(int(a_d+0.5))-a,u);
    float nl=length(n),ml=length(m);
    if(nl>0.0&&ml>0.0)v_folded=length(n/nl-m/ml)>0.00001?1.0:0.0;
  }
  v_creasePlane=creaseViewPlane(toView(fetchPosition(int(a_a+0.5))));
  vec2 ndcThis = projectNdc(int(a_this + 0.5));
  vec2 ndcA = projectNdc(int(a_a + 0.5));
  vec2 ndcB = projectNdc(int(a_b + 0.5));
  // Perpendicular in pixel space so the ribbon has constant on-screen width
  // regardless of aspect ratio.
  vec2 dirPx = (ndcB - ndcA) * u_viewport * 0.5;
  float len = length(dirPx);
  // This vertex sits at one end or the other, so the distance along the edge is
  // 0 or the whole length; the rasterizer interpolates between them.
  v_alongPx = int(a_this + 0.5) == int(a_a + 0.5) ? 0.0 : len;
  vec2 perpPx = len > 0.0001 ? vec2(-dirPx.y, dirPx.x) / len : vec2(0.0);
  vec2 offsetNdc = (perpPx * u_halfWidthPx * a_side) / (u_viewport * 0.5);
  // Bias toward the viewer so a crease sits on top of the face it lies on —
  // and, where the model has coplanar layers, on top of *that* face and nothing
  // behind it. See RenderSettings.creaseDepthBias.
  float planeOffset=creasePlaneDepthOffset(toView(fetchPosition(int(a_a+0.5))),perpPx*u_halfWidthPx*a_side);
  float depth = projectDepth(int(a_this + 0.5)) + planeOffset - u_depthBias;
  gl_Position = vec4(ndcThis + offsetNdc, depth, 1.0);
}`;

const EDGE_FRAG = `#version 300 es
precision highp float;
flat in int v_assignment;
flat in float v_material;
flat in float v_folded;
flat in vec4 v_creasePlane;
in float v_alongPx;
uniform vec2 u_viewport;
uniform float u_scale;
uniform float u_depthRange;
uniform float u_camDist;
uniform float u_depthBias;
// Codes match edgeAssignmentCode: 0=B, 1=M, 2=V, 3=F, 4=U.
uniform vec3 u_mountainColor;
uniform vec3 u_valleyColor;
uniform vec3 u_borderColor;
uniform vec3 u_facetColor;
uniform vec3 u_unassignedColor;
uniform float u_diagramStyle;
uniform vec3 u_diagramInkColor;
uniform int u_edgeVisible[5];
uniform float u_alpha;
// Dash runs for the three drawn kinds, packed [B..., M..., V...] with MAX runs
// each, and how many of those runs each kind actually uses (0 = solid).
uniform float u_dashRuns[18];
uniform int u_dashCount[3];
out vec4 fragColor;

/** True where the dash pattern is "on" at this distance along the edge. */
bool dashOn(int kind, float alongPx){
  int count = u_dashCount[kind];
  if (count <= 0) return true;
  int base = kind * 6;
  float total = 0.0;
  for (int i = 0; i < 6; i++){
    if (i >= count) break;
    total += u_dashRuns[base + i];
  }
  if (total <= 0.0) return true;
  float pos = mod(alongPx, total);
  float acc = 0.0;
  for (int i = 0; i < 6; i++){
    if (i >= count) break;
    acc += u_dashRuns[base + i];
    // Even runs are ink, odd runs are gaps, matching setLineDash and
    // stroke-dasharray.
    if (pos < acc) return i - (i / 2) * 2 == 0;
  }
  return true;
}

void main(){
  if (u_edgeVisible[v_assignment] == 0) discard;
  vec3 color = u_borderColor;
  if (v_assignment == 1) color = u_mountainColor;
  else if (v_assignment == 2) color = u_valleyColor;
  else if (v_assignment == 3) color = u_facetColor;
  else if (v_assignment == 4) color = u_unassignedColor;
  if(u_diagramStyle>0.5){
    if(v_material<0.5)discard;
    color=v_assignment==0||v_folded>0.5?u_diagramInkColor:u_diagramInkColor*0.45+vec3(0.55);
  }
  // Discarding rather than blending to the background: a gap has to show the
  // face behind the crease, and it must not write depth either.
  if (u_diagramStyle<0.5&&v_assignment < 3 && !dashOn(v_assignment, v_alongPx)) discard;
  // Evaluate the verified surface at this sample, instead of accumulating a
  // corner offset onto interpolated centre-line depth. The latter can differ
  // from the perspective face pass by several float/depth-buffer steps in an
  // oblique rolled view, erasing the visible sheet's own narrow crease.
  float normalLength=length(v_creasePlane.xyz);
  if(normalLength>0.0&&abs(v_creasePlane.w)>normalLength*u_camDist*0.000001){
    vec2 ray=(gl_FragCoord.xy-u_viewport*0.5)/(u_scale*u_camDist);
    float inverseDistance=(v_creasePlane.z-dot(v_creasePlane.xy,ray))/v_creasePlane.w;
    float nearDistance=u_camDist-u_depthRange;
    // Algebraically the same perspective depth, with less cancellation than
    // subtracting two NDC terms before converting back to window depth.
    gl_FragDepth=(u_camDist+u_depthRange)/(2.0*u_depthRange)*(1.0-nearDistance*inverseDistance)-u_depthBias*0.5;
  }else gl_FragDepth=gl_FragCoord.z;
  fragColor = vec4(color, u_alpha);
}`;

/**
 * How one {@link MeshRenderer.render} call composes with the ones around it.
 *
 * Both fields default to today's behaviour — clear the whole buffer, draw every
 * face — so a caller that passes nothing is byte-identical to one written before
 * this existed. That is deliberate: the solver path must not change.
 *
 * They exist because `faceAlpha`, `frontColor` and `backColor` are *uniforms*,
 * so one draw can only express one opacity. A folded figure needs two: the cells
 * whose layer order the kernel resolved are opaque, and the cells it could not
 * order are translucent, which is the honest way to say "these could be either
 * way round". Without `clear` the second draw would erase the first, and without
 * `faceRange` the first would already have painted the faces the second wants.
 */
export interface MeshDrawOptions {
  /**
   * Clear colour and depth before drawing. Pass `false` for every pass after the
   * first of a multi-pass frame.
   */
  clear?: boolean;
  /**
   * A contiguous run of `topology.faceIndices` to draw, in *indices* (three per
   * triangle). Clamped to the buffer, so an out-of-range request draws less
   * rather than reading past the end.
   */
  faceRange?: { start: number; count: number };
  /**
   * A contiguous run of `topology.edgeAssignments` to draw, in **edges**.
   *
   * The crease half of `faceRange`, and it exists for the same reason: a folded
   * figure draws its determined cells opaque and its undetermined ones
   * translucent in a second pass, and each pass has to bring its own creases or
   * they are drawn at the wrong opacity — or, if the second pass simply omitted
   * them, not at all.
   *
   * Expressed in the caller's edge numbering rather than in ribbon vertices,
   * because facet and unassigned edges are skipped by `buildEdgeQuads` and the
   * mapping is therefore not `6 · index`.
   */
  edgeRange?: { start: number; count: number };
}

/** Clamp a face-index count or offset into `[0, limit]`. */
function clampRange(value: number, limit: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), Math.max(0, limit));
}

export class MeshRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly faceProgram: WebGLProgram;
  private readonly edgeProgram: WebGLProgram;
  private readonly faceElements: WebGLBuffer;
  private readonly edgeBuffer: WebGLBuffer;
  private readonly faceVao: WebGLVertexArrayObject;
  private readonly edgeVao: WebGLVertexArrayObject;
  private readonly faceCount: number;
  private readonly edgeVertexCount: number;
  /** Ribbon vertex offset per source edge — see {@link buildEdgeQuads}. */
  private readonly edgeVertexStart: Uint32Array;
  private readonly textureDim: number;
  private readonly faceUniforms: Map<string, WebGLUniformLocation | null> = new Map();
  private readonly edgeUniforms: Map<string, WebGLUniformLocation | null> = new Map();

  constructor(
    private readonly core: GlCore,
    topology: MeshTopology,
    private readonly positionTextures:PositionTextures=SOLVER_POSITION_TEXTURES
  ) {
    const gl = core.gl;
    this.gl = gl;
    this.textureDim = topology.textureDim;
    this.faceCount = topology.faceIndices.length;

    this.faceProgram = compile(gl, FACE_VERT, FACE_FRAG);
    this.edgeProgram = compile(gl, EDGE_VERT, EDGE_FRAG);

    // Face pass: positions come from the texture via gl_VertexID, so the VAO
    // only holds the element buffer (no vertex attributes).
    this.faceVao = createVao(gl);
    this.faceElements = uploadElements(gl, topology.faceIndices);
    gl.bindVertexArray(this.faceVao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.faceElements);

    // Edge pass: each drawn crease becomes a 2-triangle screen-space ribbon (6
    // vertices), interleaved as [this, a, b, side, assignment]. Keep F/U in
    // this display buffer so visibility can change without rebuilding topology.
    // F remains hidden by default in the edge shader.
    const { interleaved, vertexStart } = buildEdgeQuads(topology);
    this.edgeVertexCount = interleaved.length / EDGE_STRIDE;
    this.edgeVertexStart = vertexStart;
    this.edgeVao = createVao(gl);
    gl.bindVertexArray(this.edgeVao);
    this.edgeBuffer = uploadFloats(gl, interleaved);
    const stride = EDGE_STRIDE * 4;
    for (const [name, offset] of EDGE_ATTRS) {
      const loc = gl.getAttribLocation(this.edgeProgram, name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, stride, offset * 4);
    }

    gl.bindVertexArray(null);
  }

  render(
    camera: CameraUniforms,
    settings: RenderSettings,
    target: WebGLFramebuffer | null,
    options: MeshDrawOptions = {}
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    // The buffer may be larger than this render: it is shared by every inline
    // simulation window and sized to the largest of them, so each one draws into
    // the corner it needs.
    gl.viewport(0, 0, camera.width, camera.height);
    gl.enable(gl.DEPTH_TEST);
    // Equal-depth faces keep the first topology face instead of overwriting it.
    gl.depthFunc(gl.LESS);
    if (options.clear ?? true) {
      // Straight (non-premultiplied) alpha, matching the context GlCore requests,
      // so the colour is left alone and only the alpha decides what shows through
      // — except at zero alpha, which clears to transparent *black* rather than to
      // the background colour nothing is going to show.
      //
      // Under straight alpha the two are the same picture, because the colour of a
      // fully transparent pixel is never read. WebKit reads it anyway: it
      // composites the drawing buffer as premultiplied whatever the context
      // attribute asked for, so `(r, g, b, 0)` reaches the page as `r, g, b`
      // *added* to whatever is behind the canvas. That is what put a grey
      // rectangle behind the welcome screen's figure on iOS Safari — `--bg-canvas`
      // #1b1f27 summed with the page's #282c34, measured as exactly #434b5b, and a
      // white one under the light theme, where the sum clips.
      //
      // Zeroing the colour is a no-op wherever the attribute is honoured, and the
      // only spelling that reads as "nothing here" under both interpretations.
      const backgroundAlpha = settings.backgroundAlpha ?? 1;
      const background = backgroundAlpha > 0 ? settings.background : TRANSPARENT;
      gl.clearColor(background[0], background[1], background[2], backgroundAlpha);
      gl.clearDepth(1);
      // Scissored to the viewport, because `clear` otherwise ignores it and
      // covers the whole shared buffer — and that buffer is grow-only, sized to
      // the largest window ever opened. Unscissored, one deep zoom pins it at
      // 2048x2048 and every later render pays a full-buffer clear of a
      // multisampled colour buffer plus depth, whatever size the window drawing
      // is: measured flat at ~7.5ms per render across a 23x range of viewport
      // areas in WebKit, against ~2.8ms at a 512x512 buffer. Chromium hides it
      // behind a fast-clear path, which is why this only ever showed up on
      // Safari and the desktop shell.
      //
      // Safe because the viewport rect is the only part anyone reads: the frame
      // leaves through `createImageBitmap(canvas, 0, h - height, width, height)`,
      // exactly this rect. Keeping a previous window's pixels out of this one's
      // crop is what the clear is for, and clearing the crop does that.
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, camera.width, camera.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
    }

    const translucent = settings.faceAlpha < 1;
    if (settings.showFaces) {
      if (translucent) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      } else {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
      gl.bindVertexArray(this.faceVao);
      gl.useProgram(this.faceProgram);
      this.bindCommon(this.faceProgram, this.faceUniforms, camera);
      this.setVec3(this.faceProgram, this.faceUniforms, 'u_frontColor', settings.frontColor);
      this.setVec3(this.faceProgram, this.faceUniforms, 'u_backColor', settings.backColor);
      this.setVec3(this.faceProgram, this.faceUniforms, 'u_lightDir', settings.lightDir);
      this.setFloat(this.faceProgram, this.faceUniforms, 'u_lighting', settings.lighting ? 1 : 0);
      this.setFloat(this.faceProgram, this.faceUniforms, 'u_diagramStyle', settings.diagramStyle ? 1 : 0);
      this.setFloat(this.faceProgram, this.faceUniforms, 'u_alpha', settings.faceAlpha);
      this.setFloat(this.faceProgram, this.faceUniforms, 'u_normalsMode', settings.colorMode === 'normals' ? 1 : 0);
      this.setFloat(
        this.faceProgram,
        this.faceUniforms,
        'u_strainMode',
        settings.colorMode === 'strain' ? 1 : 0
      );
      this.setFloat(
        this.faceProgram,
        this.faceUniforms,
        'u_strainClip',
        settings.strainClip ?? 5
      );
      const first = clampRange(options.faceRange?.start ?? 0, this.faceCount);
      const count = clampRange(
        options.faceRange?.count ?? this.faceCount - first,
        this.faceCount - first
      );
      // UNSIGNED_INT indices, so the byte offset is four per index.
      if (count > 0) gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, first * 4);
    }

    if (settings.showEdges && this.edgeVertexCount > 0) {
      // Crease width in device pixels; scaled up a touch on hi-dpi so it reads
      // at the same on-screen weight, then by the frame if these settings ask
      // for it. camera.width is device px.
      const ink = rasterCreaseInk(settings, camera.width, camera.height);
      if (ink.alpha < 1) {
        gl.enable(gl.BLEND);
        // Colour blends against what is behind, but coverage must not: scaling
        // the frame's own alpha by a faded crease's would punch a hole through
        // the paper on a transparent-backed window.
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        // A crease this faint has nothing to occlude, and writing depth would
        // order the translucent ribbons against each other.
        gl.depthMask(false);
      } else {
        gl.disable(gl.BLEND);
        gl.depthMask(settings.creaseWritesDepth ?? true);
      }
      gl.bindVertexArray(this.edgeVao);
      gl.useProgram(this.edgeProgram);
      this.bindCommon(this.edgeProgram, this.edgeUniforms, camera);
      this.setVec3(this.edgeProgram, this.edgeUniforms, 'u_mountainColor', settings.mountainColor);
      this.setVec3(this.edgeProgram, this.edgeUniforms, 'u_valleyColor', settings.valleyColor);
      this.setVec3(this.edgeProgram, this.edgeUniforms, 'u_borderColor', settings.borderColor);
      this.setVec3(this.edgeProgram, this.edgeUniforms, 'u_facetColor', settings.facetColor??DEFAULT_FACET_COLOR);
      this.setVec3(this.edgeProgram, this.edgeUniforms, 'u_unassignedColor', settings.unassignedColor??DEFAULT_UNASSIGNED_COLOR);
      this.setFloat(this.edgeProgram, this.edgeUniforms, 'u_diagramStyle', settings.diagramStyle ? 1 : 0);
      this.setVec3(this.edgeProgram, this.edgeUniforms, 'u_diagramInkColor', settings.diagramInkColor??DEFAULT_DIAGRAM_INK);
      gl.uniform1iv(this.location(this.edgeProgram,this.edgeUniforms,'u_edgeVisible'),new Int32Array([0,1,2,3,4].map(assignment=>edgeAssignmentVisible(assignment,settings)?1:0)));
      this.setVec3(this.edgeProgram, this.edgeUniforms, 'u_creasePlaneNormal', settings.creasePlaneNormal ?? [0,0,0]);
      this.setFloat(this.edgeProgram, this.edgeUniforms, 'u_halfWidthPx', ink.widthPx * 0.5);
      this.setFloat(this.edgeProgram, this.edgeUniforms, 'u_alpha', ink.alpha);
      this.setFloat(
        this.edgeProgram,
        this.edgeUniforms,
        'u_depthBias',
        settings.creaseDepthBias ?? DEFAULT_CREASE_DEPTH_BIAS
      );
      // Dash runs are lengths along the crease in the same device pixels, so a
      // shrinking crease has to take its pattern with it or a thumbnail reads as
      // two long dashes rather than as a dashed line.
      this.setDash(settings.creaseDash, creaseFrameScale(settings, camera.width, camera.height));
      const edges = this.edgeVertexStart.length - 1;
      const firstEdge = clampRange(options.edgeRange?.start ?? 0, edges);
      const edgeCount = clampRange(options.edgeRange?.count ?? edges - firstEdge, edges - firstEdge);
      const firstVertex = this.edgeVertexStart[firstEdge]!;
      const vertexCount = this.edgeVertexStart[firstEdge + edgeCount]! - firstVertex;
      if (vertexCount > 0) gl.drawArrays(gl.TRIANGLES, firstVertex, vertexCount);
    }

    gl.depthMask(true);
    // Back to the state GlCore established at context creation. The solver's
    // compute passes share this context and never set blending themselves, so a
    // pass left enabled here would silently blend the next solve step into the
    // last one instead of replacing it.
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.faceProgram);
    gl.deleteProgram(this.edgeProgram);
    gl.deleteBuffer(this.faceElements);
    gl.deleteBuffer(this.edgeBuffer);
    gl.deleteVertexArray(this.faceVao);
    gl.deleteVertexArray(this.edgeVao);
  }

  private bindCommon(
    program: WebGLProgram,
    cache: Map<string, WebGLUniformLocation | null>,
    camera: CameraUniforms
  ): void {
    const gl = this.gl;
    // Position textures live in the solver's GlCore; bind them to units 0/1.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.core.getTexture(this.positionTextures.position));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.core.getTexture(this.positionTextures.original));
    // Unit 2 carries the velocity texture, whose alpha is the per-node strain the
    // strain colour mode reads. Bound for every pass so the face program can
    // sample it without a separate binding path.
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.core.getTexture(this.positionTextures.velocity));
    this.setInt(program, cache, 'u_lastPosition', 0);
    this.setInt(program, cache, 'u_originalPosition', 1);
    this.setInt(program, cache, 'u_lastVelocity', 2);
    this.setInt(program, cache, 'u_textureDim', this.textureDim);
    this.setVec3(program, cache, 'u_center', camera.center);
    this.setMat3(program, cache, 'u_view', camera.rotation);
    this.setFloat(program, cache, 'u_scale', camera.scale);
    this.setVec2(program, cache, 'u_viewport', [camera.width, camera.height]);
    this.setFloat(program, cache, 'u_depthRange', camera.depthRange);
    this.setFloat(program, cache, 'u_camDist', camera.camDist);
  }

  private setDash(dash: CreaseDash | undefined, scale: number): void {
    const { runs, counts } = packCreaseDash(dash);
    if (scale !== 1) {
      for (let i = 0; i < runs.length; i += 1) runs[i] = (runs[i] ?? 0) * scale;
    }
    const gl = this.gl;
    gl.uniform1fv(this.location(this.edgeProgram, this.edgeUniforms, 'u_dashRuns'), runs);
    gl.uniform1iv(this.location(this.edgeProgram, this.edgeUniforms, 'u_dashCount'), counts);
  }

  private location(
    program: WebGLProgram,
    cache: Map<string, WebGLUniformLocation | null>,
    name: string
  ): WebGLUniformLocation | null {
    let location = cache.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(program, name);
      cache.set(name, location);
    }
    return location;
  }

  private setInt(p: WebGLProgram, c: Map<string, WebGLUniformLocation | null>, n: string, v: number): void {
    this.gl.uniform1i(this.location(p, c, n), v);
  }
  private setFloat(p: WebGLProgram, c: Map<string, WebGLUniformLocation | null>, n: string, v: number): void {
    this.gl.uniform1f(this.location(p, c, n), v);
  }
  private setVec2(p: WebGLProgram, c: Map<string, WebGLUniformLocation | null>, n: string, v: [number, number]): void {
    this.gl.uniform2f(this.location(p, c, n), v[0], v[1]);
  }
  private setVec3(
    p: WebGLProgram,
    c: Map<string, WebGLUniformLocation | null>,
    n: string,
    v: readonly [number, number, number]
  ): void {
    this.gl.uniform3f(this.location(p, c, n), v[0], v[1], v[2]);
  }
  /**
   * `Mat3` is row-major and GLSL's `mat3` is column-major, so this transposes on
   * the way in — the one place the two conventions meet. WebGL2 supports the
   * transpose flag (WebGL1 did not), so no shuffled copy is made per frame.
   */
  private setMat3(
    p: WebGLProgram,
    c: Map<string, WebGLUniformLocation | null>,
    n: string,
    v: Mat3
  ): void {
    this.gl.uniformMatrix3fv(this.location(p, c, n), true, v as unknown as number[]);
  }
}

function compile(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create mesh render program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'unknown link error';
    gl.deleteProgram(program);
    throw new Error(`Mesh render program failed to link: ${info}`);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`Mesh shader failed to compile: ${info}`);
  }
  return shader;
}

function uploadElements(gl: WebGL2RenderingContext, data: Uint32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Unable to create element buffer');
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function uploadFloats(gl: WebGL2RenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Unable to create attribute buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function createVao(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Unable to create VAO for the mesh renderer');
  return vao;
}
