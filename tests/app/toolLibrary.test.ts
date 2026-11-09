import {test} from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../src/app/orieditaCatalog.json';

test('tool catalog exposes dynamic executable and record counts',()=>{
  const entries=catalog.filter(entry=>!!entry.tool);
  const executable=new Set(entries.map(entry=>entry.tool)).size;
  assert.equal(executable,80);
  assert.equal(entries.length,91);
  assert.equal(catalog.length,202);
  assert.ok(executable<catalog.length);
});
