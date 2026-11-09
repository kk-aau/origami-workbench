import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {potFlangeDisplayScene,spatialMeshScene} from '../../src/app/spatialMeshView';
import {projectRigidQuad} from '../../src/app/rigidQuadView';
import {canAdoptTess,prepareTessResult,tessConstructionKey,tessPreset,type TessResponse} from '../../src/app/tessellation';

const tilt=0.4;
const fixture={
  source:{spatialKind:'origamica-radial-pot',staticGlobalIsometryChecked:true,
    foldedForm3D:[[0,0,0],[1,0,0],[1,Math.cos(tilt),Math.sin(tilt)],[0,Math.cos(tilt),Math.sin(tilt)]],
    maximumFaceDistanceError:1e-12},
  fold:{vertices_coords:[[0,0],[1,0],[1,1],[0,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','M','V','B'],
    faces_vertices:[[0,1,2,3]]},
};

test('a verified nonplanar original construction uses its own 3D vertices and developed paper',()=>{
  const scene=spatialMeshScene(fixture);
  assert.ok(scene);
  assert.deepEqual(scene.vertices,fixture.source.foldedForm3D);
  assert.ok(scene.vertices[2][2]>0);
  assert.equal(scene.faces.length,1);
  assert.ok(scene.maximumFaceDistanceError<1e-8);
  assert.notDeepEqual(projectRigidQuad(scene,20,50,false,0).points,projectRigidQuad(scene,20,50,true,0).points);
});

test('PotFlatFlangeInset decorates only the projected scene, not the verified 3D paper',()=>{
  const response=structuredClone(fixture);
  const source={...response.source,flatFlangeDisplay:{fraction:.1,vertexIndices:[1,2],sourceLetter:'b',displayOnly:true,metricPreserving:false}};
  const verified=spatialMeshScene({source,fold:response.fold});
  assert.ok(verified);
  const display=potFlangeDisplayScene(verified,source);
  assert.ok(display);
  assert.deepEqual(display.vertices[0],verified.vertices[0]);
  assert.deepEqual(display.vertices[2],[.9,.9*Math.cos(tilt),Math.sin(tilt)]);
  assert.deepEqual(verified.vertices,response.source.foldedForm3D);
  assert.equal(display.maximumFaceDistanceError,verified.maximumFaceDistanceError);
  assert.equal(spatialMeshScene({source:{...source,foldedForm3D:display.vertices},fold:response.fold}),null);
  assert.equal(potFlangeDisplayScene(verified,{...source,flatFlangeDisplay:{...source.flatFlangeDisplay,vertexIndices:[99]}}),null);
  assert.ok(potFlangeDisplayScene(verified,{...source,spatialKind:'origamica-rectangular-pot'}));
  assert.equal(potFlangeDisplayScene(verified,{...source,spatialKind:'origamica-twisted-pot'}),null);
  assert.ok(potFlangeDisplayScene(verified,{...source,spatialKind:'origamica-twisted-pot',
    flatFlangeDisplay:{...source.flatFlangeDisplay,sourceLetter:'r'}}));
});

test('the generated Origamica PotPlanar example is consumable from both sides as solid faces',()=>{
  const response=JSON.parse(readFileSync(new URL('../fixtures/constructed_radial_pot_planar.json',import.meta.url),'utf8'));
  const scene=spatialMeshScene(response);
  assert.ok(scene);
  assert.equal(scene.vertices.length,101);
  assert.equal(scene.edges.length,200);
  assert.equal(scene.faces.length,100);
  assert.ok(scene.maximumFaceDistanceError<1e-12);
  for(const back of [false,true]){
    const projection=projectRigidQuad(scene,-25,48,back,0);
    assert.equal(projection.surfaceOrderReliable,true);
    assert.equal(projection.faceOrder.length,100);
  }
});

test('both saved Origamica Flasher examples keep developed CP and static 3D form in one canvas',()=>{
  const cases=[
    ['y',tessPreset('flasher'),60,156,97],
    ['z',{...tessPreset('flasher'),rotationalOrder:5,radialIncrement:.1,diagonal:'Z' as const},75,195,121],
  ] as const;
  for(const [name,params,vertices,edges,faces] of cases){
    const response=JSON.parse(readFileSync(new URL(`../fixtures/constructed_flasher_${name}.json`,import.meta.url),'utf8')) as TessResponse;
    const result=prepareTessResult(response,params);
    const scene=spatialMeshScene(result);
    assert.ok(scene,name);
    assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[vertices,edges,faces]);
    assert.ok(scene.maximumFaceDistanceError<1e-10,name);
    assert.equal(result.fold&&typeof result.fold==='object'&&
      (result.fold as {vertices_coords:unknown[]}).vertices_coords.length,scene.vertices.length,name);
    assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true,name);
    for(const back of [false,true]){
      const projection=projectRigidQuad(scene,-25,48,back,0);
      assert.equal(projection.faceOrder.length,faces,name);
    }
  }
});

test('a cut paraboloidal Flasher independently verifies deployed DP and folded FF on one paper',()=>{
  const response=JSON.parse(readFileSync(new URL('../fixtures/constructed_paraboloidal_flasher_default.json',import.meta.url),'utf8')) as TessResponse;
  const params=tessPreset('paraboloidal-flasher');
  const result=prepareTessResult(response,params);
  const folded=spatialMeshScene(result,'folded'),deployed=spatialMeshScene(result,'deployed');
  assert.ok(folded);
  assert.ok(deployed);
  assert.deepEqual([folded.vertices.length,folded.edges.length,folded.faces.length],[100,196,97]);
  assert.deepEqual([deployed.vertices.length,deployed.edges.length,deployed.faces.length],[100,196,97]);
  assert.ok(folded.maximumFaceDistanceError<1e-9);
  assert.ok(deployed.maximumFaceDistanceError<1e-9);
  assert.notDeepEqual(folded.vertices,deployed.vertices);
  assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true);
  const unverified=structuredClone(result);
  unverified.source.deployedPatternChecked=false;
  assert.equal(spatialMeshScene(unverified,'deployed'),null);
  assert.ok(spatialMeshScene(unverified,'folded'));
});

test('the original polygon and circular pot borders retain an adoptable developed sheet and static 3D faces',()=>{
  for(const [border,vertices,edges] of [['polygon',106,205],['circular',161,260]] as const){
    const response=JSON.parse(readFileSync(new URL(`../fixtures/constructed_radial_pot_${border}.json`,import.meta.url),'utf8')) as TessResponse;
    const params={...tessPreset('radial-pot'),border};
    const result=prepareTessResult(response,params);
    const scene=spatialMeshScene(result);
    assert.ok(scene,border);
    assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[vertices,edges,100]);
    assert.ok(result.doc.segments.length>0,border);
    assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true,border);
    for(const back of [false,true])assert.equal(projectRigidQuad(scene,-25,48,back,0).surfaceOrderReliable,true,
      `${border} must keep opaque surface order from either side`);
  }
});

test('three original tube candidates keep real 3D topology and only paint provably ordered sides',()=>{
  const cases=[
    ['twist_joined_tube','twist-joined-tube',24,43,20,true],
    ['double_joined_tube','double-joined-tube',28,51,24,false],
    ['closed_topped_tube','closed-twist-topped-tube',23,37,15,false],
  ] as const;
  for(const [name,family,vertices,edges,faces,ordered] of cases){
    const sample=JSON.parse(readFileSync(new URL(`../fixtures/constructed_${name}.json`,import.meta.url),'utf8'));
    const params=tessPreset(family);
    const response:TessResponse={...sample,warnings:[],stats:{vertices,edges,faces,tiles:4,
      checks:{geometry:{status:'passed'},local:{status:'not_applicable'}}}};
    const prepared=prepareTessResult(response,params);
    assert.ok(prepared.doc.segments.length>0,name);
    assert.equal(canAdoptTess(prepared,false,tessConstructionKey(params),params),true,name);
    const scene=spatialMeshScene(sample);
    assert.ok(scene,name);
    assert.deepEqual([scene.vertices.length,scene.edges.length,scene.faces.length],[vertices,edges,faces]);
    assert.ok(scene.maximumFaceDistanceError<1e-12);
    assert.ok(Math.max(...scene.vertices.map(point=>point[2]))-Math.min(...scene.vertices.map(point=>point[2]))>.5);
    for(const back of [false,true]){
      const projection=projectRigidQuad(scene,-25,48,back,0);
      assert.equal(projection.faceOrder.length,faces);
      assert.equal(projection.surfaceOrderReliable,ordered,
        `${name}: opposite-facing coincident panels must stay wireframe without layer order`);
    }
  }
});

test('spatial candidates can be adopted only with current geometry and independent face isometry',()=>{
  const sample=JSON.parse(readFileSync(new URL('../fixtures/constructed_radial_pot_planar.json',import.meta.url),'utf8'));
  const params=tessPreset('radial-pot');
  const response:TessResponse={...sample,warnings:[],stats:{vertices:101,edges:200,faces:100,tiles:5,
    checks:{geometry:{status:'passed'},local:{status:'not_applicable'}}}};
  const result=prepareTessResult(response,params),signature=tessConstructionKey(params);
  assert.equal(canAdoptTess(result,false,signature,params),true);
  assert.equal(canAdoptTess(result,true,signature,params),false);
  assert.equal(canAdoptTess(result,false,'old-parameters',params),false);
  const forged=structuredClone(result);
  forged.source.foldedForm3D=(forged.source.foldedForm3D as [number,number,number][]).map(point=>[...point]);
  (forged.source.foldedForm3D as [number,number,number][])[4][2]+=.2;
  assert.equal(canAdoptTess(forged,false,signature,params),false);
});

test('reverse face winding is normalized for consistent front and back colors',()=>{
  const reversed=structuredClone(fixture);
  reversed.fold.faces_vertices=[[3,2,1,0]];
  const scene=spatialMeshScene(reversed);
  assert.ok(scene);
  assert.deepEqual(scene.faces,[[0,1,2,3]]);
  assert.equal(projectRigidQuad(scene,25,48,false,0).frontFacing[0],true);
  assert.equal(projectRigidQuad(scene,25,48,true,0).frontFacing[0],false);
});

test('a clockwise triangle with a reversed vertex origin remains a valid spatial face',()=>{
  const triangle=structuredClone(fixture);
  triangle.fold.faces_vertices=[[2,1,0]];
  const scene=spatialMeshScene(triangle);
  assert.ok(scene);
  assert.deepEqual(scene.faces,[[0,1,2]]);
});

test('unverified or inconsistent spatial data is refused instead of shown as a 3D result',()=>{
  const missingKind=structuredClone(fixture) as typeof fixture&{source:{spatialKind?:string}};
  delete missingKind.source.spatialKind;
  assert.equal(spatialMeshScene(missingKind),null);
  const unchecked=structuredClone(fixture);unchecked.source.staticGlobalIsometryChecked=false;
  assert.equal(spatialMeshScene(unchecked),null);
  const missingVertex=structuredClone(fixture);missingVertex.source.foldedForm3D.pop();
  assert.equal(spatialMeshScene(missingVertex),null);
  const wrongEdge=structuredClone(fixture);wrongEdge.fold.edges_vertices[0]=[0,99];
  assert.equal(spatialMeshScene(wrongEdge),null);
  const wrongFace=structuredClone(fixture);wrongFace.fold.faces_vertices=[[0,1,2,2]];
  assert.equal(spatialMeshScene(wrongFace),null);
  const badMetric=structuredClone(fixture);badMetric.source.foldedForm3D[2][2]+=0.2;
  assert.equal(spatialMeshScene(badMetric),null);
  const badClaim=structuredClone(fixture);badClaim.source.maximumFaceDistanceError=1e-2;
  assert.equal(spatialMeshScene(badClaim),null);
  const nonfinite=structuredClone(fixture);nonfinite.source.foldedForm3D[0][0]=Number.NaN;
  assert.equal(spatialMeshScene(nonfinite),null);
});
