/** Named In[3025]/In[3028]/In[3039] sources through the real custom pipeline. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,changeTessParams,prepareTessResult,
  readTessParams,tessConstructionKey,unitTriangleParams,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {triangleAltPleatAngle,triangleAltPreset,triangleCenteredPreset,
  triangleOffsetPreset,type UnitTriangleSpec} from '../src/app/unitTriangleSource';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const centered=triangleCenteredPreset(),alt=triangleAltPreset(),offset=triangleOffsetPreset();
assert.deepEqual(centered.angles,[50,60,70]);
assert.deepEqual(centered.tiles.map(t=>t.centralTypes.join('')),['MMM','VVV']);
assert.deepEqual(offset.tiles.map(t=>[t.offset,t.centralTypes.join('')]),[[.05,'MMM'],[-.05,'MMM']]);
assert.ok(Math.abs(triangleAltPleatAngle(alt)-77.896205688)<1e-8);
const samples:[UnitTriangleSpec,string,'solved'|'no-solution',string][]=[
  [centered,'In[3025]','no-solution','original_triangle_centered_pair(False)'],
  [alt,'In[3028]','solved','original_triangle_centered_pair(True)'],
  [offset,'In[3039]','solved','original_triangle_offset_pair()'],
];
for(const [spec,example,expectedStatus,namedCall] of samples){
  const params=unitTriangleParams(spec);
  const [,,third,fourth]=params.vertices;
  assert.ok(Math.abs(third[0]-.592396265452)<1e-9);
  assert.ok(Math.abs(third[1]-.705990377592)<1e-9);
  assert.ok(Math.abs(fourth[0]-third[0]-1)<1e-10);
  assert.deepEqual(params.faces,[[0,1,2],[3,2,1]]);
  assert.deepEqual(params.tileTwists?.map(t=>t.centralTypes.join('')),
    spec.tileType===offset.tileType?['MMM','MMM']:['MMM','VVV']);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.equal(readTessParams({...params,unitTriangle:{...spec,angles:[50,60,69]}}),null);
  assert.equal(readTessParams({...params,unitTriangle:{...spec,width:.11}}),null);
  assert.equal(readTessParams({...params,unitTriangle:{...spec,
    tiles:[spec.tiles[0],{...spec.tiles[1],centralTypes:['M','V','M']}]}}),null);
  assert.equal(readTessParams({...params,unitTriangle:{...spec,tiles:[spec.tiles[0]]}}),null);
  assert.equal(readTessParams({...params,vertices:params.vertices.map((p,i)=>
    i===3?[p[0]+.01,p[1]]:p)}),null);
  assert.equal(readTessParams({...params,monolithicOptions:{...params.monolithicOptions!,
    mergedEdges:'retain'}}),null);
  assert.equal(readTessParams({...params,unitRegularCentered:{tileType:'forged'}}),null);
  assert.equal((changeTessParams(params,{tileTwists:params.tileTwists?.map(t=>({...t}))}) as typeof params).unitTriangle,undefined);
  const unchanged=changeTessParams(params,{monolithicOptions:{...params.monolithicOptions!}});
  assert.equal(unchanged.family,'custom');
  assert.deepEqual(unchanged.unitTriangle,spec);
  const changed=changeTessParams(params,{monolithicOptions:{...params.monolithicOptions!,mergedEdges:'retain'}});
  assert.equal(changed.family,'custom');
  assert.equal(changed.unitTriangle,undefined);
  assert.ok(readTessParams(changed));
  const single=unitTriangleParams({...spec,arrangement:'single',tiles:[spec.tiles[0]]} as UnitTriangleSpec);
  assert.equal(single.faces.length,1);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(single))),single);
  const project={metadata:{tessellation:{parameters:params}}};
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(project)).metadata.tessellation.parameters),params);

  const {unitTriangle:_source,tileDecorations:_decoration,tileSpecs:_specs,...request}=params;
  assert.equal('unitTriangle' in request,false);
  assert.ok(readTessParams(request)); // Legacy custom projects have no named source.
  const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(request),
    encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const response=JSON.parse(run.stdout) as TessResponse;
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],[18,28,11]);
  const module=example==='In[3039]'?'tessellation_unit_triangle_offset':'tessellation_unit_triangle_centered';
  const named=spawnSync(python,['-c',`import json,sys;sys.path.insert(0,'backend');from ${module} import ${namedCall.split('(')[0]};print(json.dumps(${namedCall}['fold']))`],
    {cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(named.status,0,named.error?.message||named.stderr);
  type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
    edges_assignment:string[];faces_vertices:number[][]};
  const sourceCp=JSON.parse(named.stdout) as Cp,pipelineCp=response.fold as Cp;
  assert.deepEqual(pipelineCp.edges_vertices,sourceCp.edges_vertices);
  assert.deepEqual(pipelineCp.edges_assignment,sourceCp.edges_assignment);
  assert.deepEqual(pipelineCp.faces_vertices,sourceCp.faces_vertices);
  pipelineCp.vertices_coords.forEach((point,index)=>{
    assert.ok(Math.hypot(point[0]-sourceCp.vertices_coords[index][0],
      point[1]-sourceCp.vertices_coords[index][1])<1e-8,`${example} CP vertex ${index}`);
  });
  const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready');
  const layers=recomputeFlatLayers(geometry).layers;
  assert.equal(layers.status,expectedStatus,layers.message);
  if(expectedStatus==='solved')assert.equal(layers.solutionCountExact,'1');
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,layers.status),expectedStatus==='solved');
  for(const status of [undefined,'checking','unconfirmed','no-solution','invalid'])
    assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,status),false);
  console.log(JSON.stringify({source:spec.tileType,example,
    cp:{vertices:response.stats.vertices,edges:response.stats.edges,faces:response.stats.faces},
    layerOrder:layers.status,solutions:layers.solutionCountExact,
    namedCpMatches:true,savedParameters:true,forgedSourceRejected:true}));
}
