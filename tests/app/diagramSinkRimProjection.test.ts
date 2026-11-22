import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {mapDiagramFoldLines, type DiagramFoldLinkSettings} from '../../src/app/diagramFoldLink';
import type {DiagramPose} from '../../src/app/diagramProject';
import {modelProjection} from '../../src/app/modelProjection';
import {defaultModelView} from '../../src/app/modelViewState';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Point} from '../../src/core/types';

function paper(side: 'front' | 'back', folded: boolean, hinge = 50): DiagramPose {
  const doc = blankDoc('沉折投影', 100, 100);
  if (folded) doc.segments.push({id: 'middle', a: [hinge, 0], b: [hinge, 100], assignment: 'V', angle: 180});
  return {sourceStateId: 'cp0', sourceRevision: 0, sourceDoc: doc, result: computeFlatFold(doc),
    view: {...defaultModelView(), side, rotation: 33}};
}
function stroke(pose: DiagramPose, a: Point = [0, 30], b: Point = [50, 30]): DiagramLineAnnotation {
  const view = pose.view!;
  const projection = modelProjection(pose.result.geometry.vertices, view.side === 'back', view.rotation);
  return {id: 'sink', kind: 'line', style: 'valley', a: projection.project(a), b: projection.project(b),
    color: '#000000', width: .7, foldAngle: 57};
}
const selected = (selectedFaces: number[]): DiagramFoldLinkSettings => ({enabled: true, layers: 'selected', selectedFaces});
const top: DiagramFoldLinkSettings = {enabled: true, layers: 'top', selectedFaces: []};

test('沉折按主图实际可见纸面赋整圈，逐面反投影仍产生不同材料线段', () => {
  for (const side of ['front', 'back'] as const) {
    const pose = paper(side, true), line = stroke(pose);
    const ordinary = mapDiagramFoldLines(pose, [line], selected([0, 1]));
    const visible = mapDiagramFoldLines(pose, [line], top);
    const expected = visible.segments[0].assignment;
    assert.deepEqual(new Set(ordinary.segments.map(s => s.assignment)), new Set(['M', 'V']));
    for (const draw of [line, {...line, a: line.b, b: line.a}]) {
      const sink = mapDiagramFoldLines(pose, [{...draw, sinkFold: true}], selected([1, 0]));
      assert.equal(sink.segments.length, 2);
      assert.ok(sink.segments.every(s => s.assignment === expected && s.angle === (expected === 'M' ? -57 : 57)));
      if (draw === line) assert.deepEqual(sink.segments.map(s => [s.a, s.b]), ordinary.segments.map(s => [s.a, s.b]));
    }
    const topFace = visible.preview.find(p => p.visibility === 'visible')!.face;
    const other = topFace === 0 ? 1 : 0;
    const lower = mapDiagramFoldLines(pose, [line], selected([other])).segments[0].assignment;
    assert.notEqual(lower, expected);
    // Only the lower material sheet is selected. Its directly projected
    // crease has opposite parity, but the pen is seen on the upper sheet.
    const selectedLower = mapDiagramFoldLines(pose, [{...line, sinkFold: true}], selected([other]));
    assert.equal(selectedLower.segments.length, 1);
    assert.equal(selectedLower.segments[0].assignment, expected);
    assert.ok(selectedLower.preview.every(p => p.face === other));
    assert.deepEqual(selectedLower.segments.map(s => [s.a, s.b]),
      mapDiagramFoldLines(pose, [line], selected([other])).segments.map(s => [s.a, s.b]));
    pose.hiddenFaces = [topFace];
    const hidden = mapDiagramFoldLines(pose, [{...line, sinkFold: true}], selected([0, 1]));
    assert.equal(hidden.segments.length, 2);
    assert.ok(hidden.segments.every(s => s.assignment === lower));
    assert.equal(mapDiagramFoldLines(pose, [{...line, sinkFold: true}], selected([other])).segments[0].assignment, lower);
  }
});

test('背面观察会反转材料笔型，保存后的沉折可在所有纸面隐藏时按原类型回放', () => {
  for (const side of ['front', 'back'] as const) {
    const pose = paper(side, false);
    const line = {...stroke(pose), sinkFold: true as const};
    const expected = side === 'front' ? 'V' : 'M';
    assert.equal(mapDiagramFoldLines(pose, [line], selected([0])).segments[0].assignment, expected);
    pose.hiddenFaces = [0];
    assert.throws(() => mapDiagramFoldLines(pose, [line], selected([0])), /可见/);
    const saved = {...line, sinkAssignment: expected === 'V' ? 'M' as const : 'V' as const};
    for (const angle of [57, 0, null]) {
      const part = mapDiagramFoldLines(pose, [{...saved, foldAngle: angle}], selected([0])).segments[0];
      assert.equal(part.assignment, saved.sinkAssignment);
      assert.equal(part.angle, angle && part.assignment === 'M' ? -angle : angle);
    }
  }
});

test('主图线横跨两段不同的表层时，参考面取决于中心所在区间，反向画线结果相同', () => {
  const pose = paper('front', true, 30);
  const left = mapDiagramFoldLines(pose, [stroke(pose, [-35, 30], [-10, 30])], top);
  const large = left.preview[0].face;
  // The long face extends from -40 to 30. The small face covers 0 through
  // 30 only; bring it to the front there so the two intervals differ.
  pose.result.layers = {status: 'unknown', message: '按图示层序'};
  pose.displayOrder = [large, large === 0 ? 1 : 0];
  const small = mapDiagramFoldLines(pose, [stroke(pose, [5, 30], [25, 30])], top);
  const leftType = left.segments[0].assignment, rightType = small.segments[0].assignment;
  assert.notEqual(leftType, rightType);
  for (const [x, expected] of [[-40, leftType], [-10, rightType]] as const) {
    for (const [start, end] of [[x, 30], [30, x]]) {
      const line = {...stroke(pose, [start, 30], [end, 30]), sinkFold: true as const};
      const {segments} = mapDiagramFoldLines(pose, [line], selected([0, 1]));
      assert.ok(segments.length >= 2);
      assert.ok(segments.every(s => s.assignment === expected));
    }
  }
});
