import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectRigidQuad,rigidQuadScene,type RigidQuadScene} from '../../src/app/rigidQuadView';

const fixture={
  source:{output:'rigid-3d',staticGlobalIsometryChecked:true,
    foldedForm3D:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],
    maximumFaceDistanceError:1e-12,maximumGridClosureError:2e-12,maximumFoldAngleErrorRad:3e-12},
  fold:{vertices_coords:[[0,0],[1,0],[1,1],[0,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','M','V','B'],faces_vertices:[[0,1,2,3]]},
};

test('the main rigid view consumes the verified spatial graph, never a flat-fold surrogate',()=>{
  const scene=rigidQuadScene(fixture);
  assert.ok(scene);
  assert.deepEqual(scene.vertices,fixture.source.foldedForm3D);
  assert.equal(scene.faces.length,1);
  assert.equal(scene.minimumSpatialEdgeLength,1);
  const front=projectRigidQuad(scene,25,48,false,0);
  const back=projectRigidQuad(scene,25,48,true,0);
  assert.equal(front.frontFacing[0],true);
  assert.equal(back.frontFacing[0],false);
  assert.notDeepEqual(front.points,back.points);
});

test('changing true 3D coordinates changes the projection while retaining topology',()=>{
  const folded=structuredClone(fixture);
  for(const point of folded.source.foldedForm3D){
    const y=point[1];
    point[1]=y*Math.cos(0.4);
    point[2]=y*Math.sin(0.4);
  }
  const original=rigidQuadScene(fixture),next=rigidQuadScene(folded);
  assert.ok(original&&next);
  assert.notDeepEqual(projectRigidQuad(original,0,45,false,0).points,projectRigidQuad(next,0,45,false,0).points);
  assert.deepEqual(next.edges,original.edges);
});

test('a subdivided face keeps its front/back color when its first three vertices are collinear',()=>{
  const subdivided=structuredClone(fixture);
  subdivided.fold.vertices_coords.splice(1,0,[0.5,0]);
  subdivided.source.foldedForm3D.splice(1,0,[0.5,0,0]);
  subdivided.fold.faces_vertices=[[0,1,2,3,4]];
  subdivided.fold.edges_vertices=[[0,1],[1,2],[2,3],[3,4],[4,0]];
  subdivided.fold.edges_assignment=['B','B','M','V','B'];
  const scene=rigidQuadScene(subdivided);
  assert.ok(scene);
  assert.equal(projectRigidQuad(scene,25,48,false,0).frontFacing[0],true);
  assert.equal(projectRigidQuad(scene,25,48,true,0).frontFacing[0],false);
});

test('unverified, missing, or misindexed spatial states cannot appear as a current 3D result',()=>{
  const unverified=structuredClone(fixture);unverified.source.staticGlobalIsometryChecked=false;
  assert.equal(rigidQuadScene(unverified),null);
  const missing=structuredClone(fixture);missing.source.foldedForm3D.pop();
  assert.equal(rigidQuadScene(missing),null);
  const broken=structuredClone(fixture);broken.fold.edges_vertices[0]=[0,9];
  assert.equal(rigidQuadScene(broken),null);
  const inaccurate=structuredClone(fixture);inaccurate.source.maximumFoldAngleErrorRad=1e-3;
  assert.equal(rigidQuadScene(inaccurate),null);
  const invalidError=structuredClone(fixture);invalidError.source.maximumFaceDistanceError=-1;
  assert.equal(rigidQuadScene(invalidError),null);
  const nonfinite=structuredClone(fixture);nonfinite.source.maximumFoldAngleErrorRad=Number.NaN;
  assert.equal(rigidQuadScene(nonfinite),null);
  const unbounded=structuredClone(fixture);unbounded.source.foldedForm3D[1][0]=Number.POSITIVE_INFINITY;
  assert.equal(rigidQuadScene(unbounded),null);
  const distorted=structuredClone(fixture);distorted.source.foldedForm3D[2][2]=0.4;
  assert.equal(rigidQuadScene(distorted),null);
  const degenerate=structuredClone(fixture);degenerate.source.foldedForm3D[3]=[0,0,0];
  assert.equal(rigidQuadScene(degenerate),null);
  const nonfiniteFlat=structuredClone(fixture);nonfiniteFlat.fold.vertices_coords[2][0]=Number.NaN;
  assert.equal(rigidQuadScene(nonfiniteFlat),null);
});

test('solid face order follows overlap depth, and intersecting projected faces require wireframe',()=>{
  const base:RigidQuadScene={
    vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    edges:[],assignments:[],faces:[[0,1,2,3],[4,5,6,7]],
    maximumFaceDistanceError:0,maximumGridClosureError:0,maximumFoldAngleErrorRad:0,
    minimumSpatialEdgeLength:1,
  };
  const separated=projectRigidQuad(base,0,0,false,0);
  assert.equal(separated.surfaceOrderReliable,true);
  assert.deepEqual(separated.faceOrder,[0,1]);
  const crossing=structuredClone(base);
  for(const index of [4,7])crossing.vertices[index][2]=-1;
  const intersecting=projectRigidQuad(crossing,0,0,false,0);
  assert.equal(intersecting.surfaceOrderReliable,false);
});

test('original Miura 3×3 and In[2102] 5×5 have consistent opaque face order from both sides across camera angles',()=>{
  const samples=JSON.parse(readFileSync(new URL('../fixtures/origamica_rigid_quads.json',import.meta.url),'utf8')) as {
    vertices_coords3d:RigidQuadScene['vertices'];edges_vertices:RigidQuadScene['edges'];
    edges_assignment:RigidQuadScene['assignments'];faces_vertices:RigidQuadScene['faces'];
  }[];
  assert.deepEqual(samples.map(sample=>sample.faces_vertices.length),[9,25]);
  for(const sample of samples){
    const scene:RigidQuadScene={vertices:sample.vertices_coords3d,edges:sample.edges_vertices,
      assignments:sample.edges_assignment,faces:sample.faces_vertices,
      maximumFaceDistanceError:0,maximumGridClosureError:0,maximumFoldAngleErrorRad:0};
    scene.minimumSpatialEdgeLength=1;
    for(const back of [false,true])for(const elevation of [20,48,75])for(const azimuth of [-60,-25,0,45,110]){
      const projection=projectRigidQuad(scene,azimuth,elevation,back,0);
      assert.equal(projection.surfaceOrderReliable,true,
        `${sample.faces_vertices.length} faces, ${back?'back':'front'}, azimuth ${azimuth}, elevation ${elevation}`);
      assert.equal(new Set(projection.faceOrder).size,scene.faces.length);
    }
  }
});

test('irregular Miura static spatial faces retain a complete face order from both sides',()=>{
  const sample=JSON.parse(readFileSync(new URL('../fixtures/origamica_rigid_nonrect.json',import.meta.url),'utf8')) as {
    vertices_coords3d:RigidQuadScene['vertices'];edges_vertices:RigidQuadScene['edges'];
    edges_assignment:RigidQuadScene['assignments'];faces_vertices:RigidQuadScene['faces'];
  };
  const scene:RigidQuadScene={vertices:sample.vertices_coords3d,edges:sample.edges_vertices,
    assignments:sample.edges_assignment,faces:sample.faces_vertices,
    maximumFaceDistanceError:0,maximumGridClosureError:0,maximumFoldAngleErrorRad:0,
    minimumSpatialEdgeLength:1};
  assert.equal(scene.faces.length,9);
  for(const back of [false,true])for(const elevation of [20,48,75])for(const azimuth of [-60,-25,0,45,110]){
    const projection=projectRigidQuad(scene,azimuth,elevation,back,0);
    assert.equal(new Set(projection.faceOrder).size,9);
    assert.equal(projection.surfaceOrderReliable,true,
      `${back?'back':'front'}, azimuth ${azimuth}, elevation ${elevation}`);
  }
});
