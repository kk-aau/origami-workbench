import type { Doc, FoldGraph, Point } from '../core/types';
import { validateFlatFoldSettings } from '../core/flatFoldSettings.mjs';
import { buildFold } from '../core/geometry';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {materialAreaRings,materialOuterContour} from '../core/materialWeak';

/** A pending crease can leave an outward-and-back branch in the face walk.
 * Persist its area boundary, retaining winding and graph identities; the
 * editable crease itself remains in the CP until the user completes it. */
function startingContour(doc:Doc,graph:FoldGraph,index:number):number[] {
  return hasMaterialTopology(doc)?materialOuterContour(graph,index):materialAreaRings(graph,index)[0];
}

/** Exact cyclic identity: conservative across topology edits, independent of numbering/winding. */
function faceKey(points: Point[]): string {
  const keys = points.map(p => JSON.stringify(p));
  let first = 0;
  for (let i = 1; i < keys.length; i++) if (keys[i] < keys[first]) first = i;
  const forward = keys.slice(first).concat(keys.slice(0, first)).join(';');
  const reverse = keys.map((_, i) => keys[(first - i + keys.length) % keys.length]).join(';');
  return forward < reverse ? forward : reverse;
}

export function resolveStartingFace(doc: Doc, graph: FoldGraph): { face: number; stale: boolean } {
  if (!doc.flatFold) {
    if(hasMaterialTopology(doc)){
      const material=inspectMaterialTopology(doc);
      return material.ok?{face:material.startingFace??0,stale:false}:{face:0,stale:true};
    }
    return { face: 0, stale: false };
  }
  validateFlatFoldSettings(doc.flatFold);
  const wanted = faceKey(doc.flatFold.startingFace);
  const matches = (graph.faces_vertices ?? []).flatMap((_, i) => faceKey(startingContour(doc,graph,i).map(v => graph.vertices_coords[v])) === wanted ? [i] : []);
  if(doc.flatFold.materialFace!==undefined){
    const material=hasMaterialTopology(doc)?inspectMaterialTopology(doc):null;
    return material?.ok&&matches.includes(doc.flatFold.materialFace)?{face:doc.flatFold.materialFace,stale:false}:{face:0,stale:true};
  }
  return matches.length === 1 ? { face: matches[0], stale: false } : { face: 0, stale: true };
}

/** Ordinary projects use contour identity. Indexed material projects also bind
 * the face index, so coincident copies never replace the explicitly chosen face. */
export function setStartingFace(doc: Doc, index: number,graph:FoldGraph=buildFold(doc).graph): Doc {
  const face = graph.faces_vertices?.[index];
  if (!Number.isInteger(index) || index < 0 || !face) throw new Error('起始面不存在，请重新选择。');
  const startingFace = startingContour(doc,graph,index).map(v => [...graph.vertices_coords[v]] as Point);
  validateFlatFoldSettings({ startingFace });
  const indexed=hasMaterialTopology(doc);
  if (doc.flatFold && faceKey(doc.flatFold.startingFace) === faceKey(startingFace)&&(indexed?doc.flatFold.materialFace===index:doc.flatFold.materialFace===undefined)) return doc;
  return { ...doc, flatFold: { startingFace,...(indexed?{materialFace:index}:{}) } };
}

export function clearStartingFace(doc: Doc): Doc {
  if (!doc.flatFold) return doc;
  const { flatFold: _settings, ...rest } = doc;
  return rest;
}
