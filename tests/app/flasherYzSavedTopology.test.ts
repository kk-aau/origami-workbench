import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlasherYzSavedTopology} from '../../src/app/flasherYzSavedTopology';

const endpoints=(variant:'Y'|'Z')=>buildFlasherYzSavedTopology(variant).diagonals
  .map(item=>item.endpointLabels.map(label=>label.join(',')).join(' → '));

test('In[4125]/In[4127] keep their identical fixed input and source order',()=>{
  for(const variant of ['Y','Z'] as const){
    const result=buildFlasherYzSavedTopology(variant);
    assert.deepEqual(result.savedInput,{rings:3,heightOrder:2,rotationalOrder:5,
      sector:0,radialOrder:6});
    assert.deepEqual(result.diagonals.map(item=>item.sourceQuadIndex),
      Array.from({length:21},(_,i)=>i));
    assert.deepEqual(result.diagonals.map(item=>item.region),
      [...Array(12).fill('major'),...Array(9).fill('minor')]);
    assert.deepEqual(result.majorRows,[6,4,2]);
    assert.deepEqual(result.minorRows,[5,3,1]);
    assert.equal(result.sourceCells[3],variant==='Y'?'In[4125]':'In[4127]');
  }
});

test('all 21 Y and Z endpoint labels match the saved source-quad rules',()=>{
  assert.deepEqual(endpoints('Y'),[
    '1,0,0 → 0,1,0','2,0,0 → 1,2,0','3,0,0 → 2,2,0',
    '4,0,0 → 3,2,0','5,0,0 → 4,2,0','6,0,0 → 5,2,0',
    '3,2,0 → 2,3,0','4,2,0 → 3,4,0','5,2,0 → 4,4,0',
    '6,2,0 → 5,4,0','5,4,0 → 4,5,0','6,4,0 → 5,6,0',
    '2,0,4 → 0,1,0','3,0,4 → 1,2,0','4,0,4 → 1,3,0',
    '5,0,4 → 1,4,0','6,0,4 → 1,5,0','1,4,0 → 2,3,0',
    '1,5,0 → 3,4,0','1,6,0 → 3,5,0','3,6,0 → 4,5,0',
  ]);
  assert.deepEqual(endpoints('Z'),[
    '0,0,0 → 1,2,0','1,0,0 → 2,2,0','2,0,0 → 3,2,0',
    '3,0,0 → 4,2,0','4,0,0 → 5,2,0','5,0,0 → 6,2,0',
    '2,2,0 → 3,4,0','3,2,0 → 4,4,0','4,2,0 → 5,4,0',
    '5,2,0 → 6,4,0','4,4,0 → 5,6,0','5,4,0 → 6,6,0',
    '1,0,4 → 1,2,0','2,0,4 → 1,3,0','3,0,4 → 1,4,0',
    '4,0,4 → 1,5,0','5,0,4 → 1,6,0','1,3,0 → 3,4,0',
    '1,4,0 → 3,5,0','1,5,0 → 3,6,0','3,5,0 → 5,6,0',
  ]);
});

test('Y and Z select complementary nondegenerate diagonals of each same quad',()=>{
  const y=buildFlasherYzSavedTopology('Y').diagonals;
  const z=buildFlasherYzSavedTopology('Z').diagonals;
  for(let i=0;i<21;i++){
    assert.deepEqual(y[i].quadLabels,z[i].quadLabels);
    assert.deepEqual(y[i].quadCoords,z[i].quadCoords);
    assert.equal(y[i].diagonal,'13');
    assert.equal(z[i].diagonal,'24');
    assert.notDeepEqual(y[i].endpointLabels,z[i].endpointLabels);
    for(const item of [y[i],z[i]])assert.ok(Math.hypot(
      item.endpointCoords[0][0]-item.endpointCoords[1][0],
      item.endpointCoords[0][1]-item.endpointCoords[1][1])>.8);
  }
});

test('Y/Z drawing is only an ideal seed, independent of solved CP/FF',()=>{
  for(const variant of ['Y','Z'] as const){
    const result=buildFlasherYzSavedTopology(variant);
    assert.equal(result.idealCPSeedOnly,true);
    for(const field of ['solvedCreasePattern','foldedForm','mountainValleyAssigned',
      'isometryVerified','layerOrderVerified','exactStraightCreaseFOLD',
      'adoptableCreasePattern'] as const)assert.equal(result[field],false);
    assert.equal('faces_vertices' in result,false);
    assert.equal('edges_vertices' in result,false);
  }
});
