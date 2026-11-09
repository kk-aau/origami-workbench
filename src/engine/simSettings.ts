/** Settings shared by the document controls and the isolated solver view. */
export interface SimulationSolverSettings {
  axialStiffness: number;
  faceStiffness: number;
  creaseStiffness: number;
  panelStiffness: number;
  damping: number;
  timeStepScale: number;
  integrationType: 'euler' | 'verlet';
  /** 0 keeps the backend's existing automatic cap (GPU 96 / CPU 240). */
  maxStepsPerFrame: number;
}

export const DEFAULT_SIMULATION_SOLVER_SETTINGS: Readonly<SimulationSolverSettings> = Object.freeze({
  axialStiffness: 20, faceStiffness: 0.2, creaseStiffness: 0.7, panelStiffness: 0.7,
  damping: 0.5, timeStepScale: 0.35, integrationType: 'euler', maxStepsPerFrame: 0,
});

/** Flexible paper reduces out-of-plane panel bending only. In-plane lengths,
 * triangle angles and the actual scored hinges retain their normal strength. */
export const FLEXIBLE_PAPER_SOLVER_SETTINGS:Readonly<SimulationSolverSettings>=Object.freeze({
  ...DEFAULT_SIMULATION_SOLVER_SETTINGS,panelStiffness:.08,
});

const numericRanges = {
  axialStiffness: [10, 100], faceStiffness: [0, 5], creaseStiffness: [0, 3],
  panelStiffness: [0, 3], damping: [0.01, 1], timeStepScale: [0.05, 1],
} as const;
const keys = Object.keys(DEFAULT_SIMULATION_SOLVER_SETTINGS) as (keyof SimulationSolverSettings)[];

/** Reject the entire update on invalid input; never coerce, clip, or partly apply it. */
export function mergeSimulationSolverSettings(current: SimulationSolverSettings, patch: unknown): SimulationSolverSettings | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const input = patch as Record<string, unknown>;
  if (Object.keys(input).some(key => !keys.includes(key as keyof SimulationSolverSettings))) return null;
  const next = { ...current, ...input };
  for (const [key, [minimum, maximum]] of Object.entries(numericRanges)) {
    const value = next[key as keyof SimulationSolverSettings];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) return null;
  }
  if (next.integrationType !== 'euler' && next.integrationType !== 'verlet') return null;
  const cap = next.maxStepsPerFrame;
  if (typeof cap !== 'number' || !Number.isInteger(cap) || (cap !== 0 && (cap < 8 || cap > 4000 || cap % 8 !== 0))) return null;
  return next as SimulationSolverSettings;
}

/** Validate a complete settings snapshot, including every required field. */
export function normalizeSimulationSolverSettings(value: unknown): SimulationSolverSettings | null {
  if (!value || typeof value !== 'object' || keys.some(key => !Object.hasOwn(value, key))) return null;
  return mergeSimulationSolverSettings({ ...DEFAULT_SIMULATION_SOLVER_SETTINGS }, value);
}

export function simulationSolverFrameStepCap(settings: SimulationSolverSettings, backend: 'webgl2' | 'cpu'): number {
  return settings.maxStepsPerFrame || (backend === 'webgl2' ? 96 : 240);
}

/** A step animation has a forward timeline; ordinary simulation can reverse mountain/valley folds. */
export function simulationFoldProgress(value: number, animation = false): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(animation ? 0 : -1, Math.min(1, value));
}
