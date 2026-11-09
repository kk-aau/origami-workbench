import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,unitCyclicSourceParams} from '../../src/app/tessellation';
import {readCustomMeshJson} from '../../src/app/customMeshJson';
import {readUnitCyclicSpec,unitCyclicAltPreset,unitCyclicCenteredPreset,
  unitCyclicEffectiveAngles,unitCyclicHexagonCenteredPreset,
  unitCyclicOctagonCenteredPreset,unitCyclicMesh}
  from '../../src/app/unitCyclicSource';

test('unit cyclic centered saved pair has source-preserving mesh',()=>{
  const spec=unitCyclicCenteredPreset();
  const parsed=readUnitCyclicSpec(spec); assert.ok(parsed);
  const mesh=unitCyclicMesh(parsed); assert.deepEqual(mesh.faces,[[0,1,2,3],[4,2,1,5]]); assert.equal(mesh.vertices.length,6);
  const params=readTessParams(unitCyclicSourceParams(parsed)); assert.ok(params&&params.family==='custom');
  assert.deepEqual(params.unitCyclic,parsed);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
});

test('unit cyclic Alt rejects forged geometry and accepts valid source',()=>{
  const spec=unitCyclicAltPreset(),params=unitCyclicSourceParams(spec);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),readTessParams(params));
  const forged=structuredClone(params); forged.vertices[2][0]+=1e-3;
  assert.equal(readTessParams(forged),null);
  const bad=structuredClone(spec); bad.side=4.9;
  assert.equal(readUnitCyclicSpec(bad),null);
  const wrongPair=structuredClone(spec); wrongPair.arrangement='in3042-pair';
  assert.equal(readUnitCyclicSpec(wrongPair),null);
  const obtuse=unitCyclicCenteredPreset(); obtuse.pleatAngle=100;
  assert.equal(readUnitCyclicSpec(obtuse),null);
});

test('unit cyclic source survives unchanged JSON mesh and clears after mesh edit',()=>{
  const params=readTessParams(unitCyclicSourceParams(unitCyclicCenteredPreset()));
  assert.ok(params&&params.family==='custom');
  const mesh={vertices:params.vertices,faces:params.faces};
  assert.deepEqual(readCustomMeshJson(params,JSON.stringify(mesh)).unitCyclic,params.unitCyclic);
  const changed=structuredClone(mesh); changed.vertices[3][0]+=0.01;
  assert.equal(readCustomMeshJson(params,JSON.stringify(changed)).unitCyclic,undefined);
});

test('Out[359] six-corner mother and its bounded centered single tile roundtrip',()=>{
  const spec=unitCyclicHexagonCenteredPreset();
  assert.deepEqual(unitCyclicEffectiveAngles(spec.angles),[128,119,118,115,114,126]);
  const parsed=readUnitCyclicSpec(JSON.parse(JSON.stringify(spec)));
  assert.deepEqual(parsed,spec);
  const mesh=unitCyclicMesh(spec);
  assert.deepEqual(mesh.faces,[[0,1,2,3,4,5]]);
  const independent=[
    [0,0],[1,0],[1.484809620246,0.874619707139],
    [0.924116803996,1.738010930346],[-0.152778288867,1.586663195108],
    [-0.444578582469,0.569034636484],
  ];
  mesh.vertices.forEach((point,i)=>point.forEach((value,j)=>
    assert.ok(Math.abs(value-independent[i][j])<1e-11,`vertex ${i}/${j}`)));
  const center:[number,number]=[.5,.5/Math.tan(61*Math.PI/360)];
  const radii=mesh.vertices.map(point=>Math.hypot(point[0]-center[0],
    point[1]-center[1]));
  assert.ok(Math.max(...radii)-Math.min(...radii)<1e-10);
  const actualGaps=mesh.vertices.map((point,i)=>{
    const next=mesh.vertices[(i+1)%6],a=[point[0]-center[0],point[1]-center[1]],
      b=[next[0]-center[0],next[1]-center[1]];
    return (Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1])*
      180/Math.PI+360)%360;
  });
  [61,61,63,67,65,43].forEach((wanted,i)=>
    assert.ok(Math.abs(actualGaps[i]-wanted)<1e-8,`actual gap ${i}`));
  // Subtract the side=1 alternating shift (+3°) to recover saved Out[359].
  [58,64,60,70,62,46].forEach((wanted,i)=>
    assert.ok(Math.abs(actualGaps[i]-(i%2===0?3:-3)-wanted)<1e-8,
      `Out[359] zero-mode gap ${i}`));
  const paper={shape:'square' as const,margin:.1};
  const params=readTessParams(unitCyclicSourceParams(spec,paper));
  assert.ok(params&&params.family==='custom');
  assert.deepEqual(params.unitCyclic,spec);
  assert.deepEqual(params.paper,paper);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.deepEqual(params.tileTwists?.map(t=>t.centralTypes.join('')),
    ['MMMMVV']);
  for(const mutate of [
    (p:typeof params)=>{p.vertices[2][0]+=.01;},
    (p:typeof params)=>{p.tileTwists![0].tilt=79;},
    (p:typeof params)=>{p.tileTwists![0].centralTypes[0]='V';},
    (p:typeof params)=>{p.unitCyclic!.angles[0]=127;},
  ]){
    const forged=structuredClone(params);mutate(forged);
    assert.equal(readTessParams(forged),null);
  }
  const changedAngle=changeTessParams(params,{tileTwists:[
    {...params.tileTwists![0],tilt:79}]});
  assert.ok(changedAngle.family==='custom');
  assert.equal(changedAngle.unitCyclic,undefined);
  const same=readCustomMeshJson(params,JSON.stringify({
    vertices:params.vertices,faces:params.faces}));
  assert.deepEqual(same.unitCyclic,spec);
  const vertices=structuredClone(params.vertices);vertices[2][0]+=.01;
  const changed=readCustomMeshJson(params,JSON.stringify({
    vertices,faces:params.faces}));
  assert.equal(changed.unitCyclic,undefined);
});

test('six-corner source rejects malformed, joined and nonconvex branches',()=>{
  const spec=unitCyclicHexagonCenteredPreset();
  for(const invalid of [
    {...spec,sideIndex:3},
    {...spec,arrangement:'in3042-pair',tiles:[...spec.tiles,...spec.tiles]},
    {...spec,tileType:'UnitCyclicPolygonCenteredTwistAltTile',twistAngle:30,
      pleatAngle:undefined},
    {...spec,angles:[179,179,179,179,0,0]},
    {...spec,side:6},
    {...spec,tiles:[{centralTypes:['M','M','M','M','V']}]},
  ])assert.equal(readUnitCyclicSpec(invalid),null);
  assert.deepEqual(readUnitCyclicSpec(unitCyclicCenteredPreset()),
    unitCyclicCenteredPreset());
  assert.deepEqual(readUnitCyclicSpec(unitCyclicAltPreset()),
    unitCyclicAltPreset());
});

test('formula-derived irregular octagon has a bounded cyclic mother and strict source',()=>{
  const spec=unitCyclicOctagonCenteredPreset();
  assert.deepEqual(unitCyclicEffectiveAngles(spec.angles),
    [140,135,135,135,130,135,135,135]);
  const mesh=unitCyclicMesh(spec);
  assert.deepEqual(mesh.faces,[[0,1,2,3,4,5,6,7]]);
  const expected=[
    [0,0],[1,0],[1.707106781186602,0.707106781186602],
    [1.707106781186602,1.707106781186602],[1,2.414213562373204],
    [-0.202015769308552,2.309050809179313],
    [-0.707106781186602,1.707106781186602],
    [-0.601944027992711,0.50509101187805],
  ];
  mesh.vertices.forEach((point,i)=>point.forEach((value,j)=>
    assert.ok(Math.abs(value-expected[i][j])<1e-11,`octagon vertex ${i}/${j}`)));
  const center:[number,number]=[.5,.5/Math.tan(Math.PI/8)];
  const gaps=mesh.vertices.map((point,i)=>{
    const next=mesh.vertices[(i+1)%8],a=[point[0]-center[0],point[1]-center[1]],
      b=[next[0]-center[0],next[1]-center[1]];
    return (Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1])*
      180/Math.PI+360)%360;
  });
  [45,45,45,45,55,35,55,35].forEach((wanted,i)=>
    assert.ok(Math.abs(gaps[i]-wanted)<1e-8,`actual n8 gap ${i}`));
  [40,50,40,50,50,40,50,40].forEach((wanted,i)=>
    assert.ok(Math.abs(gaps[i]-(i%2===0?5:-5)-wanted)<1e-8,
      `zero-mode n8 gap ${i}`));
  const params=readTessParams(unitCyclicSourceParams(spec,
    {shape:'square',margin:.1}));
  assert.ok(params&&params.family==='custom');
  assert.deepEqual(params.unitCyclic,spec);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.deepEqual(params.tileTwists?.map(t=>t.centralTypes.join('')),
    ['MMMMMMVV']);
  const unchanged=readCustomMeshJson(params,JSON.stringify({
    vertices:params.vertices,faces:params.faces}));
  assert.deepEqual(unchanged.unitCyclic,spec);
  const edited=structuredClone(params.vertices);edited[3][0]+=.01;
  assert.equal(readCustomMeshJson(params,JSON.stringify({
    vertices:edited,faces:params.faces})).unitCyclic,undefined);
  for(const mutate of [
    (p:typeof params)=>{p.vertices[3][0]+=.01;},
    (p:typeof params)=>{p.tileTwists![0].tilt=79;},
    (p:typeof params)=>{p.tileTwists![0].centralTypes[0]='V';},
    (p:typeof params)=>{p.unitCyclic!.angles[0]=139;},
  ]){
    const forged=structuredClone(params);mutate(forged);
    assert.equal(readTessParams(forged),null);
  }
  const changed=changeTessParams(params,{tileTwists:[
    {...params.tileTwists![0],tilt:79}]});
  assert.ok(changed.family==='custom');
  assert.equal(changed.unitCyclic,undefined);
  const neighboring=structuredClone(spec);neighboring.angles[0]=139;
  assert.ok(readUnitCyclicSpec(neighboring));
});

test('octagon source rejects malformed, joined and invalid angles',()=>{
  const spec=unitCyclicOctagonCenteredPreset();
  for(const invalid of [
    {...spec,sideIndex:3},
    {...spec,arrangement:'in3042-pair',tiles:[...spec.tiles,...spec.tiles]},
    {...spec,tileType:'UnitCyclicPolygonCenteredTwistAltTile',
      twistAngle:30,pleatAngle:undefined},
    {...spec,angles:[179,179,179,179,179,179,0,0]},
    {...spec,side:6},
    {...spec,tiles:[{centralTypes:['M','M','M','M','M','M','V']}]},
  ])assert.equal(readUnitCyclicSpec(invalid),null);
  assert.deepEqual(readUnitCyclicSpec(unitCyclicCenteredPreset()),
    unitCyclicCenteredPreset());
  assert.deepEqual(readUnitCyclicSpec(unitCyclicHexagonCenteredPreset()),
    unitCyclicHexagonCenteredPreset());
});
