/** Full-pipeline layer audit of saved Origamica In[3048] Brocard offset pair. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];faces_vertices:number[][]};
type Named={fold:Cp;sourceTiles:{vertices:[number,number][]}[]};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const namedRun=spawnSync(python,['-c',
  "import json,sys;sys.path.insert(0,'backend');from tessellation_unit_cyclic_brocard_offset import original_cyclic_brocard_offset_pair;print(json.dumps(original_cyclic_brocard_offset_pair()))"],
  {cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
assert.equal(namedRun.status,0,namedRun.error?.message||namedRun.stderr);
const named=JSON.parse(namedRun.stdout) as Named;
const first=named.sourceTiles[0].vertices,second=named.sourceTiles[1].vertices;
const vertices=[...first,second[0],second[3],second[4]];
const base=tessPreset('custom');
assert.equal(base.family,'custom');
const tile=(offset:number)=>({width:.2,offset,tilt:90,
  centralTypes:['M','M','M','M','M'] as ('M'|'V')[]});
const params=readTessParams({...base,vertices,
  faces:[[0,1,2,3,4],[5,2,1,6,7]],repeatX:1,repeatY:1,
  customOutput:'tile-twists',tileTwists:[tile(.15),tile(-.15)],
  monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
    collinearCleanup:true,collinearTolerance:1e-8}});
assert.ok(params&&params.family==='custom');
const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(params),
  encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
assert.equal(run.status,0,run.error?.message||run.stderr);
const result=JSON.parse(run.stdout) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[34,52,19]);
const pipelineCp=result.fold as Cp,sourceCp=named.fold;
assert.deepEqual(pipelineCp.edges_vertices,sourceCp.edges_vertices);
assert.deepEqual(pipelineCp.edges_assignment,sourceCp.edges_assignment);
assert.deepEqual(pipelineCp.faces_vertices,sourceCp.faces_vertices);
assert.equal(pipelineCp.vertices_coords.length,sourceCp.vertices_coords.length);
pipelineCp.vertices_coords.forEach((point,index)=>{
  assert.ok(Math.hypot(point[0]-sourceCp.vertices_coords[index][0],
    point[1]-sourceCp.vertices_coords[index][1])<1e-8,`CP vertex ${index} differs`);
});
const concaveCpFaces=sourceCp.faces_vertices.flatMap((face,index)=>{
  const turns=face.map((_,i)=>{
    const a=sourceCp.vertices_coords[face[i]],
      b=sourceCp.vertices_coords[face[(i+1)%face.length]],
      c=sourceCp.vertices_coords[face[(i+2)%face.length]];
    return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
  });
  return turns.some(value=>value>1e-8)&&turns.some(value=>value< -1e-8)
    ? [index]:[];
});
assert.deepEqual(concaveCpFaces,[7,10]);
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const solved=recomputeFlatLayers(geometry);
assert.equal(solved.layers.status,'solved',solved.layers.message);
assert.equal(solved.layers.solutionCountExact,'1');
assert.deepEqual(solved.geometry,geometry.geometry);
assert.ok(solved.layers.faceOrders!.every(([a,b])=>a<graph.faces_vertices!.length&&b<graph.faces_vertices!.length));
const regions=modelOverlapRegions(solved);
for(const side of ['front','back'] as const)assert.ok(modelRegionLayers(solved,regions,side).every(region=>region.layers.status==='ordered'));
console.log(JSON.stringify({type:'UnitCyclicBrocardPolygonOffsetTwistTile',
  example:'In[3048]',cp:{vertices:result.stats.vertices,edges:result.stats.edges,
    faces:result.stats.faces,concaveFaces:concaveCpFaces},flatGeometry:geometry.geometry.status,
  layerOrder:solved.layers.status,solutions:solved.layers.solutionCountExact,
  message:solved.layers.message}));
