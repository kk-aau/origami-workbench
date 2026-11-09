import ear from 'rabbit-ear';
import {buildBoundaryRegions} from './boundaryRegions';
import {overlappingSegmentPairs} from './segmentPairs';
import {hasMaterialTopology,inspectMaterialTopology} from './materialTopology';
import { defaultAngle, validateDoc, type Doc, type FoldGraph, type Point, type Segment } from './types';

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const interpolate = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const epsilonFor = (doc: Doc) => Math.max(1e-6, Math.max(doc.paper.width, doc.paper.height) * 1e-8);
export function parameter(p: Point, s: Segment): number {
  const v = sub(s.b, s.a), d = v[0] ** 2 + v[1] ** 2;
  return d === 0 ? 0 : ((p[0] - s.a[0]) * v[0] + (p[1] - s.a[1]) * v[1]) / d;
}
export function pointOnSegment(p: Point, s: Segment, eps = 1e-6): boolean {
  const length = distance(s.a, s.b);
  if (length <= eps) return distance(p, s.a) <= eps;
  return Math.abs(cross(sub(p, s.a), sub(s.b, s.a))) <= eps * length && parameter(p, s) >= -eps / length && parameter(p, s) <= 1 + eps / length;
}
export interface Intersection { point: Point; t: number; u: number }
/** Unique non-parallel intersection, including T intersections and shared endpoints. */
export function segmentIntersection(a: Segment, b: Segment, eps = 1e-6): Intersection | null {
  const r = sub(a.b, a.a), s = sub(b.b, b.a), rl = Math.hypot(...r), sl = Math.hypot(...s);
  const denominator = cross(r, s);
  if (rl <= eps || sl <= eps || Math.abs(denominator) <= eps * Math.max(rl, sl)) return null;
  const delta = sub(b.a, a.a), t = cross(delta, s) / denominator, u = cross(delta, r) / denominator;
  if (t < -eps / rl || t > 1 + eps / rl || u < -eps / sl || u > 1 + eps / sl) return null;
  return { point: interpolate(a.a, a.b, Math.max(0, Math.min(1, t))), t, u };
}
export function collinearOverlap(a: Segment, b: Segment, eps = 1e-6): boolean {
  const length = distance(a.a, a.b);
  if (length <= eps || distance(b.a, b.b) <= eps) return false;
  if (Math.abs(cross(sub(b.a, a.a), sub(a.b, a.a))) > eps * length || Math.abs(cross(sub(b.b, a.a), sub(a.b, a.a))) > eps * length) return false;
  const p = [parameter(b.a, a), parameter(b.b, a)].sort((x, y) => x - y);
  return (Math.min(1, p[1]) - Math.max(0, p[0])) * length > eps;
}
export function polygonArea(points: Point[]): number {
  if (!points.length) return 0;
  // An absolute-coordinate shoelace sum can subtract two ~1e12 products
  // for a perfectly resolved small face. Keep the signed area local instead.
  const [x, y] = points[0];
  let sum = 0, correction = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const term = (p[0] - x) * (q[1] - y) - (q[0] - x) * (p[1] - y);
    const adjusted = term - correction, next = sum + adjusted;
    correction = (next - sum) - adjusted; sum = next;
  }
  return sum / 2;
}

export interface PlanarResult { segments: Segment[]; warnings: string[]; sourceIds: string[][] }
/** Splits geometry without editing source data; handles proper crossings, T joins and collinear overlap. */
export function splitIntersections(doc: Doc, includeAux = false): PlanarResult {
  validateDoc(doc);
  const eps = epsilonFor(doc), warnings: string[] = [];
  const source = doc.segments.filter(s => includeAux || s.assignment !== 'A');
  const params = source.map(() => [0, 1]);
  for (const [i,j] of overlappingSegmentPairs(source,eps)) {
    const hit = segmentIntersection(source[i], source[j], eps);
    if (hit) { params[i].push(Math.max(0, Math.min(1, hit.t))); params[j].push(Math.max(0, Math.min(1, hit.u))); }
    else {
      for (const p of [source[j].a, source[j].b]) if (pointOnSegment(p, source[i], eps)) params[i].push(Math.max(0, Math.min(1, parameter(p, source[i]))));
      for (const p of [source[i].a, source[i].b]) if (pointOnSegment(p, source[j], eps)) params[j].push(Math.max(0, Math.min(1, parameter(p, source[j]))));
    }
  }
  const segments: Segment[] = [], sourceIds: string[][] = [];
  // Spatial buckets plus neighbouring-cell search avoid rounding-boundary vertex duplication.
  const vertices: Point[] = [], buckets = new Map<string, number[]>();
  const vertex = (p: Point) => {
    const x = Math.floor(p[0] / eps), y = Math.floor(p[1] / eps);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of buckets.get(`${x + dx},${y + dy}`) ?? []) if (distance(vertices[i], p) <= eps) return i;
    const n = vertices.push(p) - 1, k = `${x},${y}`;
    buckets.set(k, [...(buckets.get(k) ?? []), n]); return n;
  };
  const edges = new Map<string, number>();
  source.forEach((s, i) => {
    if (distance(s.a, s.b) <= eps) { warnings.push(`已在计算副本中忽略零长线段 ${s.id}；原工程未修改。`); return; }
    const ts = params[i].sort((a, b) => a - b).filter((t, n, arr) => n === 0 || (t - arr[n - 1]) * distance(s.a, s.b) > eps);
    for (let j = 1; j < ts.length; j++) {
      const av = vertex(interpolate(s.a, s.b, ts[j - 1])), bv = vertex(interpolate(s.a, s.b, ts[j]));
      if (av === bv) continue;
      const k = av < bv ? `${av},${bv}` : `${bv},${av}`, prior = edges.get(k);
      if (prior !== undefined) {
        if (segments[prior].assignment !== s.assignment || segments[prior].angle !== s.angle) throw new Error(`重合线段 ${sourceIds[prior].join('、')} 与 ${s.id} 的线型或角度冲突，请先处理。`);
        sourceIds[prior].push(s.id); warnings.push(`计算副本合并了重复线段 ${s.id}；原工程未修改。`); continue;
      }
      edges.set(k, segments.length);
      segments.push({ ...s, id: `${s.id}#${j}`, a: [...vertices[av]], b: [...vertices[bv]] }); sourceIds.push([s.id]);
    }
  });
  return { segments, sourceIds, warnings: [...new Set(warnings)] };
}

export interface BuildFoldResult { graph: FoldGraph; warnings: string[]; edgeSourceIds: string[][] }
export interface BuildFoldOptions { flatCreases?:'marks' }
export function buildFold(doc: Doc,options:BuildFoldOptions={}): BuildFoldResult {
  if(options.flatCreases!==undefined&&options.flatCreases!=='marks')throw new Error('展开折痕的计算用途无效。');
  if(hasMaterialTopology(doc)){
    validateDoc(doc);
    const material=inspectMaterialTopology(doc);
    if(!material.ok)throw new Error(material.reason);
    return {graph:{...material.graph,file_spec:1.2,file_creator:'折纸工坊',file_title:doc.name,frame_classes:['creasePattern'],frame_attributes:['2D'],frame_unit:'mm'},edgeSourceIds:material.edgeSegmentIds.map(id=>[id]),warnings:doc.segments.some(s=>s.assignment==='A')?['辅助线不参与材料纸面与折叠计算。']:[]};
  }
  const planar = splitIntersections(doc), vertices: Point[] = [], edges: [number, number][] = [], cache = new Map<string, number>();
  const v = (p: Point) => { const key = p.join(','); const prior = cache.get(key); if (prior !== undefined) return prior; cache.set(key, vertices.length); vertices.push([...p]); return vertices.length - 1; };
  for (const s of planar.segments) edges.push([v(s.a), v(s.b)]);
  const graph: FoldGraph = {
    file_spec: 1.2, file_creator: '折纸工坊', file_title: doc.name, frame_classes: ['creasePattern'], frame_attributes: ['2D'], frame_unit: 'mm',
    vertices_coords: vertices, edges_vertices: edges,
    edges_assignment: planar.segments.map(s => s.assignment),
    edges_foldAngle: planar.segments.map(s => s.angle),
  };
  // Rabbit Ear constructs faces and adjacency only; source assignments are never guessed.
  const numericGraph = { ...graph, edges_foldAngle: planar.segments.map(s => s.angle ?? defaultAngle(s.assignment) ?? 0) };
  if(buildBoundaryRegions(graph,options.flatCreases==='marks')){
    if(options.flatCreases==='marks')graph.zhezhi_flatCreases='marks';
  }else if(options.flatCreases==='marks'){
    // Keep every indexed CP mark and intersection. Only active edges bound
    // physical faces; F routes are never hinges or additional paper layers.
    const areaEdges=edges.flatMap((_,e)=>graph.edges_assignment[e]==='F'?[]:[e]);
    const areaGraph:typeof numericGraph & {vertices_faces?:number[][]}={...numericGraph,edges_vertices:areaEdges.map(e=>edges[e]),edges_assignment:areaEdges.map(e=>graph.edges_assignment[e]),edges_foldAngle:areaEdges.map(e=>numericGraph.edges_foldAngle[e])};
    ear.graph.populate(areaGraph,{faces:true});
    graph.zhezhi_flatCreases='marks';
    graph.faces_vertices=areaGraph.faces_vertices;
    graph.faces_edges=areaGraph.faces_edges?.map(row=>row.map(e=>areaEdges[e]));
    graph.edges_faces=edges.map(()=>[]);areaEdges.forEach((e,i)=>{graph.edges_faces![e]=areaGraph.edges_faces?.[i]??[];});
    graph.faces_faces=areaGraph.faces_faces;
    graph.vertices_faces=areaGraph.vertices_faces;
    graph.vertices_edges=vertices.map(()=>[] as number[]);graph.vertices_vertices=vertices.map(()=>[] as number[]);
    edges.forEach(([a,b],e)=>{(graph.vertices_edges as number[][])[a].push(e);(graph.vertices_edges as number[][])[b].push(e);(graph.vertices_vertices as number[][])[a].push(b);(graph.vertices_vertices as number[][])[b].push(a);});
  }else{
    ear.graph.populate(numericGraph, { faces: true });
    Object.assign(graph, numericGraph, { edges_foldAngle: planar.segments.map(s => s.angle) });
  }
  const warnings = [...planar.warnings];
  if (doc.segments.some(s => s.assignment === 'A')) warnings.push('辅助线不参与纸面划分、平折与层序求解。');
  return { graph, warnings, edgeSourceIds: planar.sourceIds };
}

/** The diagram workspace records F marks without introducing material seams.
 * Indexed cut/material sources keep their independently validated identities. */
export function buildDiagramFold(doc:Doc):BuildFoldResult{return buildFold(doc,{flatCreases:'marks'});}
