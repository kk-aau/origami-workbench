import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {polygonArea} from '../../src/core/geometry';
import {countOriginalLayerAssignments,solveConcaveLayerOrders} from '../../src/core/concaveLayers';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {prepareTessResult,tessPreset,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';

function savedGeometry(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const code=[
    'import json,sys',"sys.path.insert(0,'backend')",
    'from tessellation_archimedean_patch8_in3186 import build_archimedean_patch8_in3186',
    'print(json.dumps(build_archimedean_patch8_in3186(),allow_nan=False))',
  ].join(';');
  const run=spawnSync(python,['-c',code],{cwd:root,encoding:'utf8',timeout:30000,
    maxBuffer:8*1024*1024,windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const source=JSON.parse(run.stdout) as {fold:TessResponse['fold'];mother:NonNullable<TessResponse['mother']>;
    counts:{vertices:number;edges:number;faces:number;retainedTiles:number};
    checks:{geometry:{status:string};local:{status:string}}};
  const response={fold:source.fold,mother:source.mother,warnings:[],source:{output:'tile-twists'},
    stats:{...source.counts,tiles:source.counts.retainedTiles,checks:source.checks}} as TessResponse;
  const prepared=prepareTessResult(response,tessPreset('custom'));
  const graph=tessFlatInput(prepared,prepared.doc,'saved-in3186',true).graph;
  return computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
}

test('saved In[3186] is uniquely ordered on original faces and both viewing sides',()=>{
  const geometry=savedGeometry();
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  assert.equal(geometry.geometry.faces.length,109);
  assert.equal(geometry.geometry.faces.reduce((sum,face)=>sum+face.length-2,0),236);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'solved',solved.layers.message);
  assert.equal(solved.layers.solutionCountExact,'1');
  assert.ok(solved.layers.faceOrders?.every(([a,b])=>a<109&&b<109));
  const regions=modelOverlapRegions(solved);
  const covered=Array.from({length:solved.geometry.faces.length},()=>0);
  assert.ok(regions.cells.length);
  for(const region of regions.cells){
    const area=Math.abs(polygonArea(region.polygon));assert.ok(area>0);
    for(const face of region.faces)covered[face]+=area;
  }
  solved.geometry.faces.forEach((face,index)=>{
    const area=Math.abs(polygonArea(face.map(v=>solved.geometry.vertices[v])));
    assert.ok(Math.abs(covered[index]-area)<=Math.max(1e-7,area*1e-8),`original face ${index} retains its complete area`);
  });
  const front=modelRegionLayers(solved,regions,'front');
  for(const side of ['front','back'] as const){
    const visible=side==='front'?front:modelRegionLayers(solved,regions,side);
    assert.equal(visible.length,regions.cells.length);
    assert.ok(visible.every(region=>region.layers.status==='ordered'));
    if(side==='back')visible.forEach((region,index)=>{
      const forward=front[index].layers;
      if(region.layers.status==='ordered'&&forward.status==='ordered')assert.deepEqual(region.layers.topToBottom,[...forward.topToBottom].reverse());
    });
  }
});

test('changed saved assignments are rechecked without a topology whitelist; explicit budgets and validity checks still apply',()=>{
  const geometry=savedGeometry();
  const graph=geometry.geometry.graph!;
  const changed=structuredClone(graph);
  const mountain=changed.edges_assignment.indexOf('M');
  assert.ok(mountain>=0);
  changed.edges_assignment[mountain]='V';
  const rechecked=solveConcaveLayerOrders(changed,1e-6);
  assert.equal(rechecked.status,'complete');
  const tooMany=structuredClone(graph);
  tooMany.faces_vertices!.push([...tooMany.faces_vertices![0]]);
  assert.equal(solveConcaveLayerOrders(tooMany,1e-6).status,'unsupported');
  const expanded=countOriginalLayerAssignments(193,[]);assert.equal(expanded.status,'complete');if(expanded.status==='complete')assert.equal(expanded.count,1n<<193n);
  assert.throws(()=>countOriginalLayerAssignments(513,[],0n,50000,512),/输入无效/);
  assert.throws(()=>countOriginalLayerAssignments(1,Array.from({length:3201},()=>[1]),
    0n,50000,512,3200),/输入无效/);
  assert.throws(()=>countOriginalLayerAssignments(1,[[1,1,1,1,1,1,1]],
    0n,50000,512,3200),/输入无效/);
  const bounded=countOriginalLayerAssignments(512,[],0n,50000,512);
  assert.equal(bounded.status,'complete');
  if(bounded.status==='complete')assert.equal(bounded.nodes,1);
});
