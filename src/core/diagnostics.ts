import { buildFold, collinearOverlap, distance, epsilonFor, segmentIntersection, sub } from './geometry';
import { validateDoc, type DiagnosticResult, type Doc, type Issue, type Point } from './types';
import {hasMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {flatCreaseLayerRegions} from './flatCreaseSupport';
import {overlappingSegmentPairs} from './segmentPairs';

/** Local necessary conditions, not a certificate of global flat-foldability or rigid motion. */
export function diagnose(doc: Doc): DiagnosticResult {
  const issues: Issue[] = [];
  let checkedVertices = 0, skippedVertices = 0;
  const add = (code: string, severity: Issue['severity'], message: string, segmentIds: string[] = [], point?: Point) => issues.push({ id: `${code}-${issues.length}`, code, severity, message, segmentIds, ...(point ? { point } : {}) });
  try { validateDoc(doc); } catch (e) { add('invalid-document', 'error', (e as Error).message); return finish(); }
  const material=hasMaterialTopology(doc)?inspectMaterialTopology(doc):null;
  if(material&&!material.ok){add('material-topology','error',material.reason);return finish();}
  const eps = epsilonFor(doc), lines = doc.segments.filter(s => s.assignment !== 'A');
  for (const s of lines) {
    if (distance(s.a, s.b) <= eps) add('zero-length', 'error', '零长线段无法参与折叠，请删除或重新绘制。', [s.id], s.a);
    if ((s.assignment === 'M' || s.assignment === 'V') && s.angle !== null && Math.abs(s.angle) !== 180) add('non-flat-angle', 'info', '此折痕设置了非平折角。平折检查按完全折叠 ±180° 进行，目标角保留给三维预览。', [s.id]);
  }
  for (const [i,j] of material?[]:overlappingSegmentPairs(lines,eps)) {
    const a = lines[i], b = lines[j];
    if (collinearOverlap(a, b, eps)) {
      const conflict = a.assignment !== b.assignment || a.angle !== b.angle;
      add(conflict ? 'overlap-conflict' : 'duplicate-overlap', conflict ? 'error' : 'warning', conflict ? '重合线段的线型或目标角冲突，无法确定纸面关系。' : '存在重复或部分重合的同类型线段；计算副本会合并，原工程保留。', [a.id, b.id], a.a);
    } else {
      const hit = segmentIntersection(a, b, eps);
      const ta = eps / Math.max(eps, distance(a.a, a.b)), tb = eps / Math.max(eps, distance(b.a, b.b));
      if (hit) {
        const aInterior = hit.t > ta && hit.t < 1 - ta, bInterior = hit.u > tb && hit.u < 1 - tb;
        if (aInterior !== bInterior) add('t-junction', 'warning', '检测到 T 接点：一条线段的端点落在另一条线段内部；编辑器选择与删除前应先修复为独立小段。', [a.id, b.id], hit.point);
        else if (aInterior && bInterior) add('intersection', 'info', '交点尚未成为原始线段端点；计算时会自动切分并连接，原工程未修改。', [a.id, b.id], hit.point);
      }
    }
    if (issues.length > 300) { add('issue-limit', 'error', '检测项较多，仅展示前 300 项；完整检查尚未完成，请先合并重复线或简化图形。'); return finish(); }
  }
  if (!lines.some(s => s.assignment === 'B')) add('no-boundary', 'error', '缺少纸张边界。纸张宽高仅是单位与视图信息，不能替代边界线。');
  if (issues.some(i => i.severity === 'error')) return finish();
  try {
    const { graph, edgeSourceIds } = buildFold(doc);
    let finiteFlatCreases=false;
    try{finiteFlatCreases=flatCreaseLayerRegions(graph,eps)!==null;}catch{/* Invalid F routes keep the ordinary dangling-edge diagnostic. */}
    const incident = graph.vertices_coords.map(() => [] as number[]);
    graph.edges_vertices.forEach(([a, b], i) => { incident[a].push(i); incident[b].push(i); });
    const boundaryVertices = new Set<number>();
    graph.edges_vertices.forEach(([a, b], i) => { if (graph.edges_assignment[i] === 'B') { boundaryVertices.add(a); boundaryVertices.add(b); } });
    for (const v of boundaryVertices) {
      const boundary = incident[v].filter(e => graph.edges_assignment[e] === 'B');
      if (boundary.length !== 2&&!(graph.faces_holes&&boundary.length>2&&boundary.length%2===0)) add('open-boundary', 'error', '边界不闭合或存在无法确定材料侧的分叉。', boundary.flatMap(e => edgeSourceIds[e]), graph.vertices_coords[v]);
    }
    graph.edges_vertices.forEach(([a], e) => {
      const faceCount = (graph.edges_faces?.[e] ?? []).filter(n => n !== null && n !== undefined).length;
      if ((faceCount === 0 || (graph.edges_assignment[e] !== 'B' && faceCount < 2))&&!(finiteFlatCreases&&graph.edges_assignment[e]==='F')) add('dangling-edge', 'error', '线段未把纸面分成相邻区域，可能悬空、位于纸外或边界未闭合。', edgeSourceIds[e], graph.vertices_coords[a]);
      if (graph.edges_assignment[e] === 'B' && faceCount > 1) add('boundary-interior', 'error', '边界两侧都出现纸面，请检查纸外折痕、内部误标边界或相交、接触的边界环。', edgeSourceIds[e], graph.vertices_coords[a]);
    });
    for (let v = 0; v < incident.length; v++) {
      if (boundaryVertices.has(v)) { skippedVertices++; continue; }
      const folds = incident[v].filter(e => ['M', 'V', 'U'].includes(graph.edges_assignment[e]));
      if (!folds.length) continue;
      const ids = [...new Set(folds.flatMap(e => edgeSourceIds[e]))];
      const point = graph.vertices_coords[v];
      checkedVertices++;
      if (folds.length % 2 !== 0) { add('odd-degree', 'error', `内部顶点连接 ${folds.length} 条折痕，为奇数，不满足完全平折的必要条件。`, ids, point); continue; }
      const angles = folds.map(e => {
        const other = graph.edges_vertices[e].find(w => w !== v)!;
        const d = sub(graph.vertices_coords[other], point); return Math.atan2(d[1], d[0]);
      }).sort((a, b) => a - b);
      let alternating = 0;
      for (let i = 0; i < angles.length; i += 2) alternating += (angles[(i + 1) % angles.length] - angles[i] + Math.PI * 2) % (Math.PI * 2);
      if (Math.abs(alternating - Math.PI) > 1e-4) add('kawasaki', 'error', `川崎条件不满足：交替扇形角和为 ${(alternating * 180 / Math.PI).toFixed(2)}°，应为 180°。`, ids, point);
      if (folds.some(e => graph.edges_assignment[e] === 'U')) { skippedVertices++; add('unassigned', 'warning', '顶点含未指派山谷的折痕，前川山谷数量检查暂不适用。', ids, point); }
      else {
        const m = folds.filter(e => graph.edges_assignment[e] === 'M').length, valley = folds.length - m;
        if (Math.abs(m - valley) !== 2) add('maekawa', 'error', `前川条件不满足：山折 ${m}、谷折 ${valley}，数量之差的绝对值应为 2。`, ids, point);
      }
    }
  } catch (e) { add('topology', 'error', `无法建立纸面：${(e as Error).message}`); }
  return finish();

  function finish(): DiagnosticResult {
    return { issues, summary: { errors: issues.filter(i => i.severity === 'error').length, warnings: issues.filter(i => i.severity === 'warning').length, checkedVertices, skippedVertices } };
  }
}
