import {
  inspectSimulationStepCollisions,
  type SimulationStepCollisionOptions,
  type SimulationStepCollisionPair,
  type SimulationStepPathCertificate,
} from './simStepCollision';
import {certifyContactEmbedding} from './simContactEmbedding';

type V = [number, number, number];
type Triangle = [number, number, number];
type Interval = [number, number];
type Polynomial = Interval[];
type PolynomialVector = [Polynomial, Polynomial, Polynomial];

export interface SimulationStepFlexCollisionMesh {
  indices: ArrayLike<number>;
  /** Provenance only. Equal source faces never exclude a collision pair. */
  triangleSourceFaces?: readonly number[];
}

export interface SimulationStepFlexKeyframe {
  progress: number;
  positions: ArrayLike<number>;
}

export interface SimulationStepFlexCollisionOptions extends SimulationStepCollisionOptions {
  /** This is a budget for the complete piecewise-linear path, not each frame. */
  maxSegments?: number;
  /** Runtime zero-thickness contact: persistent coplanarity and arrival from
   * a proven side are legal. Departure from an un-ordered stack stays unknown. */
  contactMode?: 'nonpenetration';
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const point = (positions: ArrayLike<number>, vertex: number): V => [positions[3 * vertex], positions[3 * vertex + 1], positions[3 * vertex + 2]];
const unit = (v: V): V | null => {
  const size = Math.hypot(...v);
  return size > 1e-15 ? [v[0] / size, v[1] / size, v[2] / size] : null;
};
const normal = (t: readonly V[]): V => cross(sub(t[1], t[0]), sub(t[2], t[0]));
const edges = (t: readonly V[]): V[] => [sub(t[1], t[0]), sub(t[2], t[1]), sub(t[0], t[2])];
const midpoint = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

const zero = (): Interval => [0, 0];
const singleton = (value: number): Interval => [value, value];
function outward(lo: number, hi: number): Interval {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-Infinity, Infinity];
  const error = 4 * Number.EPSILON * Math.max(Math.abs(lo), Math.abs(hi)) + Number.MIN_VALUE;
  return [lo - error, hi + error];
}
function intervalAdd(a: Interval, b: Interval): Interval {
  if (a[0] === 0 && a[1] === 0) return b;
  if (b[0] === 0 && b[1] === 0) return a;
  if (a[0] === a[1] && b[0] === b[1]) {
    // Error-free TwoSum preserves an actual arithmetic zero; a rounded zero
    // from uncertain cancellation never becomes a material-contact proof.
    const sum = a[0] + b[0], shifted = sum - a[0];
    const error = (a[0] - (sum - shifted)) + (b[0] - shifted);
    if (error === 0 && Number.isFinite(sum)) return [sum, sum];
  }
  return outward(a[0] + b[0], a[1] + b[1]);
}
const intervalNegate = (a: Interval): Interval => [-a[1], -a[0]];
const intervalSubtract = (a: Interval, b: Interval): Interval => intervalAdd(a, intervalNegate(b));
function intervalMultiply(a: Interval, b: Interval): Interval {
  if (a[0] === 0 && a[1] === 0 || b[0] === 0 && b[1] === 0) return zero();
  if (a[0] === 1 && a[1] === 1) return b;
  if (b[0] === 1 && b[1] === 1) return a;
  if (a[0] === -1 && a[1] === -1) return intervalNegate(b);
  if (b[0] === -1 && b[1] === -1) return intervalNegate(a);
  if (a[0] === a[1] && b[0] === b[1]) {
    // Dekker's error-free product. Coordinate magnitudes are small in the
    // normalized simulator; overflow/underflow takes the conservative branch.
    const product = a[0] * b[0], splitter = 134217729;
    const ca = splitter * a[0], cb = splitter * b[0];
    if (Number.isFinite(ca) && Number.isFinite(cb) && Math.abs(product) >= 1e-280) {
      const ah = ca - (ca - a[0]), al = a[0] - ah, bh = cb - (cb - b[0]), bl = b[0] - bh;
      const error = ((ah * bh - product) + ah * bl + al * bh) + al * bl;
      if (error === 0) return [product, product];
    }
  }
  const products = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return outward(Math.min(...products), Math.max(...products));
}
function polynomialAdd(a: Polynomial, b: Polynomial, factor = 1): Polynomial {
  return Array.from({length: Math.max(a.length, b.length)}, (_, i) => intervalAdd(a[i] ?? zero(), intervalMultiply(singleton(factor), b[i] ?? zero())));
}
function polynomialMultiply(a: Polynomial, b: Polynomial): Polynomial {
  const result = Array.from({length: a.length + b.length - 1}, zero);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) result[i + j] = intervalAdd(result[i + j], intervalMultiply(a[i], b[j]));
  return result;
}
function polynomialCross(a: PolynomialVector, b: PolynomialVector): PolynomialVector {
  return [
    polynomialAdd(polynomialMultiply(a[1], b[2]), polynomialMultiply(a[2], b[1]), -1),
    polynomialAdd(polynomialMultiply(a[2], b[0]), polynomialMultiply(a[0], b[2]), -1),
    polynomialAdd(polynomialMultiply(a[0], b[1]), polynomialMultiply(a[1], b[0]), -1),
  ];
}
function polynomialDot(a: PolynomialVector, b: PolynomialVector): Polynomial {
  return polynomialAdd(polynomialAdd(polynomialMultiply(a[0], b[0]), polynomialMultiply(a[1], b[1])), polynomialMultiply(a[2], b[2]));
}
function affineVector(first: readonly V[], last: readonly V[], vertex: number, origin: number): PolynomialVector {
  return [0, 1, 2].map(axis => {
    const a = intervalSubtract(singleton(first[vertex][axis]), singleton(first[origin][axis]));
    const b = intervalSubtract(singleton(last[vertex][axis]), singleton(last[origin][axis]));
    return [a, intervalSubtract(b, a)];
  }) as PolynomialVector;
}
function binomial(n: number, k: number): number {
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i;
  return value;
}
/** Bernstein coefficients enclose the WHOLE polynomial interval [0,1]. */
function bernstein(polynomial: Polynomial): Interval[] {
  const degree = polynomial.length - 1;
  return polynomial.map((_, k) => polynomial.slice(0, k + 1).reduce<Interval>((sum, coefficient, i) => {
    const numerator = binomial(k, i), denominator = binomial(degree, i), weight = numerator / denominator;
    const bound = numerator===0||numerator===denominator||(denominator & denominator - 1) === 0 ? singleton(weight) : outward(weight, weight);
    return intervalAdd(sum, intervalMultiply(coefficient, bound));
  }, zero()));
}
function roundoff(values: readonly number[]): number {
  return 128 * Number.EPSILON * Math.max(1e-30, ...values.map(Math.abs));
}
/** Exact arithmetic zeros are retained for material boundary contact. Values
 * close to zero with an uncertain sign do not become separating proofs. */
function closedSign(values: readonly number[], sign: 1 | -1): boolean {
  const error = roundoff(values);
  return values.every(value => value === 0 || sign * value > error);
}
const strictIntervalSign = (values: readonly Interval[], sign: 1 | -1) => values.every(value => sign === 1 ? value[0] > 0 : value[1] < 0);
const closedIntervalSign = (values: readonly Interval[], sign: 1 | -1) => values.every(value => sign === 1 ? value[0] >= 0 : value[1] <= 0);
const intervalNonzero = (value: Interval) => value[0] > 0 || value[1] < 0;

function projectionInterval(positions: readonly V[], vertex: number, axis: V, origin?: number): Interval {
  let result = zero();
  for (let i = 0; i < 3; i++) {
    const coordinate = origin === undefined ? singleton(positions[vertex][i]) : intervalSubtract(singleton(positions[vertex][i]), singleton(positions[origin][i]));
    result = intervalAdd(result, intervalMultiply(coordinate, singleton(axis[i])));
  }
  return result;
}

function candidateAxes(a: readonly V[], b: readonly V[]): V[] {
  const na = normal(a), nb = normal(b), ea = edges(a), eb = edges(b);
  return [na, nb, ...ea.flatMap(x => eb.map(y => cross(x, y))), ...ea.map(e => cross(na, e)), ...eb.map(e => cross(nb, e))]
    .flatMap(axis => {const n = unit(axis); return n ? [n] : [];});
}

function describe(mesh: SimulationStepFlexCollisionMesh, first: number, second: number, shared: number[], kind: SimulationStepCollisionPair['kind']): SimulationStepCollisionPair {
  return {triangles: [first, second], faces: [mesh.triangleSourceFaces?.[first] ?? first, mesh.triangleSourceFaces?.[second] ?? second], sharedVertices: shared, kind};
}

/** A common edge is legal only while the two triangles cannot overlap beyond
 * that edge. det(edge,a,b) != 0 proves their planes meet at just the edge;
 * opposite edge normals also permit a coplanar, unfolded material boundary.
 * Both tests are polynomial interval proofs, not a rigid-hinge exemption. */
function sharedEdgeSeparated(first: readonly V[], last: readonly V[], a: Triangle, b: Triangle, shared: readonly number[],contact=false): boolean {
  if (shared.length !== 2) return false;
  const origin = shared[0], other = shared[1], va = a.find(v => !shared.includes(v))!, vb = b.find(v => !shared.includes(v))!;
  const vector = (v: number) => affineVector(first, last, v, origin);
  const e = vector(other), aa = vector(va), bb = vector(vb), na = polynomialCross(e, aa), nb = polynomialCross(e, bb);
  const opposite = bernstein(polynomialDot(na, nb));
  if (strictIntervalSign(opposite, -1)) return true;
  const determinant = bernstein(polynomialDot(na, bb));
  if(contact&&determinant.every(value=>value[0]===0&&value[1]===0))return true;
  if (!determinant.some(value => value[0] > 0 || value[1] < 0)) return false;
  if (!closedIntervalSign(determinant, 1) && !closedIntervalSign(determinant, -1)) return false;
  // A signed polynomial can vanish at an endpoint. At that endpoint only an
  // unfolded (opposite) pair is legal; a flattened overlapping pair is unknown.
  for (const endpoint of [0, determinant.length - 1]) {
    if(contact&&endpoint===determinant.length-1)continue;
    if (!intervalNonzero(determinant[endpoint]) && !(opposite[endpoint][1] < 0)) return false;
  }
  return true;
}

/** Fixed separating planes applied to exact affine endpoint projections. The
 * normal of a coincident planar stack has zero extent on BOTH triangles and
 * therefore cannot falsely certify two overlapping layers. */
function fixedAxisSeparated(first: readonly V[], last: readonly V[], a: Triangle, b: Triangle, shared: readonly number[], tolerance: number, reference: readonly V[]): boolean {
  const ma = a.map(v => midpoint(first[v], last[v])), mb = b.map(v => midpoint(first[v], last[v]));
  // The original material plane supplies useful axes for nearly flat curved
  // patches. An axis is still accepted only after checking the entire actual
  // interval; provenance never acts as a collision exemption.
  const referenceAxes = candidateAxes(a.map(v => reference[v]), b.map(v => reference[v]));
  const middleAxes = candidateAxes(ma, mb);
  const interiorAxes: V[] = [];
  if (shared.length === 1) {
    // Edge-normal axes sit exactly on a fan-sector boundary. An interior
    // bisector has a useful positive margin when neighbouring flexible edges
    // drift slightly in-plane; it is still checked against BOTH endpoints.
    for (const positions of [reference, first, last]) {
      const origin = positions[shared[0]], direction = (triangle: Triangle): V => triangle.filter(v => v !== shared[0])
        .map(v => unit(sub(positions[v], origin))!).reduce<V>((sum, value) => [sum[0] + value[0], sum[1] + value[1], sum[2] + value[2]], [0, 0, 0]);
      const da = unit(direction(a)), db = unit(direction(b)), axis = da && db ? unit(sub(db, da)) : null;
      if (axis) interiorAxes.push(axis);
    }
    // Combining supporting planes moves the candidate into the interior of
    // the separating cone. This avoids depending on a rounded dot product
    // being exactly zero at a flexible fan boundary. The exploratory margin
    // below only proposes an axis; the actual interval test stays strict.
    const origin = midpoint(first[shared[0]], last[shared[0]]), supporting: V[] = [];
    for (const axis of middleAxes) for (const sign of [1, -1]) {
      const n: V = [axis[0] * sign, axis[1] * sign, axis[2] * sign];
      const projections = [
        ...a.filter(v => v !== shared[0]).map(v => -dot(sub(midpoint(first[v], last[v]), origin), n)),
        ...b.filter(v => v !== shared[0]).map(v => dot(sub(midpoint(first[v], last[v]), origin), n)),
      ];
      const scale = Math.max(...projections.map(Math.abs));
      if (scale > 1e-15 && Math.min(...projections) >= -scale * 1e-9) supporting.push(n);
    }
    const combined = unit(supporting.reduce<V>((sum, n) => [sum[0] + n[0], sum[1] + n[1], sum[2] + n[2]], [0, 0, 0]));
    if (combined) interiorAxes.push(combined);
  }
  for (const axis of [...interiorAxes, ...referenceAxes, ...middleAxes]) {
    if (shared.length === 1) {
      const origin = shared[0];
      const project = (triangle: Triangle) => triangle.filter(v => v !== origin).flatMap(v => [dot(sub(first[v], first[origin]), axis), dot(sub(last[v], last[origin]), axis)]);
      const pa = project(a), pb = project(b);
      // Each triangle's interior must lie on its own side. Identically zero
      // projection is allowed only for a boundary edge, never a whole face.
      const endpointExtent = [0, 1].every(endpoint => [...pa.filter((_, i) => i % 2 === endpoint), ...pb.filter((_, i) => i % 2 === endpoint)].some(value => Math.abs(value) > roundoff([...pa, ...pb])));
      if (endpointExtent && pa.some(v => Math.abs(v) > roundoff(pa)) && pb.some(v => Math.abs(v) > roundoff(pb)) &&
        (closedSign(pa, -1) && closedSign(pb, 1) || closedSign(pa, 1) && closedSign(pb, -1))) {
        const bounded = (triangle: Triangle) => triangle.filter(v => v !== origin).flatMap(v => [projectionInterval(first, v, axis, origin), projectionInterval(last, v, axis, origin)]);
        const ba = bounded(a), bb = bounded(b);
        const endpointBound = [0, 1].every(endpoint => [...ba.filter((_, i) => i % 2 === endpoint), ...bb.filter((_, i) => i % 2 === endpoint)].some(value => value[0] > 0 || value[1] < 0));
        if (endpointBound && ba.some(intervalNonzero) && bb.some(intervalNonzero) && (closedIntervalSign(ba, -1) && closedIntervalSign(bb, 1) || closedIntervalSign(ba, 1) && closedIntervalSign(bb, -1))) return true;
      }
      continue;
    }
    const project = (triangle: Triangle) => triangle.flatMap(v => [dot(first[v], axis), dot(last[v], axis)]);
    const pa = project(a), pb = project(b), error = roundoff([...pa, ...pb]);
    const amin = Math.min(...pa), amax = Math.max(...pa), bmin = Math.min(...pb), bmax = Math.max(...pb);
    const bounded = () => {
      const project = (triangle: Triangle) => triangle.flatMap(v => [projectionInterval(first, v, axis), projectionInterval(last, v, axis)]);
      const aa = project(a), bb = project(b);
      return {aa, bb, amin: Math.min(...aa.map(v => v[0])), amax: Math.max(...aa.map(v => v[1])), bmin: Math.min(...bb.map(v => v[0])), bmax: Math.max(...bb.map(v => v[1]))};
    };
    if (bmin - amax > Math.max(tolerance, error) || amin - bmax > Math.max(tolerance, error)) {
      const range = bounded();
      if (range.bmin - range.amax > tolerance || range.amin - range.bmax > tolerance) return true;
    }
    // Topologically unrelated touching triangles are allowed only with an
    // exact separating boundary and positive projected extent on both sides.
    const endpointExtent = [0, 1].every(endpoint => {
      const aa = pa.filter((_, i) => i % 2 === endpoint), bb = pb.filter((_, i) => i % 2 === endpoint);
      return Math.max(...aa) - Math.min(...aa) + Math.max(...bb) - Math.min(...bb) > error;
    });
    if ((amax === bmin || bmax === amin) && endpointExtent && amax - amin > error && bmax - bmin > error) {
      const range = bounded();
      const extent = (values: Interval[]) => Math.max(...values.map(v => v[0])) - Math.min(...values.map(v => v[1])) > 0;
      const endpointBound = [0, 1].every(endpoint => extent(range.aa.filter((_, i) => i % 2 === endpoint)) || extent(range.bb.filter((_, i) => i % 2 === endpoint)));
      if (endpointBound && extent(range.aa) && extent(range.bb) && (range.amax <= range.bmin || range.bmax <= range.amin)) return true;
    }
  }
  return false;
}

/** A flexible face's OWN moving plane can separate another face even when no
 * fixed axis spans the interval. Its oriented vertex distances are cubic
 * polynomials for affine motion, so Bernstein signs prove the whole interval.
 * An entirely coplanar endpoint still needs an in-plane boundary proof: this
 * is not an inferred layer-order/departure certificate for an initial stack. */
function movingPlaneSeparated(first: readonly V[], last: readonly V[], a: Triangle, b: Triangle, shared: readonly number[], tolerance: number, reference: readonly V[],contact=false): boolean {
  const direction = (triangle: Triangle, other: Triangle): boolean => {
    const origin = triangle[0];
    const vector = (v: number) => affineVector(first, last, v, origin);
    const n = polynomialCross(vector(triangle[1]), vector(triangle[2]));
    // Shared material vertices lie on this face exactly; avoid interval
    // dependency from expanding the algebraic identity det(e,f,e) = 0.
    const distances = other.map(v => triangle.includes(v) ? [zero(), zero(), zero(), zero()] : bernstein(polynomialDot(n, vector(v))));
    if(contact&&distances.every(values=>values.every(value=>value[0]===0&&value[1]===0)))return true;
    if (!distances.some(values => values.some(value => value[0] > 0 || value[1] < 0))) return false;
    if (![1, -1].some(sign => distances.every(values => closedIntervalSign(values, sign as 1 | -1)))) return false;
    for (const endpoint of [0, 3]) {
      if(contact&&endpoint===3)continue;
      if (!distances.some(values => intervalNonzero(values[endpoint]))) {
        const positions = endpoint === 0 ? first : last;
        if (!fixedAxisSeparated(positions, positions, a, b, shared, tolerance, reference)) return false;
      }
    }
    return true;
  };
  return direction(a, b) || direction(b, a);
}

function nondegenerate(first: readonly V[], last: readonly V[], triangle: Triangle, tolerance: number): boolean {
  const [origin, b, c] = triangle;
  const e = affineVector(first, last, b, origin);
  const f = affineVector(first, last, c, origin);
  const n = polynomialCross(e, f), middle = triangle.map(v => midpoint(first[v], last[v])), axis = unit(normal(middle));
  if (!axis) return false;
  const projection = n.reduce<Polynomial>((sum, values, i) => polynomialAdd(sum, values.map(value => intervalMultiply(value, singleton(axis[i])))), [zero()]);
  return bernstein(projection).every(value => value[0] > tolerance * tolerance);
}

function pairPenetration(first: readonly V[], last: readonly V[], a: Triangle, b: Triangle, tolerance: number): number | null {
  // Reindex just this pair. Source/body identifiers intentionally play no
  // role; the existing static geometric predicate is safe to reuse here.
  const vertices = [...new Set([...a, ...b])], index = new Map(vertices.map((v, i) => [v, i]));
  const indices = [...a, ...b].map(v => index.get(v)!);
  for (const t of [0, .5, 1]) {
    const positions = vertices.flatMap(v => first[v].map((value, axis) => value + (last[v][axis] - value) * t));
    const result = inspectSimulationStepCollisions({indices}, positions, {tolerance});
    if (result.status === 'collision') return t;
  }
  // Shared IDs are preserved above, so contact confined to their vertex/edge
  // remains legal without discarding the rest of either triangle.
  return null;
}

type Candidate = {first: number; second: number; shared: number[]};

type BoundaryEdge = [number, number];
/** The projection-degree certificate below requires a genuine oriented disk.
 * Face IDs and solver/cone metadata are deliberately not used to infer it. */
function diskBoundary(triangles: readonly Triangle[]): BoundaryEdge[] | null {
  const edges = new Map<string, BoundaryEdge[]>(), links = new Map<number, Array<[number, number]>>(), used = new Set<number>();
  for (const triangle of triangles) for (let k = 0; k < 3; k++) {
    const a = triangle[k], b = triangle[(k + 1) % 3], c = triangle[(k + 2) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const incident = edges.get(key) ?? []; incident.push([a, b]); if (incident.length > 2) return null; edges.set(key, incident);
    const link = links.get(a) ?? []; link.push([b, c]); links.set(a, link); used.add(a);
  }
  const boundary: BoundaryEdge[] = [];
  for (const incident of edges.values()) {
    if (incident.length === 1) boundary.push(incident[0]);
    else if (incident[0][0] !== incident[1][1] || incident[0][1] !== incident[1][0]) return null;
  }
  if (used.size - edges.size + triangles.length !== 1 || boundary.length < 3) return null;
  const next = new Map<number, number>(), incoming = new Set<number>();
  for (const [a, b] of boundary) {if (next.has(a) || incoming.has(b)) return null; next.set(a, b); incoming.add(b);}
  const start = boundary[0][0], visited = new Set<number>(); let vertex = start;
  do {if (visited.has(vertex) || !next.has(vertex)) return null; visited.add(vertex); vertex = next.get(vertex)!;} while (vertex !== start);
  if (visited.size !== boundary.length) return null;
  const graph = new Map<number, number[]>();
  for (const incident of edges.values()) {const [a, b] = incident[0]; graph.set(a, [...graph.get(a) ?? [], b]); graph.set(b, [...graph.get(b) ?? [], a]);}
  const connected = new Set<number>(), todo = [start];
  while (todo.length) {const v = todo.pop()!; if (connected.has(v)) continue; connected.add(v); todo.push(...graph.get(v)!);}
  if (connected.size !== used.size) return null;
  // Vertex links rule out pinched/nonmanifold disks that an Euler count alone
  // would miss. Every interior link is one cycle; a boundary link is one path.
  for (const [v, pairs] of links) {
    const adjacency = new Map<number, number[]>();
    for (const [a, b] of pairs) {adjacency.set(a, [...adjacency.get(a) ?? [], b]); adjacency.set(b, [...adjacency.get(b) ?? [], a]);}
    const degrees = [...adjacency.values()].map(row => row.length);
    if (degrees.some(n => n < 1 || n > 2) || degrees.filter(n => n === 1).length !== (next.has(v) ? 2 : 0)) return null;
    const reached = new Set<number>(), pending = [adjacency.keys().next().value!];
    while (pending.length) {const n = pending.pop()!; if (reached.has(n)) continue; reached.add(n); pending.push(...adjacency.get(n)!);}
    if (reached.size !== adjacency.size) return null;
  }
  return boundary;
}

type ProjectedPoint = [Interval, Interval];
const subtractProjected = (a: ProjectedPoint, b: ProjectedPoint): ProjectedPoint => [intervalSubtract(a[0], b[0]), intervalSubtract(a[1], b[1])];
const affineProjected = (a: ProjectedPoint, b: ProjectedPoint): [Polynomial, Polynomial] => [[a[0], intervalSubtract(b[0], a[0])], [a[1], intervalSubtract(b[1], a[1])]];
const crossPolynomial2 = (a: [Polynomial, Polynomial], b: [Polynomial, Polynomial]): Polynomial => polynomialAdd(polynomialMultiply(a[0], b[1]), polynomialMultiply(a[1], b[0]), -1);
const dotPolynomial2 = (a: [Polynomial, Polynomial], b: [Polynomial, Polynomial]): Polynomial => polynomialAdd(polynomialMultiply(a[0], b[0]), polynomialMultiply(a[1], b[1]));

function projectedBoundarySeparated(a: BoundaryEdge, b: BoundaryEdge, first: readonly ProjectedPoint[], last: readonly ProjectedPoint[], tolerance: number): boolean {
  const shared = a.find(v => b.includes(v));
  if (shared !== undefined) {
    const va = a.find(v => v !== shared)!, vb = b.find(v => v !== shared)!;
    const u = affineProjected(subtractProjected(first[va], first[shared]), subtractProjected(last[va], last[shared]));
    const v = affineProjected(subtractProjected(first[vb], first[shared]), subtractProjected(last[vb], last[shared]));
    const opposite = bernstein(dotPolynomial2(u, v));
    if (strictIntervalSign(opposite, -1)) return true;
    const orientation = bernstein(crossPolynomial2(u, v));
    if (!orientation.some(intervalNonzero) || !closedIntervalSign(orientation, 1) && !closedIntervalSign(orientation, -1)) return false;
    return [0, orientation.length - 1].every(endpoint => intervalNonzero(orientation[endpoint]) || opposite[endpoint][1] < 0);
  }
  // Affine endpoint boxes enclose every intermediate boundary segment.
  const range = (edge: BoundaryEdge, axis: readonly number[]) => {
    let min = Infinity, max = -Infinity;
    for (const v of edge) for (const positions of [first, last]) {
      const p = positions[v], value = intervalAdd(intervalMultiply(p[0], singleton(axis[0])), intervalMultiply(p[1], singleton(axis[1])));
      min = Math.min(min, value[0]); max = Math.max(max, value[1]);
    }
    return [min, max];
  };
  const separates = (axis: readonly number[]) => {const aa = range(a, axis), bb = range(b, axis), gap = tolerance * Math.hypot(...axis); return bb[0] - aa[1] > gap || aa[0] - bb[1] > gap;};
  if (separates([1, 0]) || separates([0, 1])) return true;
  const middle = (v: number, k: number) => (first[v][k][0] + first[v][k][1] + last[v][k][0] + last[v][k][1]) / 4;
  for (const edge of [a, b]) {
    const direction = [0, 1].map(k => middle(edge[1], k) - middle(edge[0], k));
    if (separates([-direction[1], direction[0]]) || separates(direction)) return true;
  }
  // A moving boundary line is also an exact quadratic polynomial separator.
  // Both endpoints must stay strictly off it: nonadjacent boundary touching
  // is not enough to establish a simple closed projected boundary.
  for (const [edge, other] of [[a, b], [b, a]]) {
    const u = affineProjected(subtractProjected(first[edge[1]], first[edge[0]]), subtractProjected(last[edge[1]], last[edge[0]]));
    const distances = other.map(v => bernstein(crossPolynomial2(u, affineProjected(subtractProjected(first[v], first[edge[0]]), subtractProjected(last[v], last[edge[0]])))));
    if (strictIntervalSign(distances.flat(), 1) || strictIntervalSign(distances.flat(), -1)) return true;
  }
  return false;
}

/** Global alternative to pairwise triangle separation. An orientation-
 * preserving PL map of a triangulated disk whose boundary is a simple closed
 * curve has degree one; every triangle contributes positive degree, so its
 * projected interiors cannot overlap. The strict area and continuous boundary
 * tests below establish this for EVERY time of the linear segment. Thus the
 * spatial sheet is embedded too. Failed hypotheses fall back to the ordinary
 * triangle-pair verifier; a common source face is never a hypothesis. */
function projectionEmbedding(
  triangles: readonly Triangle[], boundary: readonly BoundaryEdge[], first: readonly V[], last: readonly V[], tolerance: number,
  tick: () => void, checkPair: () => void,
): boolean {
  const sum: V = [0, 0, 0];
  for (const t of triangles) {const n = unit(normal(t.map(v => midpoint(first[v], last[v])))); if (!n) return false; for (let k = 0; k < 3; k++) sum[k] += n[k];}
  const axis = unit(sum); if (!axis) return false;
  const coordinate: V = Math.abs(axis[0]) < .8 ? [1, 0, 0] : [0, 1, 0], u = unit(cross(axis, coordinate))!, v = cross(axis, u);
  const project = (positions: readonly V[]) => positions.map((_, vertex): ProjectedPoint => [projectionInterval(positions, vertex, u), projectionInterval(positions, vertex, v)]);
  const a = project(first), b = project(last);
  for (const t of triangles) {
    tick(); const [origin, q, r] = t;
    // Use the ACTUAL rounded projection basis in both area and boundary
    // proofs. Assuming cross(u,v) equals its intended unit axis would lose a
    // roundoff term precisely for nearly edge-on triangles.
    const e = affineProjected(subtractProjected(a[q], a[origin]), subtractProjected(b[q], b[origin]));
    const f = affineProjected(subtractProjected(a[r], a[origin]), subtractProjected(b[r], b[origin]));
    if (bernstein(crossPolynomial2(e, f)).some(value => value[0] <= tolerance * tolerance)) return false;
  }
  for (let i = 0; i < boundary.length; i++) for (let j = i + 1; j < boundary.length; j++) {
    tick(); checkPair();
    if (!projectedBoundarySeparated(boundary[i], boundary[j], a, b, tolerance)) return false;
  }
  return true;
}

function* broadPairs(triangles: readonly Triangle[], first: readonly V[], last: readonly V[], tolerance: number, tick: () => void): Generator<Candidate> {
  const boxes = triangles.map((triangle, index) => ({index,
    min: [0, 1, 2].map(axis => Math.min(...triangle.flatMap(v => [first[v][axis], last[v][axis]]))),
    max: [0, 1, 2].map(axis => Math.max(...triangle.flatMap(v => [first[v][axis], last[v][axis]]))),
  })).sort((a, b) => a.min[0] - b.min[0]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    tick();
    const a = boxes[i], b = boxes[j];
    if (b.min[0] > a.max[0] + tolerance) break;
    if ([1, 2].some(axis => b.min[axis] > a.max[axis] + tolerance || a.min[axis] > b.max[axis] + tolerance)) continue;
    yield {first: a.index, second: b.index, shared: triangles[a.index].filter(v => triangles[b.index].includes(v))};
  }
}

/** Certify the actual piecewise-LINEAR interpolation used by the flexible
 * preview. Every segment and potentially intersecting triangle pair receives
 * an interval proof. A finite set of legal sampled poses is never a proof.
 * Unknown contact, stacked-layer departure, degenerate motion, invalid input,
 * and exhausted budgets all return `inconclusive` and must block playback.
 * This certificate does not apply to a different/smoothed interpolation. */
export function certifySimulationStepFlexPath(
  mesh: SimulationStepFlexCollisionMesh,
  keyframes: readonly SimulationStepFlexKeyframe[],
  options: SimulationStepFlexCollisionOptions = {},
): SimulationStepPathCertificate {
  const tolerance = options.tolerance ?? 1e-8, maxPairs = options.maxPairs ?? 500_000, maxDepth = options.maxDepth ?? 12;
  const maxSegments = options.maxSegments ?? 1024, maxEvaluations = options.maxEvaluations ?? 32768;
  const maxTimeMs = options.maxTimeMs ?? 8000, deadline = Date.now() + maxTimeMs, minInterval = options.minInterval ?? 1e-10;
  let checkedPairs = 0, certifiedIntervals = 0, evaluations = 0, ticks = 0;
  let interval: [number, number] = [0, 1];
  const base = () => ({checkedPairs, certifiedIntervals, evaluations});
  const fail = (reason: string, pairs: SimulationStepCollisionPair[] = []): SimulationStepPathCertificate => ({status: 'inconclusive', pairs, reason, interval, ...base()});
  const tick = () => {if ((++ticks & 127) === 1 && Date.now() >= deadline) throw Error('budget');};
  try {
    if (![tolerance, maxTimeMs, minInterval].every(value => Number.isFinite(value) && value >= 0) ||
      ![maxPairs, maxDepth, maxSegments, maxEvaluations].every(value => Number.isSafeInteger(value) && value >= 0)) return fail('柔性连续碰撞检查的容差或计算预算无效。');
    if (mesh.indices.length % 3 || !mesh.indices.length || keyframes.length < 2 || keyframes.length - 1 > maxSegments || keyframes[0].progress !== 0 || keyframes[keyframes.length - 1].progress !== 1) return fail('柔性路径需要完整且有序的线性关键帧与三角网格。');
    if(options.contactMode==='nonpenetration'&&keyframes.length===2&&maxEvaluations>=2&&(!mesh.triangleSourceFaces||mesh.triangleSourceFaces.length===mesh.indices.length/3)){
      tick();
      if(certifyContactEmbedding(mesh.indices,keyframes[0].positions,keyframes[1].positions,tolerance,maxPairs)){
        if(Date.now()>=deadline)throw Error('budget');
        return {status:'clear',pairs:[],checkedPairs:0,certifiedIntervals:1,evaluations:2};
      }
    }
    const triangles: Triangle[] = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const triangle: Triangle = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
      if (triangle.some(v => !Number.isInteger(v) || v < 0) || new Set(triangle).size !== 3) return fail('柔性碰撞网格包含无效三角片。');
      triangles.push(triangle);
    }
    if (mesh.triangleSourceFaces && mesh.triangleSourceFaces.length !== triangles.length) return fail('柔性碰撞网格的材料来源数量不匹配。');
    const count = keyframes[0].positions.length;
    if (count % 3 || triangles.some(t => t.some(v => 3 * v + 2 >= count))) return fail('柔性碰撞网格与坐标数量不匹配。');
    for (let i = 0; i < keyframes.length; i++) {
      tick();
      const frame = keyframes[i];
      if (!Number.isFinite(frame.progress) || i && frame.progress <= keyframes[i - 1].progress || frame.positions.length !== count || Array.from(frame.positions).some(value => !Number.isFinite(value))) return fail('柔性关键帧包含无效坐标或进度。');
    }
    const reference = Array.from({length: count / 3}, (_, v) => point(keyframes[0].positions, v));
    const boundary = diskBoundary(triangles);
    for (let segment = 0; segment < keyframes.length - 1; segment++) {
      tick();
      const start = keyframes[segment], end = keyframes[segment + 1];
      interval = [start.progress, end.progress];
      const first = Array.from({length: count / 3}, (_, v) => point(start.positions, v));
      const last = Array.from({length: count / 3}, (_, v) => point(end.positions, v));
      evaluations += 2;
      if (evaluations > maxEvaluations) throw Error('budget');
      if (boundary && projectionEmbedding(triangles, boundary, first, last, tolerance, tick, () => {if (++checkedPairs > maxPairs) throw Error('budget');})) {certifiedIntervals++; continue;}
      // A collapsed triangle is an invalid material path even without another
      // face nearby. Recursion only refines a bound; it cannot hide collapse.
      const checkTriangle = (triangle: Triangle, a: readonly V[], b: readonly V[], lo: number, hi: number, depth: number): boolean => {
        tick();
        if (nondegenerate(a, b, triangle, tolerance)) return true;
        if (depth >= maxDepth || hi - lo <= minInterval) {interval = [lo, hi]; return false;}
        if (++evaluations > maxEvaluations) throw Error('budget');
        const middle = a.map((p, v) => midpoint(p, b[v])), mid = (lo + hi) / 2;
        return checkTriangle(triangle, a, middle, lo, mid, depth + 1) && checkTriangle(triangle, middle, b, mid, hi, depth + 1);
      };
      for (const triangle of triangles) if (!checkTriangle(triangle, first, last, start.progress, end.progress, 0)) return fail('柔性轨迹含退化纸面，或尚未证明整段纸面保持有效。');
      const checkPair = (pair: Candidate, a: readonly V[], b: readonly V[], lo: number, hi: number, depth: number): SimulationStepPathCertificate | null => {
        tick(); interval = [lo, hi];
        if (++checkedPairs > maxPairs) throw Error('budget');
        const ta = triangles[pair.first], tb = triangles[pair.second];
        if (sharedEdgeSeparated(a, b, ta, tb, pair.shared,options.contactMode==='nonpenetration') || fixedAxisSeparated(a, b, ta, tb, pair.shared, tolerance, reference) || movingPlaneSeparated(a, b, ta, tb, pair.shared, tolerance, reference,options.contactMode==='nonpenetration')) {certifiedIntervals++; return null;}
        evaluations += 3;
        if (evaluations > maxEvaluations) throw Error('budget');
        const penetration = pairPenetration(a, b, ta, tb, tolerance);
        if (penetration !== null) return {status: 'collision', pairs: [describe(mesh, pair.first, pair.second, pair.shared, 'penetration')], reason: '柔性纸面发生自穿透或跨纸层穿插。', interval, progress: lo + (hi - lo) * penetration, ...base()};
        if (depth >= maxDepth || hi - lo <= minInterval) return fail('柔性纸面接触尚未取得全区间分离证明；重叠纸层的离层方向也需另行证明。', [describe(mesh, pair.first, pair.second, pair.shared, 'touch')]);
        if (++evaluations > maxEvaluations) throw Error('budget');
        const middle = a.map((p, v) => midpoint(p, b[v])), mid = (lo + hi) / 2;
        return checkPair(pair, a, middle, lo, mid, depth + 1) ?? checkPair(pair, middle, b, mid, hi, depth + 1);
      };
      for (const pair of broadPairs(triangles, first, last, tolerance, tick)) {
        const result = checkPair(pair, first, last, start.progress, end.progress, 0);
        if (result) return result;
      }
    }
    return {status: 'clear', pairs: [], ...base()};
  } catch (error) {
    if (error instanceof Error && error.message === 'budget') return fail('柔性连续碰撞检查达到计算预算，尚未证明整条路径安全。');
    if (error instanceof Error && /退化/.test(error.message)) return fail('柔性碰撞检查遇到退化纸面，无法证明安全。');
    throw error;
  }
}
