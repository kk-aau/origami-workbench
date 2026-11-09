import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import TessRigidPane from '../../src/components/TessRigidPane';
import {defaultModelView} from '../../src/app/modelViewState';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {embedVerifiedSpatialTile,projectEmbeddedSpatialTile} from '../../src/app/spatialTileEmbedding';
import {projectRigidQuad} from '../../src/app/rigidQuadView';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/constructed_twist_joined_tube.json',import.meta.url),'utf8'));
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} should equal ${expected}`);

test('a verified spatial candidate keeps its real z coordinates through an XY tile placement',()=>{
  const original=structuredClone(fixture);
  const embedded=embedVerifiedSpatialTile(fixture,{offset:[3,-2],rotationRad:Math.PI/2,scale:2});
  assert.ok(embedded);
  assert.deepEqual(fixture,original,'placement does not mutate the candidate');
  const index=fixture.source.foldedForm3D.findIndex((point:number[])=>Math.abs(point[2])>.1);
  assert.ok(index>=0);
  const [x,y,z]=fixture.source.foldedForm3D[index];
  const [flatX,flatY]=fixture.fold.vertices_coords[index];
  embedded.scene.vertices[index].forEach((actual,i)=>near(actual,[3-2*y,-2+2*x,2*z][i]));
  embedded.developedVertices[index].forEach((actual,i)=>near(actual,[3-2*flatY,-2+2*flatX][i]));
  assert.notEqual(embedded.scene.vertices[index][2],0);
  assert.deepEqual(embedded.scene.faces,fixture.fold.faces_vertices);
  assert.deepEqual(embedded.scene.edges,fixture.fold.edges_vertices);
  assert.deepEqual(embedded.scene.assignments,fixture.fold.edges_assignment);
  assert.ok(embedded.scene.minimumSpatialEdgeLength>0);
  assert.ok(embedded.scene.maximumFaceDistanceError<1e-7);
  const drawing=projectRigidQuad(embedded.scene,-25,48,false,0);
  assert.equal(drawing.points.length,fixture.source.foldedForm3D.length);
});

test('unverified geometry, missing 3D source, and invalid placements cannot enter the spatial decoration adapter',()=>{
  const placement={offset:[0,0] as [number,number],rotationRad:0,scale:1};
  const unverified=structuredClone(fixture);unverified.source.staticGlobalIsometryChecked=false;
  assert.equal(embedVerifiedSpatialTile(unverified,placement),null);
  const missing=structuredClone(fixture);delete missing.source.foldedForm3D;
  assert.equal(embedVerifiedSpatialTile(missing,placement),null);
  const flat={fold:fixture.fold,source:{output:'tiling'}};
  assert.equal(embedVerifiedSpatialTile(flat,placement),null,'a 2D graph is not promoted into a 3D source');
  const invalid=structuredClone(fixture);invalid.source.foldedForm3D[0][2]+=0.25;
  assert.equal(embedVerifiedSpatialTile(invalid,placement),null);
  assert.equal(embedVerifiedSpatialTile(fixture,{...placement,scale:0}),null);
  const reversed=embedVerifiedSpatialTile(fixture,{...placement,scale:-2});
  assert.ok(reversed,'the saved placement formula also admits a nondegenerate negative scale');
  const raised=fixture.source.foldedForm3D.findIndex((point:number[])=>Math.abs(point[2])>.1);
  near(reversed.scene.vertices[raised][2],-2*fixture.source.foldedForm3D[raised][2]);
  assert.deepEqual(reversed.scene.faces,fixture.fold.faces_vertices);
  assert.equal(embedVerifiedSpatialTile(fixture,{...placement,rotationRad:Number.NaN}),null);
  assert.equal(embedVerifiedSpatialTile(fixture,{...placement,offset:[Number.POSITIVE_INFINITY,0]}),null);
  assert.equal(embedVerifiedSpatialTile(fixture,{...placement,offset:[1e300,0],scale:1e-300}),null,
    'the transformed face must remain numerically valid');
});

test('the rigid quad route also keeps the measured fold height',()=>{
  const tilt=.4;
  const result={source:{output:'rigid-3d',staticGlobalIsometryChecked:true,
    foldedForm3D:[[0,0,0],[1,0,0],[1,Math.cos(tilt),Math.sin(tilt)],[0,Math.cos(tilt),Math.sin(tilt)]],
    maximumFaceDistanceError:0,maximumGridClosureError:0,maximumFoldAngleErrorRad:0},
  fold:{vertices_coords:[[0,0],[1,0],[1,1],[0,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','M','B','V'],
    faces_vertices:[[0,1,2,3]]}};
  const embedded=embedVerifiedSpatialTile(result,{offset:[-1,2],rotationRad:0,scale:3});
  assert.ok(embedded);
  near(embedded.scene.vertices[2][2],3*Math.sin(tilt));
  assert.deepEqual(embedded.developedVertices[2],[2,5]);
  assert.equal(embedded.scene.faces.length,1);
});

test('the original and placed graph share a camera while visible faces use placed 3D indices',()=>{
  const embedded=embedVerifiedSpatialTile(fixture,{offset:[3,-2],rotationRad:Math.PI/2,scale:2});
  assert.ok(embedded);
  const {projection,placedVertexOffset}=projectEmbeddedSpatialTile(embedded,-25,48,false,0);
  assert.equal(placedVertexOffset,fixture.fold.vertices_coords.length);
  assert.equal(projection.points.length,2*placedVertexOffset);
  assert.equal(projection.frontFacing.length,fixture.fold.faces_vertices.length);
  assert.deepEqual(projection.faceOrder.slice().sort((a,b)=>a-b),
    fixture.fold.faces_vertices.map((_:unknown,index:number)=>index));
  const moved=fixture.source.foldedForm3D.findIndex((point:number[])=>Math.abs(point[2])>.1);
  assert.ok(moved>=0);
  assert.notDeepEqual(projection.points[moved],projection.points[moved+placedVertexOffset]);
  const direct=projectRigidQuad(embedded.scene,-25,48,false,0);
  assert.deepEqual(projection.frontFacing,direct.frontFacing);
  assert.equal(projection.surfaceOrderReliable,direct.surfaceOrderReliable);
});

test('only a current verified 3D result exposes the spatial placement entry',()=>{
  const view=defaultModelView();
  const render=(result:typeof fixture|null,current:boolean)=>renderToStaticMarkup(createElement(TessRigidPane,
    {result,current,view,fitToken:0,open:true,sceneOverride:spatialMeshScene(result)}));
  assert.match(render(fixture,true),/空间图放置/);
  assert.doesNotMatch(render(fixture,false),/空间图放置/);
  const unverified=structuredClone(fixture);unverified.source.staticGlobalIsometryChecked=false;
  assert.doesNotMatch(render(unverified,true),/空间图放置/);
});
