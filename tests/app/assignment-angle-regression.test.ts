import test from 'node:test';
import assert from 'node:assert/strict';
import { assign, exampleDoc } from '../../src/app/state';

test('changing mountain/valley assignment preserves an explicit zero target', () => {
  const doc = exampleDoc();
  const crease = doc.segments.find(s => s.assignment === 'M')!;
  crease.angle = 0;
  const changed = assign(doc.segments, new Set([crease.id]), 'V');
  assert.equal(changed.find(s => s.id === crease.id)!.angle, 0);
  assert.equal(crease.angle, 0, 'the source document must remain unchanged');
});

test('clicking the already-active mountain type is a no-op for an unknown angle', () => {
  const doc = exampleDoc();
  const crease = doc.segments.find(s => s.assignment === 'M')!;
  crease.angle = null;
  const changed = assign(doc.segments, new Set([crease.id]), 'M');
  assert.deepEqual(changed, doc.segments);
});

test('changing the sense of an explicitly unknown mountain angle keeps it unknown', () => {
  const doc = exampleDoc();
  const crease = doc.segments.find(s => s.assignment === 'M')!;
  crease.angle = null;
  const changed = assign(doc.segments, new Set([crease.id]), 'V');
  assert.equal(changed.find(s => s.id === crease.id)!.assignment, 'V');
  assert.equal(changed.find(s => s.id === crease.id)!.angle, null);
});
