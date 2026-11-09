import { distance, epsilonFor, parameter, pointOnSegment, segmentIntersection } from '../core/geometry';
import type { Doc, Point, Segment } from '../core/types';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {overlappingSegmentPairs} from '../core/segmentPairs';

export interface EditableSplitResult {
  doc: Doc;
  /** Each original ID maps to all its resulting pieces, including unchanged IDs. */
  descendants: Map<string, string[]>;
}

interface Cut { t: number; point: Point }
const finitePoint = (point: Point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

/**
 * Turn editor intersections into real independently editable segments. Unlike
 * the solver's splitIntersections, this includes A lines and never merges
 * overlapping assignments, removes source lines or rejects overlap conflicts.
 * Document validation belongs to the caller's atomic commit.
 */
export function splitEditableSegmentsWithMap(doc: Doc): EditableSplitResult {
  return splitEditable(doc,true);
}

function splitEditable(doc:Doc,trackDescendants:boolean):EditableSplitResult {
  if(hasMaterialTopology(doc)){
    const material=inspectMaterialTopology(doc);
    if(!material.ok)throw new Error(material.reason);
    // Independent material banks may share coordinates. Generic intersection
    // splitting must not weld or renumber their face-corner occurrences.
    return {doc,descendants:trackDescendants?new Map(doc.segments.map(s=>[s.id,[s.id]])):new Map()};
  }
  const source = doc.segments, eps = epsilonFor(doc);
  const descendants = new Map<string, string[]>();
  const lengths = source.map(segment => distance(segment.a, segment.b));
  const cuts: (Cut[]|undefined)[] = [];

  // All original endpoints are registered first so a T join preserves the
  // existing endpoint rather than a slightly different computed coordinate.
  const vertices: Point[] = [], buckets = new Map<string, number[]>();
  const vertex = (point: Point): Point => {
    const x = Math.floor(point[0] / eps), y = Math.floor(point[1] / eps);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const index of buckets.get(`${x + dx},${y + dy}`) ?? []) {
        if (distance(vertices[index], point) <= eps) return vertices[index];
      }
    }
    const copy: Point = [...point], index = vertices.length, key = `${x},${y}`;
    vertices.push(copy);
    const entries = buckets.get(key);
    if (entries) entries.push(index); else buckets.set(key, [index]);
    return copy;
  };
  source.flatMap(segment => [segment.a, segment.b]).filter(finitePoint)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(vertex);

  const addCut = (index: number, point: Point) => {
    const length = lengths[index];
    if (!Number.isFinite(length) || length <= eps) return;
    const canonical = vertex(point), t = parameter(canonical, source[index]);
    // Endpoints are already vertices, and tiny fragments are not generated.
    if (t * length <= eps || (1 - t) * length <= eps) return;
    (cuts[index]??=[]).push({ t, point: canonical });
  };
  for (const [i,j] of overlappingSegmentPairs(source,eps)) {
    const hit = segmentIntersection(source[i], source[j], eps);
    if (hit) {
      addCut(i, hit.point);
      addCut(j, hit.point);
    } else {
      // Collinear overlap is split at its finite endpoints without merging
      // either source segment or changing mountain/valley/angle semantics.
      for (const point of [source[j].a, source[j].b]) if (pointOnSegment(point, source[i], eps)) addCut(i, point);
      for (const point of [source[i].a, source[i].b]) if (pointOnSegment(point, source[j], eps)) addCut(j, point);
    }
  }

  let usedIds:Set<string>|undefined;
  const splitId = (sourceId: string, piece: number): string => {
    // Most imported CPs already have explicit crossings. Allocate the identity
    // table only if a new piece is actually needed.
    if(!usedIds){usedIds=new Set(source.map(segment=>segment.id));for(const object of doc.objects??[])usedIds.add(object.id);}
    const base = `${sourceId}::split:${piece}`;
    let id = base, suffix = 2;
    while (usedIds.has(id)) id = `${base}:${suffix++}`;
    usedIds.add(id);
    return id;
  };
  let segments:Segment[]|undefined;
  source.forEach((segment, index) => {
    const accepted: Cut[] = [];
    const lineCuts=cuts[index]??[];
    lineCuts.sort((a, b) => a.t - b.t);
    for (const cut of lineCuts) {
      const previous = accepted.at(-1);
      if (!previous || ((cut.t - previous.t) * lengths[index] > eps && distance(cut.point, previous.point) > eps)) accepted.push(cut);
    }
    if (!accepted.length) {
      segments?.push(segment);
      if(trackDescendants)descendants.set(segment.id, [segment.id]);
      return;
    }
    segments??=source.slice(0,index);
    const points = [segment.a, ...accepted.map(cut => cut.point), segment.b];
    const ids: string[] = [];
    for (let piece = 1; piece < points.length; piece++) {
      const id = piece === 1 ? segment.id : splitId(segment.id, piece);
      segments.push({ ...segment, id, a: [...points[piece - 1]], b: [...points[piece]] });
      ids.push(id);
    }
    if(trackDescendants)descendants.set(segment.id, ids);
  });
  return { doc: segments ? { ...doc, segments } : doc, descendants };
}

export function splitEditableSegments(doc: Doc): Doc {
  return splitEditable(doc,false).doc;
}
