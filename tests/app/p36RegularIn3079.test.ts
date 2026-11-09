import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,unitRegularCenteredParams,
  type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {unitRegularCenteredAltSidePairPreset,unitRegularOffsetSidePairPreset,unitRegularOffsetFourPreset,
  unitRegularSidePairLayout} from '../../src/app/unitRegularCentered';

type Fold={vertices_coords:number[][];edges_vertices:number[][];
  edges_assignment:string[];faces_vertices:number[][]};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};

test('In[3079] 的侧边 JoinTiling 两方块有相同 CP 和唯一整片层序',()=>{
  const namedCode=[
    "import sys,json",
    "sys.path.insert(0,'backend')",
    'from tessellation_unit_regular_centered import original_regular_centered_alt_pair_in3079',
    'print(json.dumps(original_regular_centered_alt_pair_in3079()["fold"],allow_nan=False))',
  ].join(';');
  const namedRun=spawnSync(python,['-c',namedCode],{
    cwd:root,encoding:'utf8',timeout:30000,windowsHide:true,env});
  assert.equal(namedRun.status,0,namedRun.error?.message||namedRun.stderr);
  const named=JSON.parse(namedRun.stdout) as Fold;

  const spec=unitRegularCenteredAltSidePairPreset();
  const params=readTessParams(unitRegularCenteredParams(spec));
  assert.ok(params&&params.family==='custom');
  assert.equal(params.unitRegularCentered?.arrangement,'in3079-pair');
  assert.deepEqual(params.vertices,[[0,0],[1,0],[1,1],[0,1],[2,0],[2,1]]);
  assert.deepEqual(params.faces,[[0,1,2,3],[1,4,5,2]]);
  assert.deepEqual(params.tileTwists?.map(tile=>tile.centralTypes),
    [['M','M','M','M'],['V','V','V','V']]);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  for(const mutate of [
    (copy:typeof params)=>{copy.vertices[4][0]+=.1;},
    (copy:typeof params)=>{copy.faces[1]=[2,1,5,4];},
    (copy:typeof params)=>{copy.tileTwists![1].centralTypes[0]='M';},
    (copy:typeof params)=>{copy.unitRegularCentered!.centralTypes[0]='V';},
    (copy:typeof params)=>{copy.unitRegularCentered!.arrangement='in3010-pair';},
  ]){
    const copy=structuredClone(params);mutate(copy);
    assert.equal(readTessParams(copy),null,'来源或工程被篡改应拒绝');
  }
  const request=structuredClone(params);
  delete request.unitRegularCentered;
  const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
    cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const result=JSON.parse(run.stdout) as TessResponse;
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],
    [24,38,15]);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  const fold=result.fold as Fold;
  assert.deepEqual(fold.edges_vertices,named.edges_vertices);
  assert.deepEqual(fold.edges_assignment,named.edges_assignment);
  assert.deepEqual(fold.faces_vertices,named.faces_vertices);
  assert.equal(fold.vertices_coords.length,named.vertices_coords.length);
  const maxCoordinateError=Math.max(...fold.vertices_coords.flatMap((vertex,index)=>
    vertex.map((value,axis)=>Math.abs(value-named.vertices_coords[index][axis]))));
  assert.ok(maxCoordinateError<1e-8,`来源与工作区 CP 顶点差 ${maxCoordinateError}`);

  const prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);
  assert.equal(layers.layers.status,'solved',layers.layers.message);
  assert.equal(layers.layers.solutionCountExact,'1');
});

test('In[3087] 四方谷折正负偏置来源可编辑、严格回读且有唯一整片层序',()=>{
  const params=readTessParams(unitRegularCenteredParams(unitRegularOffsetFourPreset()));
  assert.ok(params&&params.family==='custom');
  assert.equal(params.unitRegularCentered?.arrangement,'in3087-four');
  assert.deepEqual(params.faces,[[0,1,2,3],[1,4,5,2],[3,2,6,7],[2,5,8,6]]);
  assert.deepEqual(params.tileTwists?.map(tile=>tile.offset),[.15,-.15,-.15,.15]);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const changed=structuredClone(params);
  changed.tileTwists![3].offset=-.15;
  assert.equal(readTessParams(changed),null);
  const request=structuredClone(params);
  delete request.unitRegularCentered;
  const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
    cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const result=JSON.parse(run.stdout) as TessResponse;
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[36,60,25]);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  const prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);
  assert.equal(layers.layers.status,'solved',layers.layers.message);
  assert.equal(layers.layers.solutionCountExact,'1');
});

test('In[3078–3080]/In[3084–3086] 六个保存侧接双块可严格回读并整片渲染',()=>{
  const cases=[
    {in:3078,spec:unitRegularCenteredAltSidePairPreset(3078),cp:[18,28,11]},
    {in:3079,spec:unitRegularCenteredAltSidePairPreset(3079),cp:[24,38,15]},
    {in:3080,spec:unitRegularCenteredAltSidePairPreset(3080),cp:[42,64,23]},
    {in:3084,spec:unitRegularOffsetSidePairPreset(3084),cp:[18,28,11]},
    {in:3085,spec:unitRegularOffsetSidePairPreset(3085),cp:[24,38,15]},
    {in:3086,spec:unitRegularOffsetSidePairPreset(3086),cp:[42,64,23]},
  ];
  for(const item of cases){
    const params=readTessParams(unitRegularCenteredParams(item.spec));
    assert.ok(params&&params.family==='custom',`In[${item.in}] 来源无效`);
    assert.equal(params.unitRegularCentered?.arrangement,`in${item.in}-pair`);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
    const layout=unitRegularSidePairLayout(item.spec.arrangement);
    assert.ok(layout);
    const firstEnd=params.vertices[layout.edge%layout.sides];
    const firstStart=params.vertices[layout.edge-1];
    const second=params.faces[1];
    assert.deepEqual(params.vertices[second[0]],firstStart);
    assert.deepEqual(params.vertices[second[second.length-1]],firstEnd);
    assert.equal(params.tileTwists?.length,2);
    const changed=structuredClone(params);
    changed.tileTwists![1].centralTypes[0]=
      changed.tileTwists![1].centralTypes[0]==='M'?'V':'M';
    assert.equal(readTessParams(changed),null,`In[${item.in}] 第二片赋型篡改应拒绝`);
    const request=structuredClone(params);
    delete request.unitRegularCentered;
    const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
      cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,
      maxBuffer:4*1024*1024,windowsHide:true,env});
    assert.equal(run.status,0,`In[${item.in}] ${run.error?.message||run.stderr}`);
    const result=JSON.parse(run.stdout) as TessResponse;
    assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],
      item.cp,`In[${item.in}] CP 计数`);
    assert.equal(result.stats.checks.geometry.status,'passed');
    assert.equal(result.stats.checks.local.status,'passed');
    const prepared=prepareTessResult(result,params);
    const graph=tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true).graph;
    const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
    assert.equal(geometry.geometry.status,'ready',`In[${item.in}] ${geometry.geometry.message}`);
    const layers=recomputeFlatLayers(geometry);
    assert.equal(layers.layers.status,'solved',`In[${item.in}] ${layers.layers.message}`);
    assert.equal(layers.layers.solutionCountExact,'1');
  }
});
