import { validateDoc, type Assignment, type Doc, type Point, type Segment } from './types';

export interface CPProcessingProfile {
  enabled?: boolean;
  groupId?: string;
  settingsKey?: string;
  passes?: number;
}
export interface CPPathOptimizerOptions {
  /** Independent edges retain source direction; continuous routing permits turns/reversals. */
  pathMode?: 'independent' | 'collinear' | 'continuous';
  maxTurns?: number | null;
  maxMergedLength?: number | null;
  maxMergedSegments?: number | null;
  optimizeTravel?: boolean;
  profiles?: Partial<Record<Assignment, CPProcessingProfile>>;
  mergeSameSettings?: boolean;
  overlapPolicy?: 'reject' | 'retain';
  origin?: Point;
}
export interface CPPathResolvedOptions {
  pathMode: 'independent' | 'collinear' | 'continuous';
  maxTurns: number | null;
  maxMergedLength: number | null;
  maxMergedSegments: number | null;
  optimizeTravel: boolean;
  profiles: Record<Assignment, Required<CPProcessingProfile>>;
  mergeSameSettings: boolean;
  overlapPolicy: 'reject' | 'retain';
  origin: Point;
}
export interface CPPathIssue {
  code: 'zero-length' | 'overlap' | 'route-fallback' | 'long-source';
  severity: 'warning';
  message: string;
  segmentIds: string[];
}
export interface CPPathOverlap {
  segmentIds: [string, string];
  kind: 'duplicate' | 'overlap';
  sameSettings: boolean;
}
export interface CPProcessingGroup {
  id: string;
  settingsKey: string;
  assignments: Assignment[];
  passes: number;
  sourceSegmentIds: string[];
}
export interface CPPathAnalysis {
  included: Segment[];
  excluded: Segment[];
  zeroLength: Segment[];
  overlaps: CPPathOverlap[];
  overlapsTruncated: boolean;
  issues: CPPathIssue[];
  groups: CPProcessingGroup[];
  options: CPPathResolvedOptions;
}
/** Every consecutive pair is a complete source segment, possibly reversed.
 * Repeated passes are explicit edge occurrences, never an extra multiplier. */
export interface CPProcessingPath {
  id: string;
  groupId: string;
  settingsKey: string;
  points: Point[];
  sourceSegmentIds: string[];
  assignments: Assignment[];
}
export interface CPPathMetrics {
  pathCount: number;
  drawLength: number;
  travelDistance: number;
}
export interface CPPathOptimization {
  paths: CPProcessingPath[];
  baselinePaths: CPProcessingPath[];
  before: CPPathMetrics;
  after: CPPathMetrics;
  theoreticalMinimumPaths: number;
  atTheoreticalMinimum: boolean;
  analysis: CPPathAnalysis;
  groups: CPProcessingGroup[];
  options: CPPathResolvedOptions;
}
export class CPPathOptimizationError extends Error {
  constructor(message: string, readonly analysis: CPPathAnalysis) { super(message); this.name = 'CPPathOptimizationError'; }
}

const assignments: Assignment[] = ['M', 'V', 'B', 'U', 'A', 'F'];
const copyPoint = (p: Point): Point => [p[0], p[1]];
const copySegment = (s: Segment): Segment => ({ ...s, a: copyPoint(s.a), b: copyPoint(s.b) });
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function resolveOptions(options: CPPathOptimizerOptions): CPPathResolvedOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('加工优化设置必须是对象。');
  if (options.profiles !== undefined && (!options.profiles || typeof options.profiles !== 'object' || Array.isArray(options.profiles) || Object.keys(options.profiles).some(k => !assignments.includes(k as Assignment)))) throw new Error('加工分组线型无效。');
  if (options.mergeSameSettings !== undefined && typeof options.mergeSameSettings !== 'boolean') throw new Error('同设置合并必须明确选择布尔值。');
  if(options.optimizeTravel!==undefined&&typeof options.optimizeTravel!=='boolean')throw new Error('空走排序设置必须是布尔值。');
  if (options.pathMode !== undefined && !['independent','collinear','continuous'].includes(options.pathMode)) throw new Error('加工路径模式无效。');
  const maxTurns=options.maxTurns??null,maxMergedLength=options.maxMergedLength??null,maxMergedSegments=options.maxMergedSegments??null;
  if(maxTurns!==null&&(!Number.isSafeInteger(maxTurns)||maxTurns<0))throw new Error('连续转弯次数须为非负整数。');
  if(maxMergedLength!==null&&(!Number.isFinite(maxMergedLength)||maxMergedLength<=0||maxMergedLength>3_000_000))throw new Error('合并长度须为大于零且不超过 3,000,000 毫米的数值。');
  if(maxMergedSegments!==null&&(!Number.isSafeInteger(maxMergedSegments)||maxMergedSegments<1))throw new Error('最多合并段数须为正整数。');
  if (options.overlapPolicy !== undefined && !['reject', 'retain'].includes(options.overlapPolicy)) throw new Error('重叠线处理方式无效。');
  const origin = options.origin === undefined ? [0, 0] : options.origin;
  if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000)) throw new Error('加工起点必须为有效毫米坐标。');
  const profiles = {} as CPPathResolvedOptions['profiles'];
  for (const assignment of assignments) {
    const input = options.profiles?.[assignment] === undefined ? {} : options.profiles[assignment]!;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${assignment} 加工设置无效。`);
    const enabled = input.enabled === undefined ? true : input.enabled, groupId = input.groupId === undefined ? assignment : input.groupId;
    const settingsKey = input.settingsKey === undefined ? assignment : input.settingsKey, passes = input.passes === undefined ? 1 : input.passes;
    if (typeof enabled !== 'boolean') throw new Error(`${assignment} 是否加工必须为布尔值。`);
    if (![groupId, settingsKey].every(v => typeof v === 'string' && v.length > 0 && v.length <= 4096)) throw new Error(`${assignment} 加工分组或设置标识无效。`);
    if (!Number.isInteger(passes) || passes < 1 || passes > 100) throw new Error(`${assignment} 加工次数须为 1 到 100 的整数。`);
    profiles[assignment] = { enabled, groupId, settingsKey, passes };
  }
  return { profiles, pathMode: options.pathMode ?? 'continuous',maxTurns,maxMergedLength,maxMergedSegments,optimizeTravel:options.optimizeTravel??true, mergeSameSettings: options.mergeSameSettings ?? false, overlapPolicy: options.overlapPolicy ?? 'reject', origin: copyPoint(origin as Point) };
}

// Exact dyadic line keys diagnose overlap without applying an epsilon, snapping
// endpoints, or confusing two close parallel lines. IEEE-754 values are rational.
const floatBuffer = new ArrayBuffer(8), floatView = new DataView(floatBuffer);
function dyadic(n: number): [bigint, number] {
  if (n === 0) return [0n, 0];
  floatView.setFloat64(0, n, false);
  const bits = floatView.getBigUint64(0, false), rawExponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) | (rawExponent === 0 ? 0n : 1n << 52n);
  return [(bits >> 63n) === 0n ? mantissa : -mantissa, rawExponent === 0 ? -1074 : rawExponent - 1075];
}
function gcd(a: bigint, b: bigint): bigint { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b !== 0n) [a, b] = [b, a % b]; return a; }
function lineKey(s: Pick<Segment,'a'|'b'>): string {
  const values = [...s.a, ...s.b].map(dyadic);
  const exponent = Math.min(...values.filter(v => v[0] !== 0n).map(v => v[1]));
  const [x1, y1, x2, y2] = values.map(([m, e]) => m === 0n ? 0n : m << BigInt(e - exponent));
  let a = y1 - y2, b = x2 - x1, c = x1 * y2 - x2 * y1;
  if (exponent < 0) { a <<= BigInt(-exponent); b <<= BigInt(-exponent); } else c <<= BigInt(exponent);
  const divisor = gcd(gcd(a, b), c), sign = a !== 0n ? (a < 0n ? -1n : 1n) : (b < 0n ? -1n : 1n);
  return `${a / divisor * sign},${b / divisor * sign},${c / divisor * sign}`;
}

/** Exact collinearity and forward traversal; reversal is a turn, never a merge. */
export function isCPStraight(a:Point,b:Point,c:Point):boolean {
  if(samePoint(a,b)||samePoint(b,c))return false;
  const axis=a[0]!==b[0]?0:1;
  return (b[axis]>a[axis])===(c[axis]>b[axis]) && lineKey({a,b})===lineKey({a:b,b:c});
}
export function cpPathTurnCount(points:readonly Point[]):number {
  let count=0;for(let i=1;i<points.length-1;i++)if(!isCPStraight(points[i-1],points[i],points[i+1]))count++;return count;
}
export function checkCPPathLimits(points:readonly Point[],options:CPPathResolvedOptions):void {
  const turns=cpPathTurnCount(points);
  if(options.pathMode==='collinear'){
    if(turns)throw new Error('共线方案出现转弯或折返。');
    if(options.maxMergedSegments!==null&&points.length-1>options.maxMergedSegments)throw new Error('合并段数超过设置上限。');
    if(points.length>2&&options.maxMergedLength!==null&&distance(points[0],points.at(-1)!)>options.maxMergedLength)throw new Error('合并长度超过设置上限。');
  }else if(options.maxTurns!==null&&turns>options.maxTurns)throw new Error('规划路径连续转弯次数超过设置上限。');
}
export interface CPProcessingLineRun {path:CPProcessingPath;firstEdge:number;endEdge:number}
/** Coalesce real straight runs only for the new schemes; preserve legacy API output. */
export function cpProcessingLineRuns(plan:CPPathOptimization):CPProcessingLineRun[] {
  const merge=plan.options.pathMode==='collinear'||(plan.options.pathMode==='continuous'&&plan.options.maxTurns!==null);
  const out:CPProcessingLineRun[]=[];
  for(const path of plan.paths){
    let start=0;
    for(let i=1;i<path.sourceSegmentIds.length;i++)if(!merge||!isCPStraight(path.points[i-1],path.points[i],path.points[i+1])){
      out.push({path,firstEdge:start,endEdge:i});start=i;
    }
    out.push({path,firstEdge:start,endEdge:path.sourceSegmentIds.length});
  }
  return out;
}

export function analyzeCPPaths(doc: Doc, input: CPPathOptimizerOptions = {}): CPPathAnalysis {
  validateDoc(doc);
  const options = resolveOptions(input), included: Segment[] = [], excluded: Segment[] = [], zeroLength: Segment[] = [];
  const issues: CPPathIssue[] = [], groups: CPProcessingGroup[] = [], groupMap = new Map<string, CPProcessingGroup>();
  for (const source of doc.segments) {
    const s = copySegment(source), profile = options.profiles[s.assignment];
    if (!profile.enabled) { excluded.push(s); continue; }
    if (samePoint(s.a, s.b)) { zeroLength.push(s); continue; }
    included.push(s);
    const key = JSON.stringify(options.mergeSameSettings ? [profile.settingsKey, profile.passes] : [s.assignment, profile.groupId, profile.settingsKey, profile.passes]);
    let group = groupMap.get(key);
    if (!group) { group = { id: `g${groups.length + 1}`, settingsKey: profile.settingsKey, passes: profile.passes, assignments: [], sourceSegmentIds: [] }; groupMap.set(key, group); groups.push(group); }
    if (!group.assignments.includes(s.assignment)) group.assignments.push(s.assignment);
    group.sourceSegmentIds.push(s.id);
  }
  if (zeroLength.length) issues.push({ code: 'zero-length', severity: 'warning', message: `${zeroLength.length} 条零长线不产生加工路径；原工程保持不变。`, segmentIds: zeroLength.map(s => s.id) });
  if(options.pathMode==='collinear'&&options.maxMergedLength!==null){
    const long=included.filter(s=>distance(s.a,s.b)>options.maxMergedLength!);
    if(long.length)issues.push({code:'long-source',severity:'warning',message:`${long.length} 条原线已超过合并长度上限，将原样保留，不自动切短。`,segmentIds:long.map(s=>s.id)});
  }
  const lines = new Map<string, Segment[]>();
  for (const s of included) { const key = lineKey(s), line = lines.get(key); if (line) line.push(s); else lines.set(key, [s]); }
  const overlaps: CPPathOverlap[] = [];
  let overlapsTruncated = false;
  scan: for (const line of lines.values()) {
    if (line.length < 2) continue;
    const axis = line[0].a[0] === line[0].b[0] ? 1 : 0;
    const sorted = line.map(s => ({ s, lo: Math.min(s.a[axis], s.b[axis]), hi: Math.max(s.a[axis], s.b[axis]) })).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && sorted[j].lo < sorted[i].hi; j++) {
      if (overlaps.length >= 200) { overlapsTruncated = true; break scan; }
      const a = sorted[i].s, b = sorted[j].s, ap = options.profiles[a.assignment], bp = options.profiles[b.assignment];
      overlaps.push({ segmentIds: [a.id, b.id], kind: (samePoint(a.a, b.a) && samePoint(a.b, b.b)) || (samePoint(a.a, b.b) && samePoint(a.b, b.a)) ? 'duplicate' : 'overlap', sameSettings: ap.settingsKey === bp.settingsKey && ap.passes === bp.passes });
    }
  }
  if (overlaps.length) issues.push({ code: 'overlap', severity: 'warning', message: `发现${overlapsTruncated ? '至少 ' : ''}${overlaps.length} 对重复或共线重叠线。默认暂停优化；明确选择保留时，重叠位置会按各源线及指定次数重复加工。`, segmentIds: [...new Set(overlaps.flatMap(o => o.segmentIds))] });
  return { included, excluded, zeroLength, overlaps, overlapsTruncated, issues, groups, options };
}

/** Statistics include the initial move from origin, excluding a final return. */
export function cpPathMetrics(paths: readonly CPProcessingPath[], origin: Point = [0, 0]): CPPathMetrics {
  let drawLength = 0, travelDistance = 0, current = origin;
  for (const path of paths) {
    if (!path.points.length) continue;
    travelDistance += distance(current, path.points[0]);
    for (let i = 1; i < path.points.length; i++) drawLength += distance(path.points[i - 1], path.points[i]);
    current = path.points[path.points.length - 1];
  }
  return { pathCount: paths.length, drawLength, travelDistance };
}

interface ProcessingEdge { id: number | string; pass:number; a: Point; b: Point; source: Segment; u: string; v: string; virtual?: false }
interface VirtualEdge { id: string; u: string; v: string; virtual: true }
type GraphEdge = ProcessingEdge | VirtualEdge;
interface Traversal { edge: GraphEdge; from: string; to: string }
interface Trail { group: CPProcessingGroup; points: Point[]; edgeIds: number[]; closed: boolean }
const pointKey = (p: Point) => `${p[0]},${p[1]}`;
const d2 = (a: Point, b: Point) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
function turn(a: Point, b: Point, c: Point): number {
  const x = [b[0] - a[0], b[1] - a[1]], y = [c[0] - b[0], c[1] - b[1]];
  const den = Math.hypot(...x) * Math.hypot(...y);
  return den ? Math.acos(Math.max(-1, Math.min(1, (x[0] * y[0] + x[1] * y[1]) / den))) * 180 / Math.PI : 0;
}

/** Adapted from CP_Path_Optimizer_v1 src/optimizer.mjs makeTrails,
 * reversePath, rotatePath and orderTrails. MIT (c) 2026 CP Path Optimizer
 * contributors; see THIRD_PARTY_NOTICES.md and vendor/cp-path-optimizer/LICENSE.txt.
 * Geometry noding/snapping/deduplication is intentionally not transplanted. */
function makeTrails(edges: ProcessingEdge[], group: CPProcessingGroup): { paths: Trail[]; minimum: number } {
  const vertices = new Map<string, Point>(), adjacency = new Map<string, ProcessingEdge[]>();
  for (const e of edges) {
    vertices.set(e.u, e.a); vertices.set(e.v, e.b);
    for (const k of [e.u, e.v]) { const list = adjacency.get(k); if (list) list.push(e); else adjacency.set(k, [e]); }
  }
  const visited = new Set<string>(), paths: Trail[] = [];
  let minimum = 0, componentNumber = 0;
  for (const root of vertices.keys()) {
    if (visited.has(root)) continue;
    const component: string[] = [], queue = [root]; visited.add(root);
    while (queue.length) {
      const u = queue.pop()!; component.push(u);
      for (const e of adjacency.get(u)!) { const v = e.u === u ? e.v : e.u; if (!visited.has(v)) { visited.add(v); queue.push(v); } }
    }
    const odd = component.filter(k => adjacency.get(k)!.length % 2);
    minimum += Math.max(1, odd.length / 2);
    // Hub names cannot collide with numeric-coordinate vertex keys.
    const hub = `virtual-hub:${++componentNumber}`;
    const adj = new Map<string, GraphEdge[]>(component.map(k => [k, [...adjacency.get(k)!]]));
    if (odd.length) {
      const virtual: GraphEdge[] = []; adj.set(hub, virtual);
      for (let j = 0; j < odd.length; j++) { const edge: VirtualEdge = { id: `${hub}:${j}`, u: hub, v: odd[j], virtual: true }; virtual.push(edge); adj.get(odd[j])!.push(edge); }
    }
    const used = new Set<number | string>(), cursors = new Map<string, number>();
    const stack: { node: string; via: Traversal | null }[] = [{ node: odd.length ? hub : root, via: null }], circuit: Traversal[] = [];
    while (stack.length) {
      const top = stack[stack.length - 1], choices = adj.get(top.node)!;
      let best = -1, bestScore = Infinity;
      const prev = top.via && !top.via.edge.virtual ? vertices.get(top.via.from) : undefined;
      // Preserve the reference's turn preference at ordinary vertices. A linear
      // cursor bounds work for extreme-degree stars and multi-pass inputs.
      if (choices.length > 64) {
        let cursor = cursors.get(top.node) ?? 0;
        while (cursor < choices.length && used.has(choices[cursor].id)) cursor++;
        cursors.set(top.node, cursor);
        if (cursor < choices.length) best = cursor;
      } else for (let k = 0; k < choices.length; k++) {
        const e = choices[k]; if (used.has(e.id)) continue;
        const to = e.u === top.node ? e.v : e.u;
        const score = e.virtual ? 10000 : prev ? turn(prev, vertices.get(top.node)!, vertices.get(to)!) : 0;
        if (score < bestScore) { best = k; bestScore = score; }
      }
      if (best < 0) { const popped = stack.pop()!; if (popped.via) circuit.push(popped.via); }
      else { const e = choices[best], to = e.u === top.node ? e.v : e.u; used.add(e.id); stack.push({ node: to, via: { edge: e, from: top.node, to } }); }
    }
    circuit.reverse(); let current: Traversal[] = [];
    const finish = () => {
      if (!current.length) return;
      const points = [vertices.get(current[0].from)!, ...current.map(v => vertices.get(v.to)!)].map(copyPoint);
      paths.push({ group, points, edgeIds: current.map(v => Number(v.edge.id)), closed: samePoint(points[0], points[points.length - 1]) }); current = [];
    };
    for (const step of circuit) { if (step.edge.virtual) finish(); else current.push(step); } finish();
  }
  if (paths.length !== minimum) throw new Error('欧拉分解没有达到奇偶度路径下限，停止加工导出。');
  return { paths, minimum };
}
function reversePath(p: Trail): Trail { return { ...p, points: [...p.points].reverse(), edgeIds: [...p.edgeIds].reverse() }; }
function rotatePath(p: Trail, i: number): Trail {
  if (!p.closed || i === 0) return p;
  const pts = p.points.slice(0, -1), ps = pts.slice(i).concat(pts.slice(0, i));
  return { ...p, points: [...ps, ps[0]], edgeIds: p.edgeIds.slice(i).concat(p.edgeIds.slice(0, i)) };
}
function splitByLimits(paths:Trail[],options:CPPathResolvedOptions):Trail[] {
  if(options.pathMode!=='collinear'&&options.maxTurns===null)return paths;
  const out:Trail[]=[];
  for(const path of paths){
    let first=0,turns=0;
    const finish=(end:number)=>{out.push({...path,points:path.points.slice(first,end+1),edgeIds:path.edgeIds.slice(first,end),closed:false});first=end;turns=0;};
    for(let edge=1;edge<path.edgeIds.length;edge++){
      const changed=!isCPStraight(path.points[edge-1],path.points[edge],path.points[edge+1]);
      const overTurn=changed&&(options.pathMode==='collinear'||turns+1>options.maxTurns!);
      const overCount=options.pathMode==='collinear'&&options.maxMergedSegments!==null&&edge-first+1>options.maxMergedSegments;
      const overLength=options.pathMode==='collinear'&&options.maxMergedLength!==null&&distance(path.points[first],path.points[edge+1])>options.maxMergedLength;
      if(overTurn||overCount||overLength)finish(edge);
      else if(changed)turns++;
    }
    finish(path.edgeIds.length);
  }
  return out;
}
function orderTrails(paths: Trail[], startPoint: Point, allowReverse=true): Trail[] {
  if (!paths.length) return [];
  // Reference nearest-neighbour plus 2-opt is quadratic. Large disconnected
  // exports use deterministic spatial ordering, then the same safe orientation.
  const spatial = paths.length > 1500;
  const rest = spatial ? [...paths].sort((a, b) => a.points[0][0] - b.points[0][0] || a.points[0][1] - b.points[0][1]) : [...paths];
  const out: Trail[] = []; let pos = startPoint, spatialCursor = 0;
  while (spatial ? spatialCursor < rest.length : rest.length > 0) {
    let bi = spatial ? spatialCursor : 0, bv = rest[bi], bd = Infinity;
    const begin = spatial ? spatialCursor : 0, end = spatial ? spatialCursor + 1 : rest.length;
    for (let i = begin; i < end; i++) {
      const p = rest[i];
      if (p.closed) for (let j = 0; j < p.points.length - 1; j++) {
        const ds = d2(pos, p.points[j]); if (ds < bd) { bd = ds; bi = i; bv = rotatePath(p, j); }
      } else {
        const ds = d2(pos, p.points[0]), de = d2(pos, p.points[p.points.length - 1]);
        if (ds < bd) { bd = ds; bi = i; bv = p; }
        if (allowReverse && de < bd) { bd = de; bi = i; bv = reversePath(p); }
      }
    }
    out.push(bv); if (spatial) spatialCursor++; else rest.splice(bi, 1); pos = bv.points[bv.points.length - 1];
  }
  if (!spatial && allowReverse) for (let pass = 0; pass < 2; pass++) {
    let improved = false;
    for (let i = 0; i < out.length - 1; i++) for (let j = i + 1; j < out.length; j++) {
      const prev = i ? out[i - 1].points[out[i - 1].points.length - 1] : startPoint;
      const next = j + 1 < out.length ? out[j + 1].points[0] : null;
      const a = out[i].points[0], b = out[j].points[out[j].points.length - 1];
      const old = distance(prev, a) + (next ? distance(b, next) : 0), neu = distance(prev, b) + (next ? distance(a, next) : 0);
      if (neu < old) { out.splice(i, j - i + 1, ...out.slice(i, j + 1).reverse().map(reversePath)); improved = true; }
    }
    if (!improved) break;
  }
  return out;
}

function materialize(paths: Trail[], edges: ProcessingEdge[]): CPProcessingPath[] {
  return paths.map((p, i) => ({ id: `path_${i + 1}`, groupId: p.group.id, settingsKey: p.group.settingsKey,
    points: p.points.map(copyPoint), sourceSegmentIds: p.edgeIds.map(e => edges[e].source.id), assignments: p.edgeIds.map(e => edges[e].source.assignment) }));
}
function validateCoverage(paths: CPProcessingPath[], analysis: CPPathAnalysis): void {
  const source = new Map(analysis.included.map(s => [s.id, s])), counts = new Map<string, number>();
  const groups = new Map(analysis.groups.map(g => [g.id, g]));
  const groupMembers = new Map(analysis.groups.map(g => [g.id, new Set(g.sourceSegmentIds)]));
  for (const p of paths) {
    checkCPPathLimits(p.points,analysis.options);
    const group = groups.get(p.groupId);
    if (!group || p.settingsKey !== group.settingsKey || p.points.length !== p.sourceSegmentIds.length + 1 || p.assignments.length !== p.sourceSegmentIds.length) throw new Error('加工路径分组或点边数量无效。');
    const members = groupMembers.get(group.id)!;
    for (let i = 0; i < p.sourceSegmentIds.length; i++) {
      const s = source.get(p.sourceSegmentIds[i]), a = p.points[i], b = p.points[i + 1];
      if (!s || !members.has(s.id) || p.assignments[i] !== s.assignment || !((samePoint(a, s.a) && samePoint(b, s.b)) || (samePoint(a, s.b) && samePoint(b, s.a)))) throw new Error('加工路径包含新增连线、位置变化或源线型错误。');
      if (analysis.options.pathMode==='independent' && (p.sourceSegmentIds.length!==1 || !samePoint(a,s.a) || !samePoint(b,s.b))) throw new Error('逐边模式不能合并路径或反转原线段方向。');
      counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
  }
  for (const s of analysis.included) if (counts.get(s.id) !== analysis.options.profiles[s.assignment].passes) throw new Error(`加工线 ${s.id} 遗漏或次数不符。`);
}

export function optimizeCPPaths(doc: Doc, input: CPPathOptimizerOptions = {}): CPPathOptimization {
  const analysis = analyzeCPPaths(doc, input), { options, groups } = analysis;
  if (!analysis.included.length) throw new CPPathOptimizationError('没有可加工的非零长度线段。', analysis);
  if (analysis.overlaps.length && options.overlapPolicy === 'reject') throw new CPPathOptimizationError('重复或共线重叠线尚未处理；请先编辑原 CP，或明确选择保留全部源线并重复加工。', analysis);
  const edges: ProcessingEdge[] = [], baselinePaths: CPProcessingPath[] = [];
  const segments = new Map(analysis.included.map(s => [s.id, s]));
  const groupEdges = new Map<string, ProcessingEdge[]>();
  for (const group of groups) {
    const list: ProcessingEdge[] = []; groupEdges.set(group.id, list);
    for (const id of group.sourceSegmentIds) {
      const source = segments.get(id)!;
      for (let pass = 0; pass < group.passes; pass++) {
        const e: ProcessingEdge = { id: edges.length,pass, a: copyPoint(source.a), b: copyPoint(source.b), source, u: pointKey(source.a), v: pointKey(source.b) };
        edges.push(e); list.push(e);
        baselinePaths.push({ id: `original_${baselinePaths.length + 1}`, groupId: group.id, settingsKey: group.settingsKey, points: [copyPoint(source.a), copyPoint(source.b)], sourceSegmentIds: [source.id], assignments: [source.assignment] });
      }
    }
  }
  const trails: Trail[] = []; let theoreticalMinimumPaths = 0, position = options.origin;
  // Groups follow source order. Boundary has no special last-pass treatment.
  for (const group of groups) {
    const list=groupEdges.get(group.id)!;
    const independent=options.pathMode==='independent';
    let result:{paths:Trail[];minimum:number};
    if(independent)result={paths:list.map(e=>({group,points:[e.a,e.b],edgeIds:[Number(e.id)],closed:false})),minimum:list.length};
    else if(options.pathMode==='collinear'){
      const lines=new Map<string,ProcessingEdge[]>();
      for(const e of list){const key=e.pass+':'+lineKey(e);const line=lines.get(key);if(line)line.push(e);else lines.set(key,[e]);}
      result={paths:[],minimum:0};
      for(const line of lines.values()){const local=makeTrails(line,group);result.paths.push(...local.paths);result.minimum+=local.minimum;}
    }else result=makeTrails(list,group);
    theoreticalMinimumPaths += result.minimum;
    const initial = options.optimizeTravel?orderTrails(result.paths, position, !independent):result.paths;
    const split=splitByLimits(initial,options);
    const ordered=split===initial||!options.optimizeTravel?split:orderTrails(split,position,!independent);trails.push(...ordered);
    if (ordered.length) position = ordered[ordered.length - 1].points[ordered[ordered.length - 1].points.length - 1];
  }
  const before = cpPathMetrics(baselinePaths, options.origin);
  let paths = materialize(trails, edges), after = cpPathMetrics(paths, options.origin);
  if(!options.optimizeTravel){
    const sourceOrder=new Map(analysis.included.map((s,i)=>[s.id,i]));
    paths=paths.map(path=>{
      if(path.sourceSegmentIds.length===1){const s=segments.get(path.sourceSegmentIds[0])!;return {...path,points:[copyPoint(s.a),copyPoint(s.b)]};}
      if(options.pathMode==='collinear'){
        let first=0;for(let i=1;i<path.sourceSegmentIds.length;i++)if(sourceOrder.get(path.sourceSegmentIds[i])!<sourceOrder.get(path.sourceSegmentIds[first])!)first=i;
        if(!samePoint(path.points[first],segments.get(path.sourceSegmentIds[first])!.a))return {...path,points:[...path.points].reverse(),sourceSegmentIds:[...path.sourceSegmentIds].reverse(),assignments:[...path.assignments].reverse()};
      }
      return path;
    }).sort((a,b)=>a.sourceSegmentIds.reduce((min,id)=>Math.min(min,sourceOrder.get(id)!),Infinity)-b.sourceSegmentIds.reduce((min,id)=>Math.min(min,sourceOrder.get(id)!),Infinity));
    paths=paths.map((p,i)=>({...p,id:`path_${i+1}`}));after=cpPathMetrics(paths,options.origin);
  }
  // Heuristics are not a global shortest-route solver. Keep the user's source
  // route if the optimized decomposition costs more travel from this origin.
  if (options.optimizeTravel&&after.travelDistance > before.travelDistance) {
    paths = baselinePaths.map(p => ({ ...p, points: p.points.map(copyPoint), sourceSegmentIds: [...p.sourceSegmentIds], assignments: [...p.assignments] }));
    after = cpPathMetrics(paths, options.origin);
    analysis.issues.push({ code: 'route-fallback', severity: 'warning', message: options.pathMode==='independent'?'候选逐边排序的空走超过原顺序，已保留原分组顺序及方向。':'当前欧拉分解的空走超过原顺序，已回退到原分组路径；本次未保证达到最少路径数。', segmentIds: [] });
  }
  validateCoverage(paths, analysis);
  return { paths, baselinePaths, before, after, theoreticalMinimumPaths, atTheoreticalMinimum: paths.length === theoreticalMinimumPaths, analysis, groups, options };
}
