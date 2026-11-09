import type { FlatFoldResult } from '../core/types';
import {copyCompletedModelSurface} from './modelOverlapTask';

/** Result history is deliberately separate from source Doc history. */
export interface FoldedModelHistory {
  past: FlatFoldResult[];
  present: FlatFoldResult | null;
  future: FlatFoldResult[];
  /** Monotonic generation, including undo and replacement, for asynchronous results. */
  revision: number;
}
export type FoldedModelAction =
  | { type: 'replace'; result: FlatFoldResult | null }
  | { type: 'commit'; result: FlatFoldResult }
  | { type: 'analysis'; revision: number; result: FlatFoldResult }
  | { type: 'undo' | 'redo' };

export function emptyFoldedModelHistory(): FoldedModelHistory {
  return { past: [], present: null, future: [], revision: 0 };
}

/** Geometry remains an isolated editable snapshot; only immutable, completed
 * display data can follow that exact snapshot through in-memory history. */
function cloneResult(result:FlatFoldResult):FlatFoldResult {
  const copy=structuredClone(result);copyCompletedModelSurface(result,copy);return copy;
}

/** Until model persistence exists, any editable result retained in history is unsaved. */
export function hasUnsavedModelEdits(state: FoldedModelHistory): boolean {
  return !!state.present?.geometry.modified || state.past.some(r => r.geometry.modified) || state.future.some(r => r.geometry.modified);
}

/** A layer calculation may change caches/status, never the editable model itself. */
function sameModel(a: FlatFoldResult, b: FlatFoldResult): boolean {
  const identity = (r: FlatFoldResult) => ({
    status: r.geometry.status,
    vertices: r.geometry.vertices,
    faces: r.geometry.faces,
    startingFace: r.geometry.startingFace,
    modified: r.geometry.modified,
    graph: r.geometry.graph && {
      vertices: r.geometry.graph.vertices_coords,
      faces: r.geometry.graph.faces_vertices,
      edges: r.geometry.graph.edges_vertices,
      assignments: r.geometry.graph.edges_assignment,
      angles: r.geometry.graph.edges_foldAngle,
      // Parallel slit banks can share endpoints but belong to different faces.
      // Missing incidence on either side must not erase an existing identity.
      faceEdges: r.geometry.graph.faces_edges,
      edgeFaces: r.geometry.graph.edges_faces,
      faceNeighbors: r.geometry.graph.faces_faces,
    },
  });
  return JSON.stringify(identity(a)) === JSON.stringify(identity(b));
}

/** One completed drag is one commit; previews must remain outside this reducer. */
export function foldedModelHistoryReducer(state: FoldedModelHistory, action: FoldedModelAction): FoldedModelHistory {
  if (action.type === 'replace') {
    return { past: [], present: action.result && cloneResult(action.result), future: [], revision: state.revision + 1 };
  }
  if (action.type === 'analysis') {
    if (!state.present || action.revision !== state.revision || !sameModel(state.present, action.result)) return state;
    // Enrich the current history entry, not an extra user-edit step.
    return { ...state, present: cloneResult(action.result), revision: state.revision + 1 };
  }
  if (action.type === 'commit') {
    if (!state.present || action.result.geometry.status !== 'ready') return state;
    if (JSON.stringify(state.present) === JSON.stringify(action.result)) return state;
    return {
      past: [...state.past.slice(-59), state.present],
      present: cloneResult(action.result), future: [], revision: state.revision + 1,
    };
  }
  if (action.type === 'undo' && state.past.length && state.present) {
    return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future], revision: state.revision + 1 };
  }
  if (action.type === 'redo' && state.future.length && state.present) {
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), revision: state.revision + 1 };
  }
  return state;
}
