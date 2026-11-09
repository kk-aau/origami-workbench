/** Full-pipeline layer audit of the two saved unit-quad centered split pairs. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,unitQuadrilateralSplitSourceParams,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {unitQuadrilateralAltSplitPreset,unitQuadrilateralCenteredSplitPreset} from '../src/app/unitQuadrilateralSplitSource';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');

// UnitQuadrilateralVertices[{75,85,95,105} degrees,1.2,2].
const radians=(degrees:number)=>degrees*Math.PI/180;
const p0:[number,number]=[0,0],p1:[number,number]=[1,0];
const p2:[number,number]=[1+1.2*Math.cos(radians(95)),1.2*Math.sin(radians(95))];
const p3:[number,number]=[p2[1]/Math.tan(radians(75)),p2[1]];
const q0:[number,number]=[p1[0]+p2[0]-p0[0],p1[1]+p2[1]-p0[1]];
const q3:[number,number]=[p1[0]+p2[0]-p3[0],p1[1]+p2[1]-p3[1]];

for(const [alternate,tileType,example] of [
  [false,'UnitQuadrilateralCenteredSplitTwistTile','In[3066]'],
  [true,'UnitQuadrilateralCenteredSplitTwistAltTile','In[3069]'],
] as const){
  const params=readTessParams(unitQuadrilateralSplitSourceParams(alternate?unitQuadrilateralAltSplitPreset():unitQuadrilateralCenteredSplitPreset()));
  assert.ok(params&&params.family==='custom');
  assert.equal(params.unitQuadrilateralSplit?.tileType,tileType);
  assert.deepEqual(params.faces,[[0,1,2,3],[4,2,1,5]]);
  [p0,p1,p2,p3,q0,q3].forEach((point,index)=>assert.ok(
    Math.hypot(point[0]-params.vertices[index][0],point[1]-params.vertices[index][1])<1e-8));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const request=structuredClone(params);
  delete request.unitQuadrilateralSplit;
  const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(request),
    encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const response=JSON.parse(run.stdout) as TessResponse;
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  const namedCode=`import json; from tessellation_unit_quadrilateral_centered_split import original_quad_centered_split_pair; print(json.dumps(original_quad_centered_split_pair(${alternate?'True':'False'})['fold']))`;
  const namedRun=spawnSync(python,['-c',namedCode],{cwd:path.join(root,'backend'),
    encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(namedRun.status,0,namedRun.error?.message||namedRun.stderr);
  const named=JSON.parse(namedRun.stdout) as typeof response.fold;
  assert.deepEqual(response.fold.edges_vertices,named.edges_vertices);
  assert.deepEqual(response.fold.edges_assignment,named.edges_assignment);
  assert.deepEqual(response.fold.faces_vertices,named.faces_vertices);
  assert.equal(response.fold.vertices_coords.length,named.vertices_coords.length);
  // The JSON response rounds coordinates one decimal place more finely than
  // the direct named builder; topology, assignments and face IDs must match.
  response.fold.vertices_coords.forEach((point,index)=>{
    assert.ok(Math.hypot(point[0]-named.vertices_coords[index][0],
      point[1]-named.vertices_coords[index][1])<1e-8,
      `named CP vertex ${index} differs: ${JSON.stringify(point)} vs ${JSON.stringify(named.vertices_coords[index])}`);
  });
  const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'no-solution',solved.layers.message);
  console.log(JSON.stringify({tileType,example,
    cp:{vertices:response.stats.vertices,edges:response.stats.edges,faces:response.stats.faces},
    flatGeometry:geometry.geometry.status,layerOrder:solved.layers.status,
    solutions:solved.layers.solutionCountExact,message:solved.layers.message}));
}
