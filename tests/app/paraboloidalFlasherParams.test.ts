import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deepBowlIn4208CutParams,paraboloidalFlasherPreset,readParaboloidalFlasherParams} from '../../src/app/paraboloidalFlasherParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,tessPreset,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {projectRigidQuad} from '../../src/app/rigidQuadView';

test('paraboloidal Flasher saves and restores both independent angle thresholds',()=>{
  const preset=paraboloidalFlasherPreset();
  assert.deepEqual(tessPreset('paraboloidal-flasher'),preset);
  assert.deepEqual(readTessParams(structuredClone(preset)),preset);
  const example={...preset,rotationalOrder:5,focalLength:3,radialIncrement:.1,
    diagonal:'Z' as const,minimumAngleDeg:20,cutMinimumAngleDeg:180};
  assert.deepEqual(readParaboloidalFlasherParams(example),example);
  assert.deepEqual(readTessParams(structuredClone(example)),example);
  const deepBowl=deepBowlIn4208CutParams();
  assert.deepEqual(deepBowl,{family:'paraboloidal-flasher',rings:2,heightOrder:3,
    rotationalOrder:6,focalLength:5,radialIncrement:.2,diagonal:'Y',
    minimumAngleDeg:20,cutMinimumAngleDeg:10});
  assert.deepEqual(readTessParams(structuredClone(deepBowl)),deepBowl);
});

test('paraboloidal Flasher reader rejects unsupported shape, paper and numerical ranges',()=>{
  const preset=paraboloidalFlasherPreset();
  for(const invalid of [
    {...preset,paper:{shape:'square',margin:.1}},
    {...preset,rings:3},
    {...preset,rings:1.5},
    {...preset,heightOrder:4},
    {...preset,rotationalOrder:9},
    {...preset,focalLength:0},
    {...preset,focalLength:Infinity},
    {...preset,radialIncrement:-.01},
    {...preset,diagonal:'Q'},
    {...preset,minimumAngleDeg:181},
    {...preset,cutMinimumAngleDeg:-1},
    {...preset,unknown:true},
  ])assert.equal(readTessParams(invalid),null,JSON.stringify(invalid));
  assert.deepEqual(readTessParams({...preset,radialIncrement:0,minimumAngleDeg:0,cutMinimumAngleDeg:180}),
    {...preset,radialIncrement:0,minimumAngleDeg:0,cutMinimumAngleDeg:180});
});

test('both original samples use cut true 2D CP and indexed static 3D FF/DP',()=>{
  const preset=paraboloidalFlasherPreset();
  const examples=[
    ['default',preset,100,196,97,60,56],
    ['z5',{...preset,rotationalOrder:5,focalLength:3,radialIncrement:.1,
      diagonal:'Z' as const,minimumAngleDeg:20,cutMinimumAngleDeg:180},125,245,121,75,0],
  ] as const;
  for(const [name,params,vertices,edges,faces,projectedVertices,assignedCreases] of examples){
    const response=JSON.parse(readFileSync(new URL(`../fixtures/constructed_paraboloidal_flasher_${name}.json`,import.meta.url),'utf8')) as TessResponse;
    const result=prepareTessResult(response,params);
    const fold=response.fold as {vertices_coords:number[][];edges_vertices:number[][];
      edges_assignment:string[];edges_foldAngle:(number|null)[]};
    const source=response.source;
    const scene=spatialMeshScene(result);
    assert.ok(scene,name);
    assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[vertices,edges,faces],name);
    assert.equal(fold.vertices_coords.length,vertices,name);
    assert.equal((source.originalProjectedVertices2D as unknown[]).length,projectedVertices,name);
    assert.equal((source.deployedForm3D as unknown[]).length,vertices,name);
    assert.equal(fold.edges_assignment.filter(kind=>kind==='B').length,vertices,name);
    assert.equal(fold.edges_assignment.filter(kind=>kind==='M'||kind==='V').length,assignedCreases,name);
    assert.equal(source.deployedPatternChecked,true,name);
    assert.equal(source.planarFaceOverlapChecked,true,name);
    assert.ok(scene.maximumFaceDistanceError<1e-8,name);
    for(let i=0;i<edges;i++){
      const kind=fold.edges_assignment[i],angle=fold.edges_foldAngle[i];
      if(kind==='B')assert.equal(angle,null,`${name} boundary ${i}`);
      if(kind==='M')assert.ok(angle!==null&&angle<0,`${name} mountain ${i}`);
      if(kind==='V')assert.ok(angle!==null&&angle>0,`${name} valley ${i}`);
      assert.ok(['B','U','M','V'].includes(kind),`${name} assignment ${i}`);
    }
    assert.equal(result.doc.segments.length,edges,name);
    assert.deepEqual(readTessParams(result.doc.metadata?.tessellation?.parameters),params,name);
    assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true,name);
    assert.equal(canAdoptTess(result,false,'stale',params),false,name);
    for(const back of [false,true])assert.equal(projectRigidQuad(scene,-25,48,back,0).faceOrder.length,faces,name);
  }
});

test('original X is editable, preserved, and uses independently checked cut CP/3D in adoption',()=>{
  const fixture=JSON.parse(readFileSync(new URL('../fixtures/constructed_paraboloidal_flasher_x_20261010.json',import.meta.url),'utf8'));
  assert.equal(fixture.source.formulaComputedNotSavedOut,true);
  assert.equal(fixture.source.wolframExecuted,false);
  const preset={...paraboloidalFlasherPreset(),diagonal:'X' as const};
  assert.deepEqual(readTessParams(preset),preset);
  assert.equal(readTessParams({...preset,diagonal:'Q'}),null);
  const docs=[];
  for(const sample of fixture.cases){
    const params=sample.parameters,response=sample.response as TessResponse;
    assert.deepEqual(readTessParams(params),params);
    const result=prepareTessResult(response,params),scene=spatialMeshScene(result);
    assert.ok(scene);
    assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[100,196,97]);
    assert.equal(response.stats.checks.geometry.status,'passed');
    assert.equal(response.stats.checks.layerOrder.status,'not_checked');
    assert.equal(response.source.staticGlobalIsometryChecked,true);
    assert.equal(response.source.planarFaceOverlapChecked,true);
    assert.equal(response.source.continuousRigidPathChecked,false);
    assert.deepEqual(readTessParams(result.doc.metadata?.tessellation?.parameters),params);
    assert.equal(result.doc.segments.length,196);
    assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true);
    assert.equal(canAdoptTess(result,true,tessConstructionKey(params),params),false);
    assert.equal(canAdoptTess(result,false,'stale',params),false);
    docs.push(result.doc);
  }
  assert.notDeepEqual(docs[0].segments,docs[1].segments);
});
