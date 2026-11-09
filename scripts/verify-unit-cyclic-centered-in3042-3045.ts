/** Layer audit for Origamica's saved four-sided unit-cyclic centered pairs. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {prepareTessResult,readTessParams,tessConstructionKey,unitCyclicSourceParams,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {unitCyclicAltPreset,unitCyclicCenteredPreset} from '../src/app/unitCyclicSource';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const radians=(degrees:number)=>degrees*Math.PI/180;
const cross=(a:[number,number],b:[number,number])=>a[0]*b[1]-a[1]*b[0];
const faceIssue=(vertices:[number,number][],face:number[])=>{
  const points=face.map(index=>vertices[index]);
  const orient=(a:[number,number],b:[number,number],c:[number,number])=>
    cross([b[0]-a[0],b[1]-a[1]],[c[0]-a[0],c[1]-a[1]]);
  const selfCrossing=points.some((a,i)=>points.some((c,j)=>{
    if(i===j||(i+1)%points.length===j||(j+1)%points.length===i)return false;
    const b=points[(i+1)%points.length],d=points[(j+1)%points.length];
    return orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;
  }));
  const turns=points.map((point,index)=>{
    const next=points[(index+1)%points.length],end=points[(index+2)%points.length];
    return cross([next[0]-point[0],next[1]-point[1]],
      [end[0]-next[0],end[1]-next[1]]);
  });
  const significant=turns.filter(value=>Math.abs(value)>1e-8);
  if(selfCrossing)return {reason:'self-crossing',turns};
  return significant.some(value=>value>0)&&significant.some(value=>value<0)
    ? {reason:'concave',turns} : undefined;
};
const p0:[number,number]=[0,0],p1:[number,number]=[1,0];
const p2:[number,number]=[1+1.2*Math.cos(radians(95)),1.2*Math.sin(radians(95))];
// In[373] discards input angles 3 and 4: effective 75,85,105,95 degrees.
const u3:[number,number]=[Math.cos(radians(170)),Math.sin(radians(170))];
const u4:[number,number]=[Math.cos(radians(75)),Math.sin(radians(75))];
const length3=-cross(p2,u4)/cross(u3,u4);
const p3:[number,number]=[p2[0]+length3*u3[0],p2[1]+length3*u3[1]];
const q0:[number,number]=[p1[0]+p2[0]-p0[0],p1[1]+p2[1]-p0[1]];
const q3:[number,number]=[p1[0]+p2[0]-p3[0],p1[1]+p2[1]-p3[1]];

for(const [alternate,tileType,example] of [
  [false,'UnitCyclicPolygonCenteredTwistTile','In[3042]'],
  [true,'UnitCyclicPolygonCenteredTwistAltTile','In[3045]'],
] as const){
  const params=readTessParams(unitCyclicSourceParams(alternate?unitCyclicAltPreset():unitCyclicCenteredPreset()));
  assert.ok(params&&params.family==='custom');
  assert.equal(params.unitCyclic?.tileType,tileType);
  assert.deepEqual(params.faces,[[0,1,2,3],[4,2,1,5]]);
  [p0,p1,p2,p3,q0,q3].forEach((point,index)=>assert.ok(
    Math.hypot(point[0]-params.vertices[index][0],point[1]-params.vertices[index][1])<1e-8));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const request=structuredClone(params);
  delete request.unitCyclic;
  const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
  const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(request),
    encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const response=JSON.parse(run.stdout) as TessResponse;
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  const namedCode=`import json; from tessellation_unit_cyclic_centered import original_cyclic_centered_pair; print(json.dumps(original_cyclic_centered_pair(${alternate?'True':'False'})['fold']))`;
  const namedRun=spawnSync(python,['-c',namedCode],{cwd:path.join(root,'backend'),
    encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(namedRun.status,0,namedRun.error?.message||namedRun.stderr);
  const named=JSON.parse(namedRun.stdout) as typeof response.fold;
  assert.deepEqual(response.fold.edges_vertices,named.edges_vertices);
  assert.deepEqual(response.fold.edges_assignment,named.edges_assignment);
  assert.deepEqual(response.fold.faces_vertices,named.faces_vertices);
  assert.equal(response.fold.vertices_coords.length,named.vertices_coords.length);
  response.fold.vertices_coords.forEach((point,index)=>{
    assert.ok(Math.hypot(point[0]-named.vertices_coords[index][0],
      point[1]-named.vertices_coords[index][1])<1e-8,`named CP vertex ${index} differs`);
  });
  const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const invalidFaces=geometry.geometry.faces.flatMap((face,index)=>{
    const issue=faceIssue(geometry.geometry.vertices as [number,number][],face);
    return issue?[{index,face,...issue}]:[];
  });
  const unfoldedInvalidFaces=graph.faces_vertices?.flatMap((face,index)=>{
    const issue=faceIssue(graph.vertices_coords as [number,number][],face);
    return issue?[{index,face,...issue}]:[];
  })??[];
  assert.deepEqual(invalidFaces.map(({index,reason})=>({index,reason})),
    [{index:6,reason:'concave'},{index:8,reason:'concave'}]);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'solved',solved.layers.message);
  assert.equal(solved.layers.solutionCountExact,'1');
  assert.deepEqual(solved.geometry,geometry.geometry);
  assert.ok(solved.layers.faceOrders!.every(([a,b])=>a<graph.faces_vertices!.length&&b<graph.faces_vertices!.length));
  const regions=modelOverlapRegions(solved);
  for(const side of ['front','back'] as const)assert.ok(modelRegionLayers(solved,regions,side).every(region=>region.layers.status==='ordered'));
  console.log(JSON.stringify({tileType,example,
    cp:{vertices:response.stats.vertices,edges:response.stats.edges,faces:response.stats.faces},
    flatGeometry:geometry.geometry.status,layerOrder:solved.layers.status,
    solutions:solved.layers.solutionCountExact,message:solved.layers.message,
    invalidFaces,unfoldedInvalidFaces}));
}
