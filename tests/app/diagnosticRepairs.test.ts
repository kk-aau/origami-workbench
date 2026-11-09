import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairOverlappingSegments, repairTJunctions } from '../../src/app/diagnosticRepairs';
import { diagnose } from '../../src/core/diagnostics';
import { type Assignment, type Doc, type Segment, defaultAngle } from '../../src/core/types';

const s = (id: string, a: [number, number], b: [number, number], assignment: Assignment = 'M'): Segment => ({ id, a, b, assignment, angle: defaultAngle(assignment) });
const base = (): Doc => ({ name: 'repair', paper: { width: 100, height: 100 }, segments: [s('b0', [0, 0], [100, 0], 'B'), s('b1', [100, 0], [100, 100], 'B'), s('b2', [100, 100], [0, 100], 'B'), s('b3', [0, 100], [0, 0], 'B')] });

test('overlap repair removes auxiliary coverage before main lines regardless of drawing order',()=>{
 for(const kind of ['M','V','B','F','U'] as Assignment[])for(const reverse of [false,true]){
  const lines=[s('main',[25,50],[75,50],kind),s('aux',[0,50],[100,50],'A')];if(reverse)lines.reverse();
  const d={...base(),segments:lines},r=repairOverlappingSegments(d,true);
  assert.equal(r.removed,1);assert.deepEqual(r.doc.segments.find(s=>s.assignment===kind),lines.find(s=>s.assignment===kind));
  assert.equal(r.doc.segments.filter(s=>s.assignment==='A').length,2);
 }
});

test('diagnostics identifies a T junction separately from a crossing', () => {
  const doc = base();
  doc.segments.push(s('main', [10, 50], [90, 50]), s('stub', [50, 50], [50, 80], 'V'));
  const issue = diagnose(doc).issues.find(item => item.code === 't-junction');
  assert.deepEqual(issue?.segmentIds, ['main', 'stub']);
  assert.deepEqual(issue?.point, [50, 50]);
});

test('T repair creates independently editable pieces and leaves source immutable', () => {
  const doc = base();
  doc.segments.push(s('main', [10, 50], [90, 50]), s('stub', [50, 50], [50, 80], 'V'));
  const before = structuredClone(doc);
  const result = repairTJunctions(doc);
  assert.equal(result.changed, true);
  assert.equal(result.split, 1);
  assert.equal(result.doc.segments.length, 7);
  assert.deepEqual(doc, before);
});

test('overlap repair removes same-type and cross-type duplicate pieces', () => {
  const doc = base();
  doc.segments.push(s('long', [0, 50], [100, 50]), s('short', [25, 50], [75, 50]));
  const result = repairOverlappingSegments(doc);
  assert.equal(result.removed, 1);
  assert.equal(result.doc.segments.filter(item => item.assignment === 'M').length, 3);

  const conflict = base();
  conflict.segments.push(s('m', [0, 50], [100, 50], 'M'), s('v', [25, 50], [75, 50], 'V'));
  const repaired = repairOverlappingSegments(conflict);
  assert.equal(repaired.removed,1);
  assert.equal(repaired.doc.segments.filter(item => item.assignment === 'M').length, 2);
  assert.equal(repaired.doc.segments.filter(item => item.assignment === 'V').length, 1);
  assert.equal(diagnose(repaired.doc).issues.some(item=>item.code==='overlap-conflict'),false);
});

test('repair uses later assignment but retains protected boundary when requested',()=>{
  const doc=base();doc.segments.push(s('cross', [0,0],[100,0],'V'));
  const free=repairOverlappingSegments(doc);
  assert.equal(free.doc.segments.filter(x=>x.a[1]===0&&x.b[1]===0)[0].assignment,'V');
  const protectedResult=repairOverlappingSegments(doc,true);
  assert.equal(protectedResult.doc.segments.filter(x=>x.a[1]===0&&x.b[1]===0)[0].assignment,'B');
});
