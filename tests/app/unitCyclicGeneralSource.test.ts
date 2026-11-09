import assert from 'node:assert/strict';
import test from 'node:test';
import {readTessParams,unitCyclicSourceParams} from '../../src/app/tessellation';
import {readUnitCyclicSpec,unitCyclicGeneralPreset,unitCyclicMesh,
  UNIT_CYCLIC_ALT_TYPE} from '../../src/app/unitCyclicSource';

test('In[378] mother and In[3041/3044] source cover bounded 3–24 sided single tiles',()=>{
  for(let n=3;n<=24;n++){
    const centered=unitCyclicGeneralPreset(n);
    if(n!==4)assert.equal(centered.arrangement,'single');
    for(const mode of ['centered','alt'] as const){
      const spec=mode==='centered'?centered:{
        angles:[...centered.angles],side:centered.side,sideIndex:centered.sideIndex,
        width:centered.width,arrangement:centered.arrangement==='single'?'single' as const:'in3045-pair' as const,
        tiles:centered.tiles.map(tile=>({centralTypes:[...tile.centralTypes]})),
        tileType:UNIT_CYCLIC_ALT_TYPE,twistAngle:30,
      };
      const valid=readUnitCyclicSpec(spec);
      assert.ok(valid,`n=${n}, ${mode}`);
      const mesh=unitCyclicMesh(valid);
      assert.equal(mesh.faces.length,n===4?2:1);
      const sides=mesh.vertices.slice(0,n).map((point,i)=>{
        const next=mesh.vertices[(i+1)%n];
        return Math.hypot(point[0]-next[0],point[1]-next[1]);
      });
      assert.ok(sides.every(side=>Math.abs(side-sides[0])<1e-8)||n===4||n===6||n===8);
      const params=readTessParams(unitCyclicSourceParams(valid));
      assert.ok(params&&params.family==='custom');
      assert.deepEqual(params.unitCyclic,valid);
      const forged=structuredClone(params);
      forged.vertices[2][0]+=.01;
      assert.equal(readTessParams(forged),null);
    }
  }
});

test('non-second side constraint changes irregular six-corner source and is strictly read back',()=>{
  const source=unitCyclicGeneralPreset(6);
  const changed={...source,sideIndex:4,side:1};
  const valid=readUnitCyclicSpec(changed);
  assert.ok(valid);
  const original=unitCyclicMesh(source),mesh=unitCyclicMesh(valid);
  assert.ok(Math.hypot(mesh.vertices[2][0]-original.vertices[2][0],
    mesh.vertices[2][1]-original.vertices[2][1])>1e-3);
  const side4=Math.hypot(mesh.vertices[4][0]-mesh.vertices[3][0],
    mesh.vertices[4][1]-mesh.vertices[3][1]);
  assert.ok(Math.abs(side4-1)<1e-8);
  assert.deepEqual(readTessParams(unitCyclicSourceParams(valid))?.unitCyclic,valid);
});

test('ignored final source angles preserve the original In[357] semantics',()=>{
  for(const n of [3,5,6,8,9,12,13,16,20,24]){
    const original=unitCyclicGeneralPreset(n),different=structuredClone(original);
    different.angles[n-1]=-372;
    if(n%2===0)different.angles[n-2]=412;
    assert.ok(readUnitCyclicSpec(different));
    assert.deepEqual(unitCyclicMesh(different),unitCyclicMesh(original));
    assert.deepEqual(readTessParams(unitCyclicSourceParams(different))?.unitCyclic,
      different);
  }
});

test('high-sided cyclic single tiles use solvable all-mountain default and reject outside current face capacity',()=>{
  for(const sides of [13,16,20,24]){
    const spec=unitCyclicGeneralPreset(sides);
    assert.deepEqual(spec.tiles[0].centralTypes,Array(sides).fill('M'));
    assert.deepEqual(readTessParams(unitCyclicSourceParams(spec))?.unitCyclic,spec);
  }
  assert.throws(()=>unitCyclicGeneralPreset(25),/3–24/);
  const forged=unitCyclicGeneralPreset(24);
  forged.angles.push(0);
  forged.tiles[0].centralTypes.push('M');
  assert.equal(readUnitCyclicSpec(forged),null);
});

test('24-sided cyclic source accepts nonuniform editable interior angles with exact project roundtrip',()=>{
  const spec=unitCyclicGeneralPreset(24);
  const regular=spec.angles[0];
  spec.angles=spec.angles.map((angle,i)=>i<22?regular+.05*Math.sin(i*1.7):angle);
  const valid=readUnitCyclicSpec(spec);
  assert.ok(valid);
  const mesh=unitCyclicMesh(valid);
  assert.equal(mesh.vertices.length,24);
  const first=Math.hypot(mesh.vertices[2][0]-mesh.vertices[1][0],
    mesh.vertices[2][1]-mesh.vertices[1][1]);
  assert.ok(Math.abs(first-1)<1e-8);
  assert.ok(mesh.vertices.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
  assert.deepEqual(readTessParams(unitCyclicSourceParams(valid))?.unitCyclic,valid);
});
