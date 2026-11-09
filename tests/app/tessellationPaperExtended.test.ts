import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareTessResult,previewTessDocument,tessConstructionKey,tessPreset,type TessParams,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {continueFlatLayers} from '../../src/core/continueFlatLayers';

test('selected paper grows the tessellation beyond its core and retains a real layer order',{timeout:60000},()=>{
  const paper={shape:'square' as const,margin:.1};
  const params:TessParams[]=[
    {...tessPreset('periodic'),paper},
    {...tessPreset('primal-dual'),paper},
    {...tessPreset('archimedean'),paper},
    {...tessPreset('periodic'),paper:{shape:'rectangle',aspect:1.5,margin:.1}},
    {...tessPreset('periodic'),paper:{shape:'regular',sides:6,margin:.1}},
    {...tessPreset('periodic'),paper:{shape:'regular',sides:3,margin:.1}},
  ];
  const moved={...params[0],angle:36.5,scale:.31};
  const code="import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))";
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    input:JSON.stringify([...params,moved]),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
    timeout:55000,maxBuffer:30*1024*1024,
  });
  assert.equal(run.status,0,run.stderr);
  const responses=JSON.parse(run.stdout) as TessResponse[];
  for(let i=0;i<params.length;i++){
    const reply=responses[i],family=params[i].family;
    assert.equal(reply.source.paperMethod,'extended-pattern-clip-v1',family);
    assert.ok(Number(reply.source.paperExpansion)>=1,family);
    assert.equal(reply.stats.checks.geometry.status,'passed',family);
    assert.equal(reply.stats.checks.local.status,'passed',family);
    assert.ok(reply.stats.boundaryEdges>0,family);
    const result=prepareTessResult(reply,params[i]);
    assert.ok(reply.source.paperClipPreview,family);
    assert.equal((result.doc.metadata?.tessellation as {source:Record<string,unknown>}).source.paperClipPreview,undefined,
      'live interpolation data must not inflate a saved project');
    const input=tessFlatInput(result,result.doc,'paper-test',true);
    const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
    assert.equal(flat.geometry.status,'ready',family);
    assert.equal(flat.layers.status,'solved',family);
  }
  const original=prepareTessResult(responses[0],params[0]);
  const preview=previewTessDocument(original,tessConstructionKey(params[0]),moved);
  const regenerated=prepareTessResult(responses[params.length],moved).doc;
  assert.ok(preview,'the extended clipped pattern should preview parameter changes immediately');
  assert.deepEqual(preview.paper,regenerated.paper);
  assert.equal(preview.segments.length,regenerated.segments.length);
  for(let i=0;i<preview.segments.length;i++){
    const actual=preview.segments[i],expected=regenerated.segments[i];
    assert.equal(actual.assignment,expected.assignment);
    for(const end of ['a','b'] as const)for(let axis=0;axis<2;axis++)
      assert.ok(Math.abs(actual[end][axis]-expected[end][axis])<1e-7,`segment ${i} ${end}[${axis}]`);
  }
  const oldInput=tessFlatInput(original,original.doc,'old-paper',true);
  const newInput=tessFlatInput(prepareTessResult(responses[params.length],moved),regenerated,'new-paper',true);
  const oldFlat=recomputeFlatLayers(computeFlatGeometry(oldInput.graph,2e-6,{startingFace:tessFlatRoot(oldInput.graph)}));
  const newGeometry=computeFlatGeometry(newInput.graph,2e-6,{startingFace:tessFlatRoot(newInput.graph)});
  assert.equal(oldFlat.layers.status,'solved');
  assert.ok(continueFlatLayers(newGeometry,oldFlat),'small changes should reuse a checked whole-paper stack');
});

test('one twist unit sends every crease directly to the chosen paper edge',{timeout:30000},()=>{
  const params:TessParams[]=[
    tessPreset('twist'),
    {...tessPreset('twist'),paper:{shape:'square',margin:.1}},
    {...tessPreset('twist'),paper:{shape:'rectangle',aspect:1.5,margin:.1}},
    {...tessPreset('twist'),paper:{shape:'regular',sides:6,margin:.1}},
    {...tessPreset('twist'),paper:{shape:'regular',sides:3,margin:.1}},
  ];
  const code="import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))";
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    input:JSON.stringify(params),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
    timeout:25000,maxBuffer:10*1024*1024,
  });
  assert.equal(run.status,0,run.stderr);
  let baselineLayers:string|undefined;
  for(const [i,reply] of (JSON.parse(run.stdout) as TessResponse[]).entries()){
    if(params[i].paper)assert.equal(reply.source.paperMethod,'direct-boundary-rays-v1');
    assert.equal(reply.stats.checks.geometry.status,'passed');
    assert.equal(reply.stats.checks.local.status,'passed');
    const result=prepareTessResult(reply,params[i]);
    const input=tessFlatInput(result,result.doc,'twist-paper-test',true);
    const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
    assert.equal(flat.geometry.status,'ready',String(params[i].paper?.shape));
    if(i===0)baselineLayers=flat.layers.status;
    else assert.equal(flat.layers.status,baselineLayers,
      'changing paper shape must not pretend to repair an unsolved source assignment');
  }
});
