import test from 'node:test';
import assert from 'node:assert/strict';
import saved from '../../src/app/flasherP46ReadonlyData.json';

test('In[4131]/In[4132] are fixed label seeds with different diagonals',()=>{
  const {Y,Z}=saved.sectors;
  for(const [variant,sector] of [['Y',Y],['Z',Z]] as const){
    assert.deepEqual(sector.input,{rings:4,heightOrder:1,rotationalOrder:5,
      sector:0,radialOrder:4,diagonal:variant});
    assert.equal(sector.status,'ideal-cp-seed-only');
    assert.equal(sector.foldedLinesCount,49);
    assert.equal(sector.diagonalCount,16);
    assert.equal(sector.labels.length,30);
    assert.equal(sector.lines.length,65);
    assert.equal(sector.lines.filter(line=>line.kind==='light').length,16);
  }
  assert.deepEqual(Y.lines.slice(0,49),Z.lines.slice(0,49));
  assert.notDeepEqual(Y.lines.slice(49),Z.lines.slice(49));
});

test('In[4206] fixture is uncut DP/FF, not a planar or adoptable sheet',()=>{
  const raw=saved.highF;
  assert.deepEqual(raw.input,{rings:2,heightOrder:2,rotationalOrder:4,
    focalLength:1e6,radialIncrement:.05,diagonal:'Y',minimumAngleDeg:10});
  assert.equal(raw.status,'uncut-dp-ff-read-only');
  assert.equal(raw.hasTruePlanarDevelopment,false);
  assert.deepEqual([raw.projected.length,raw.deployed.length,raw.folded.length,
    raw.edges.length,raw.faces.length],[60,60,60,156,97]);
  assert.ok(raw.maxDPFFFaceEdgeError<1e-10);
  assert.equal(saved.provenance,'local numerical reconstruction, not Mathematica Out');
});
