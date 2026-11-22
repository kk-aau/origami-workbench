import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {buildDiagramSinkSegments} from '../../src/app/diagramSinkFold';
import {blankDoc} from '../../src/app/state';
import {pointOnSegment} from '../../src/core/geometry';
import type {Point, Segment} from '../../src/core/types';

function segment(id: string, a: Point, b: Point, assignment: Segment['assignment'], angle: number | null): Segment {
  return {id, a, b, assignment, angle};
}
function rim(points: Point[], prefix = 'rim'): Segment[] {
  return points.map((a, i) => segment(`${prefix}-${i}`, a, points[(i + 1) % points.length], 'V', 80));
}
const square: Point[] = [[20, 20], [80, 20], [80, 80], [20, 80]];
const at = (segments: Segment[], p: Point) => segments.filter(s => pointOnSegment(p, s))
  .map(({assignment, angle}) => [assignment, angle]);

test('沉折以映射的分面线型建立闭环，仅互换内部的峰谷折痕并保留折角和纸张信息', () => {
  const doc = blankDoc('四色纸', 100, 100);
  doc.metadata = {paper: 'sample'};
  doc.segments.push(
    {...segment('cross', [0, 45], [100, 45], 'M', -35), displayColor: '#336699'},
    segment('inside', [25, 50], [75, 50], 'V', null),
    segment('flat-angle', [30, 60], [75, 60], 'V', 0),
    segment('old-rim', [0, 20], [100, 20], 'M', -15),
    segment('aux', [35, 30], [35, 62], 'A', 0),
    segment('unknown', [37, 30], [37, 62], 'U', null),
    segment('flat', [39, 30], [39, 62], 'F', 0),
  );
  const saved = structuredClone(doc);
  const [top, right, bottom, left] = rim(square);
  // Reversed, overlapping, subdivided material-bank clips meet at one corner
  // within the CP's existing tolerance; they still describe just one ring.
  const strokes = [left, {...top, b: [60, 20] as Point}, {...top, id: 'top-end', a: [80, 20] as Point, b: [40, 20] as Point},
    {...right, assignment: 'M' as const, angle: -80, a: [80 + 1e-8, 20] as Point}, bottom,
    {...bottom, a: bottom.b, b: bottom.a}];
  const output = applyDiagramFoldSegments(doc, buildDiagramSinkSegments(doc, strokes));
  assert.deepEqual(doc, saved);
  assert.deepEqual(output.metadata, doc.metadata);
  assert.deepEqual(at(output.segments, [50, 45]), [['V', 35]]);
  assert.deepEqual(at(output.segments, [10, 45]), [['M', -35]]);
  assert.deepEqual(at(output.segments, [90, 45]), [['M', -35]]);
  assert.deepEqual(at(output.segments, [45, 20]), [['V', 80]]);
  assert.deepEqual(at(output.segments, [10, 20]), [['M', -15]]);
  assert.deepEqual(at(output.segments, [80, 40]), [['M', -80]]);
  assert.deepEqual(at(output.segments, [52, 50]), [['M', null]]);
  assert.deepEqual(at(output.segments, [52, 60]), [['M', 0]]);
  assert.ok(output.segments.filter(s => s.a[1] === 45 && s.b[1] === 45).every(s => s.displayColor === '#336699'));
  for (const old of saved.segments.filter(s => ['B', 'A', 'U', 'F'].includes(s.assignment))) {
    assert.deepEqual(output.segments.find(s => s.id === old.id), old);
  }
});

test('凹多边形把贯穿折痕裁成多个独立内部区间，擦到角点的折痕保持原样', () => {
  const doc = blankDoc('U 形沉折', 100, 100);
  const concave = rim([[10, 10], [90, 10], [90, 80], [70, 80], [70, 30], [30, 30], [30, 80], [10, 80]]);
  doc.segments.push(segment('through', [0, 50], [100, 50], 'V', 103), segment('touch', [0, 20], [20, 0], 'M', -40));
  const output = applyDiagramFoldSegments(doc, buildDiagramSinkSegments(doc, concave));
  for (const x of [5, 50, 95]) assert.deepEqual(at(output.segments, [x, 50]), [['V', 103]]);
  for (const x of [20, 80]) assert.deepEqual(at(output.segments, [x, 50]), [['M', -103]]);
  assert.deepEqual(output.segments.find(s => s.id === 'touch'), doc.segments.at(-1));
});

test('拒绝残缺、自交、分支、多个轮廓和重合的冲突赋型', () => {
  const doc = blankDoc('无效边界', 100, 100);
  const edges = rim(square);
  const invalid: Segment[][] = [
    [], edges.slice(1), rim([[20, 20], [80, 80], [20, 80], [80, 20]]),
    [...edges, segment('spur', [50, 20], [50, 50], 'M', -90)],
    [...edges, ...rim([[30, 30], [50, 30], [40, 40]], 'inner')],
    [...edges, {...edges[2], id: 'conflict', assignment: 'M', angle: -80}],
    [...edges, {...edges[2], angle: 30}],
    rim([[0, 10], [40, 20], [0, 40]]),
  ];
  for (const strokes of invalid) assert.throws(() => buildDiagramSinkSegments(doc, strokes), /闭合|冲突|纸边/);
});
