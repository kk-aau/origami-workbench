import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlasherXSavedTopology} from '../../src/app/flasherXSavedTopology';

test('In[4123] keeps exact source input and minor-then-major X order',()=>{
  const result=buildFlasherXSavedTopology();
  assert.deepEqual(result.savedInput,{rings:3,heightOrder:2,rotationalOrder:5,
    sector:0,radialOrder:6});
  assert.deepEqual(result.majorRows,[6,4,2]);
  assert.deepEqual(result.minorRows,[5,3,1]);
  assert.equal(result.diagonals.length,21);
  assert.deepEqual(result.diagonals.map(x=>x.sourceQuadIndex),
    [...Array.from({length:9},(_,i)=>i+12),...Array.from({length:12},(_,i)=>i)]);
});

test('X is the LLNL row checkerboard, rather than uniform Y or Z',()=>{
  const all=buildFlasherXSavedTopology().diagonals;
  const row=(region:'minor'|'major',index:number)=>all.filter(x=>
    x.region===region&&x.row===index).map(x=>x.diagonal).join(' ');
  assert.equal(row('minor',1),'13 24 13 24 13');
  assert.equal(row('minor',2),'24 13 24');
  assert.equal(row('minor',3),'13');
  assert.equal(row('major',1),'13 24 13 24 13 24');
  assert.equal(row('major',2),'24 13 24 13');
  assert.equal(row('major',3),'13 24');
  assert.equal(all.filter(x=>x.diagonal==='13').length,11);
  assert.equal(all.filter(x=>x.diagonal==='24').length,10);
});

test('wrapped seam vertices and signed source quad orientation are retained',()=>{
  const all=buildFlasherXSavedTopology().diagonals,first=all[0];
  assert.deepEqual(first.quadLabels,[[2,0,4],[1,0,4],[0,1,0],[1,2,0]]);
  assert.deepEqual(first.endpointLabels,[[2,0,4],[0,1,0]]);
  assert.ok(Math.abs(first.endpointCoords[0][0]-.5)<1e-12);
  assert.ok(Math.abs(first.endpointCoords[0][1]-1.8163563200134014)<1e-12);
  const unique=new Set(all.map(x=>x.endpointLabels.map(label=>label.join(','))
    .sort().join('|')));
  assert.equal(unique.size,21);
  for(const line of all){
    assert.ok(line.region==='major'?line.quadSignedArea>0:line.quadSignedArea<0);
    assert.ok(Math.hypot(line.endpointCoords[0][0]-line.endpointCoords[1][0],
      line.endpointCoords[0][1]-line.endpointCoords[1][1])>.8);
  }
});

test('all 21 selected endpoint labels match the existing source-quad implementation',()=>{
  const actual=buildFlasherXSavedTopology().diagonals.map(x=>
    x.endpointLabels.map(label=>label.join(',')).join(' → '));
  assert.deepEqual(actual,[
    '2,0,4 → 0,1,0','2,0,4 → 1,3,0','4,0,4 → 1,3,0',
    '4,0,4 → 1,5,0','6,0,4 → 1,5,0','1,3,0 → 3,4,0',
    '1,5,0 → 3,4,0','1,5,0 → 3,6,0','3,6,0 → 4,5,0',
    '1,0,0 → 0,1,0','1,0,0 → 2,2,0','3,0,0 → 2,2,0',
    '3,0,0 → 4,2,0','5,0,0 → 4,2,0','5,0,0 → 6,2,0',
    '2,2,0 → 3,4,0','4,2,0 → 3,4,0','4,2,0 → 5,4,0',
    '6,2,0 → 5,4,0','5,4,0 → 4,5,0','5,4,0 → 6,6,0',
  ]);
});

test('ideal seed topology cannot masquerade as a solved or adoptable FOLD',()=>{
  const result=buildFlasherXSavedTopology();
  assert.equal(result.idealCPSeedOnly,true);
  for(const field of ['solvedCreasePattern','foldedForm','mountainValleyAssigned',
    'isometryVerified','layerOrderVerified','exactStraightCreaseFOLD',
    'adoptableCreasePattern'] as const)assert.equal(result[field],false);
  assert.equal('faces_vertices' in result,false);
  assert.equal('edges_vertices' in result,false);
});
