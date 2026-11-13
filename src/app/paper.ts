import type { Doc, Point } from '../core/types';
import { textBounds } from './textLayout';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {overlappingSegmentPairs} from '../core/segmentPairs';
import {DEFAULT_PAPER_SIZE} from './paperDefaults';

export interface Bounds { x: number; y: number; width: number; height: number }
const positive = (value: number, fallback = 200): number => Number.isFinite(value) && value > 0 ? value : fallback;
const finitePoint = (p: unknown): p is Point => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const fallbackBounds = (doc: Doc): Bounds => ({ x: 0, y: 0, width: positive(doc.paper?.width), height: positive(doc.paper?.height) });

/** Stable construction lattice: editing or deleting boundary segments must not
 * change spacing, origin or rotation centre. Existing project dimensions win. */
export function getGridReferenceBounds(doc:Doc):Bounds{
  const dimension=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1_000_000?value:DEFAULT_PAPER_SIZE;
  return {x:0,y:0,width:dimension(doc.paper?.width),height:dimension(doc.paper?.height)};
}

/** Material loops have verified orientations. Nonzero fill preserves the union
 * of separate pieces even when their displayed CP positions overlap. */
export const paperFillRule=(doc:Doc):'nonzero'|'evenodd'=>hasMaterialTopology(doc)?'nonzero':'evenodd';

function boundsCollector(fallback:Bounds){
  let count=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  return {
    add([x,y]:Point){count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);},
    result(){
      if(!count)return fallback;
      const span=(min:number,max:number)=>Math.max(1,Math.min(Number.MAX_VALUE,max-min));
      return {x:minX,y:minY,width:span(minX,maxX),height:span(minY,maxY)};
    },
    get count(){return count;},
  };
}

/** Actual boundary origin is preserved, including all-negative drawings. */
export function getPaperBounds(doc: Doc): Bounds {
  const boundary=boundsCollector(fallbackBounds(doc));
  for(const segment of doc.segments)if(segment.assignment==='B'){if(finitePoint(segment.a))boundary.add(segment.a);if(finitePoint(segment.b))boundary.add(segment.b);}
  if(boundary.count)return boundary.result();
  return getDrawingBounds(doc);
}

/** Extent of every drawable endpoint; zero width/height is expanded to 1 mm. */
export function getDrawingBounds(doc: Doc): Bounds {
  // Accumulate endpoints directly; a million-line drawing must not allocate
  // and then discard two extra million-element arrays merely to fit its view.
  const points=boundsCollector(fallbackBounds(doc));
  for(const segment of doc.segments){if(finitePoint(segment.a))points.add(segment.a);if(finitePoint(segment.b))points.add(segment.b);}
  for (const o of doc.objects ?? []) {
    if (o.kind === 'circle'){points.add([o.center[0]-o.radius,o.center[1]-o.radius]);points.add([o.center[0]+o.radius,o.center[1]+o.radius]);}
    else if (o.kind === 'mark'){points.add(o.a);points.add(o.b);}
    // Conservative text extent for fit/export; text content is never geometry.
    else {const bounds=textBounds(o);points.add([bounds.x,bounds.y]);points.add([bounds.x+bounds.width,bounds.y+bounds.height]);}
  }
  return points.result();
}

/**
 * Closed boundary subpaths, suitable for SVG fill-rule="evenodd".
 * Boundary order and segment direction are immaterial. Open, branched,
 * degenerate or self-intersecting boundaries return '', never a fabricated box.
 */
export function paperPath(doc: Doc): string {
  if(hasMaterialTopology(doc)){
    const material=inspectMaterialTopology(doc);
    if(!material.ok)return '';
    return material.components.flatMap(c=>c.boundaryLoops).map(loop=>loop.map((v,i)=>`${i?'L':'M'} ${material.graph.vertices_coords[v].join(' ')}`).join(' ')+' Z').join(' ');
  }
  const boundary = doc.segments.filter(s => s.assignment === 'B');
  if (!boundary.length || boundary.some(s => !finitePoint(s.a) || !finitePoint(s.b))) return '';
  const bounds = getPaperBounds(doc);
  const eps = Math.max(1e-6, Math.min(1e-2, Math.max(bounds.width, bounds.height) * 1e-8));
  const vertices: Point[] = [], buckets = new Map<string, number[]>();
  const id = (point: Point): number => {
    const x = Math.floor(point[0] / eps), y = Math.floor(point[1] / eps);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const n of buckets.get(`${x + dx},${y + dy}`) ?? []) if (Math.hypot(vertices[n][0] - point[0], vertices[n][1] - point[1]) <= eps) return n;
    }
    const n = vertices.length; vertices.push([...point]);
    const key = `${x},${y}`; buckets.set(key, [...(buckets.get(key) ?? []), n]); return n;
  };
  const edges: [number, number][] = boundary.map(s => [id(s.a), id(s.b)]);
  const adjacent = vertices.map(() => [] as number[]);
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e]; if (a === b) return '';
    adjacent[a].push(e); adjacent[b].push(e);
  }
  if (adjacent.some(list => list.length !== 2)) return '';

  // Reject crossings/T touches between non-adjacent edges, including separate loops.
  // Query canonical endpoints, then retain the exact boundary test below.
  // Subdivided paper edges can number in the thousands on large imported CPs.
  const canonicalEdges=edges.map(([a,b])=>({a:vertices[a],b:vertices[b]}));
  for (const [i,j] of overlappingSegmentPairs(canonicalEdges,eps*2)) {
    if (edges[i].some(v => edges[j].includes(v))) continue;
    const [a, b] = edges[i].map(v => vertices[v]), [c, d] = edges[j].map(v => vertices[v]);
    if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - eps || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - eps || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - eps || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - eps) continue;
    const side = (p: Point, q: Point, r: Point) => {
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const distance = ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / length;
      return Math.abs(distance) <= eps ? 0 : Math.sign(distance);
    };
    if (side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return '';
  }
  const visited = new Set<number>(), paths: string[] = [];
  for (let seed = 0; seed < edges.length; seed++) {
    if (visited.has(seed)) continue;
    const start = edges[seed][0], loop: number[] = [start];
    let vertex = start, edge = seed;
    while (!visited.has(edge)) {
      visited.add(edge);
      const [a, b] = edges[edge]; vertex = a === vertex ? b : a;
      if (vertex === start) break;
      loop.push(vertex); edge = adjacent[vertex].find(e => e !== edge)!;
    }
    if (vertex !== start || loop.length < 3) return '';
    // Translate the area calculation to the first point for precision at distant origins.
    const origin = vertices[loop[0]];
    let area2 = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = vertices[loop[i]], b = vertices[loop[(i + 1) % loop.length]];
      area2 += (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
    }
    if (!Number.isFinite(area2) || Math.abs(area2) <= eps * eps) return '';
    paths.push(loop.map((v, i) => `${i ? 'L' : 'M'}${vertices[v][0]},${vertices[v][1]}`).join(' ') + ' Z');
  }
  return paths.join(' ');
}

/** Pixel dimensions, minimum 1px, maximum 2000px per side and 4 megapixels. */
export function rasterSize(width: number, height: number, maxSide = 2000): { width: number; height: number } {
  const w = positive(width, 1), h = positive(height, 1);
  const limit = Math.max(1, Math.min(2000, Math.floor(positive(maxSide, 2000))));
  const largest = Math.max(w, h);
  // Divide before multiplying: width*height can overflow, and very thin ratios may underflow safely to 0.
  return { width: Math.max(1, Math.min(limit, Math.round((w / largest) * limit))), height: Math.max(1, Math.min(limit, Math.round((h / largest) * limit))) };
}
