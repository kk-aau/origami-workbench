export const GRID_MIN = 1;
export const GRID_MAX = 512;
export const DEFAULT_GRID_DIVISIONS = 4;

export function clampGridDivisions(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRID_DIVISIONS;
  return Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(value)));
}

export function adjustGridDivisions(value: number, direction: 1 | -1): number {
  const current = clampGridDivisions(value);
  return clampGridDivisions(direction > 0 ? current * 2 : Math.max(GRID_MIN, Math.floor(current / 2)));
}
