import type { FoldProfile, SimulatorDiagnostics, SimulatorOptions } from './types.js';
import type { OrigamiModel } from './model.js';

/** A portable pose at rest, not an integrator/momentum checkpoint. */
export interface SolverPoseSnapshot {
  version: 1;
  modelSignature: string;
  /** Absolute radius-normalised coordinates, xyz for every prepared vertex. */
  positions: number[];
  /** Exact solver displacement from rest; avoids subtraction/round-trip loss. */
  displacements: number[];
  /** Unwrapped radians, in prepared crease order (including flat panels). */
  creaseAngles: number[];
  pins: Array<{index:number;position:[number,number,number]}>;
}

/** Complete canonical geometry, not merely matching vertex/face counts. The
 * same immutable string can be shared by every in-memory undo snapshot. */
export function solverPoseModelSignature(model: OrigamiModel): string {
  const prepared=model.prepared;
  return JSON.stringify([
    Array.from(prepared.originalPositions),Array.from(model.originalPositions),
    prepared.edgesVertices,prepared.edgesAssignment,prepared.edgesFoldAngle,
    Array.from(prepared.indices),prepared.facesVertices,
    prepared.creaseParams.map(c=>[c.face1,c.vertex1,c.face2,c.vertex2,c.edge,c.targetAngle]),
  ]);
}

/** Validate imported JSON without a live solver. Model identity and the exact
 * crease count are checked again by restorePose. Always returns owned arrays. */
export function validateSolverPoseSnapshot(value: unknown): SolverPoseSnapshot | null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  const finiteArray=(input:unknown,length?:number):input is number[]=>{
    if(!Array.isArray(input)||(length!==undefined&&input.length!==length))return false;
    for(let i=0;i<input.length;i++)if(typeof input[i]!=='number'||!Number.isFinite(input[i])||!Number.isFinite(Math.fround(input[i])))return false;
    return true;
  };
  if(raw.version!==1||typeof raw.modelSignature!=='string'||!raw.modelSignature||
    !finiteArray(raw.positions)||!raw.positions.length||raw.positions.length%3!==0||
    !finiteArray(raw.displacements,raw.positions.length)||
    !finiteArray(raw.creaseAngles)||!Array.isArray(raw.pins))return null;
  const positions=raw.positions.slice(),count=positions.length/3,pins:SolverPoseSnapshot['pins']=[],seen=new Set<number>();
  for(const item of raw.pins){
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    const pin=item as Record<string,unknown>,index=pin.index;
    if(typeof index!=='number'||!Number.isInteger(index)||index<0||index>=count||seen.has(index)||!finiteArray(pin.position,3))return null;
    // A persisted fixed point must agree with the saved geometry. Otherwise
    // merely resuming would jump it to an unrelated imported coordinate.
    if(pin.position.some((v,axis)=>Math.abs(v-positions[index*3+axis]!)>1e-5*Math.max(1,Math.abs(v),Math.abs(positions[index*3+axis]!))))return null;
    seen.add(index);pins.push({index,position:[pin.position[0]!,pin.position[1]!,pin.position[2]!]});
  }
  return {version:1,modelSignature:raw.modelSignature,positions,displacements:raw.displacements.slice(),creaseAngles:raw.creaseAngles.slice(),pins};
}

/**
 * The seam every solver implementation sits behind.
 *
 * There are two implementations planned: {@link ReferenceSolver} (CPU,
 * headless, the oracle and the no-WebGL2 fallback) and a WebGL2 backend that
 * keeps all state in GPU textures. They differ enormously in how they hold
 * state, so the interface is deliberately written around *commands and
 * readback* rather than around shared buffers:
 *
 * - `step` never returns data. The GPU backend's whole advantage is that
 *   positions stay on the GPU, and a signature that returned positions would
 *   force a pipeline-stalling readback on every call.
 * - `readPositions` fills a caller-owned buffer instead of allocating, so a
 *   60fps loop does not generate garbage.
 * - `readDiagnostics` is separate from stepping because on GPU it is a
 *   reduction that we only want to run every few frames.
 */
export interface SolverBackend {
  /** Advance the simulation by `count` steps. */
  step(count: number): void;

  setFoldPercent(percent: number): void;
  setFoldProfile(profile: FoldProfile | null): void;
  setMaterial(options: Partial<SimulatorOptions>): void;

  /**
   * Hold a prepared-mesh vertex at an absolute position in the solver's
   * radius-normalised 3D coordinates. `null` releases that vertex without
   * resetting the rest of the sheet. The default Euler integrator supports
   * this; implementations must reject unsupported integrators explicitly.
   */
  setVertexConstraint(index: number, absoluteTarget: readonly [number, number, number] | null): void;

  /**
   * Translate the current mesh centroid to `target` and drain its kinetic
   * energy, including positional history. Keeps the folded shape, rest metric,
   * crease-angle history, fold target and step count. Release all vertex
   * constraints before calling; invalid requests must leave the solver intact.
   */
  recenter(target: readonly [number, number, number]): void;

  /** Capture a JSON-safe pose including persistent pins and crease branches. */
  capturePose(): SolverPoseSnapshot;

  /** Atomically restore a compatible pose at rest: synchronise all position
   * history, clear velocity and replace pins. Current material, fold target,
   * original rest metric and step counter are intentionally unchanged. */
  restorePose(snapshot: unknown): void;

  /** Return to the flat rest state and zero all velocities. */
  reset(): void;

  /**
   * Zero the dynamic velocities while keeping the current (folded) positions.
   * A backstop for the explicit integrator going unstable mid-fold: crease
   * (bending) stiffness is not in the axial-only stable-timestep bound, so a
   * stiff fold can inject energy faster than damping removes it and the mesh
   * explodes off-screen. Draining the runaway velocity lets the stable axial
   * springs pull the mesh back instead. This is upstream Origami Simulator's
   * `shouldZeroDynamicVelocity` hook. No-op semantics for a healthy solve.
   */
  arrestDynamics(): void;

  /**
   * Copy current absolute vertex positions into `into` (length
   * `vertexCount * 3`). Returns the number of floats written.
   */
  readPositions(into: Float32Array): number;

  /** Copy unwrapped crease-angle history in radians, in prepared crease order.
   * Read-only; use with current geometry to disambiguate mountain/valley turns. */
  readCreaseAngles(into: Float32Array): number;

  /** Per-vertex RGB strain colours, same contract as {@link readPositions}. */
  readColors(into: Float32Array): number;

  /**
   * Per-vertex mean axial strain as a fraction, one float each. Defined
   * identically on both backends — the sum of `|current/rest - 1|` over the
   * node's beams divided by their count, which is `velocityCalc`'s `nodeError`
   * on the GPU. Returns the number of floats written.
   *
   * Separate from {@link readColors} because the colour ramp needs a clip
   * threshold that belongs to the renderer, not the solver: the mesh renderer's
   * `strainClip` is a render setting the user can change, so a backend that
   * baked one in could not answer for the current view.
   */
  readStrain(into: Float32Array): number;

  readDiagnostics(): SimulatorDiagnostics;

  /**
   * Largest absolute vertex velocity component. The scheduler uses this for
   * convergence detection; it is separate from `readDiagnostics` because it is
   * needed every tick and must stay cheap.
   */
  maxVelocity(): number;

  /** Steps executed since construction or the last `reset`. */
  readonly stepCount: number;

  dispose(): void;
}

/** What a backend needs to describe itself to the scheduler and the UI. */
export interface SolverBackendInfo {
  /** Stable identifier surfaced in diagnostics, e.g. 'reference' | 'webgl2'. */
  readonly id: string;
  readonly vertexCount: number;
  readonly faceCount: number;
}
