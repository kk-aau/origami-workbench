import { voronoiEdges } from '../app/voronoi';
import type { Point } from '../core/types';
import type { VoronoiResult } from '../app/voronoiTask';
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<Point[]>) => void) | null; postMessage(result: VoronoiResult): void };
scope.onmessage = event => {
  try { scope.postMessage({ status: 'ready', edges: voronoiEdges(event.data), error: '' }); }
  catch (error) { scope.postMessage({ status: 'error', edges: [], error: (error as Error).message }); }
};
