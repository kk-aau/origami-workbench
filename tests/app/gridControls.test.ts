import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustGridDivisions, clampGridDivisions, DEFAULT_GRID_DIVISIONS, GRID_MAX, GRID_MIN } from '../../src/app/gridControls';

test('grid divisions clamp to supported bounds and recover invalid values', () => {
  assert.equal(GRID_MAX, 512);
  assert.equal(clampGridDivisions(NaN), DEFAULT_GRID_DIVISIONS);
  assert.equal(clampGridDivisions(0), GRID_MIN);
  assert.equal(clampGridDivisions(999), GRID_MAX);
  assert.equal(clampGridDivisions(7.6), 8);
  for(const divisions of [128,129,256,512])assert.equal(clampGridDivisions(divisions),divisions);
  assert.equal(clampGridDivisions(513),512);
});

test('grid quick changes double or halve without exceeding bounds', () => {
  assert.equal(adjustGridDivisions(8, 1), 16);
  assert.equal(adjustGridDivisions(8, -1), 4);
  assert.equal(adjustGridDivisions(1, -1), 1);
  assert.equal(adjustGridDivisions(100, 1), 200);
  assert.equal(adjustGridDivisions(128, 1), 256);
  assert.equal(adjustGridDivisions(256, 1), 512);
  assert.equal(adjustGridDivisions(512, 1), 512);
  assert.equal(adjustGridDivisions(512, -1), 256);
  assert.equal(adjustGridDivisions(513, -1), 256);
});
