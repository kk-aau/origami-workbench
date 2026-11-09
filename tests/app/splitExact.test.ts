import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {SPLIT_VARIANTS,splitPreset,unitQuadrilateralVertices,type SplitVariant} from '../../src/app/splitParams';
import {readTessParams,prepareTessResult,changeTessParams,type TessResponse} from '../../src/app/tessellation';
import {computeFlatFold} from '../../src/core/flatFold';

test('exact split variants restore without accepting parameters from another mode',()=>{
  for(const variant of Object.keys(SPLIT_VARIANTS) as SplitVariant[]){
    const params=splitPreset(variant);assert.deepEqual(readTessParams(params),params);
    const changed=changeTessParams(params,{width:.2});assert.deepEqual(readTessParams(changed),changed);
    assert.equal(readTessParams({...params,angle:36}),null);
  }
  assert.equal(readTessParams({...splitPreset('offset'),tilt:70}),null);
  assert.equal(readTessParams({...splitPreset(),polygon:[[0,0],[1,1],[1,0],[0,1]]}),null);
  assert.equal(readTessParams({...splitPreset(),baseVertex:4}),null);
  const unit=splitPreset('unit-offset');
  assert.equal(unit.variant,'unit-offset');
  assert.equal(readTessParams({...unit,polygon:[[0,0],[1,0],[1,1],[0,1]]}),null);
  assert.equal(readTessParams({...unit,angles:[10,10,10]}),null);
  assert.equal(readTessParams({...unit,sideIndex:1}),null);
  assert.equal(readTessParams({...unit,side:0}),null);
  if(unit.variant==='unit-offset'){
    assert.deepEqual(readTessParams({...unit,angles:[70,85,95,0]}),unit);
    assert.ok(unitQuadrilateralVertices(unit.angles,unit.side,unit.sideIndex));
  }
});

test('unit quadrilateral default has a layer solution; source-fixed all-M example rejects without repairing its CP',()=>{
  const params=splitPreset('unit-offset');
  if(params.variant!=='unit-offset')throw Error('unit preset missing');
  const allM={...params,centralTypes:['M','M','M','M'] as ('M'|'V')[]};
  const code="import sys,json\nsys.path.insert(0,'backend')\nfrom tessellate import generate\nresults=[]\nfor p in json.load(sys.stdin):\n try:results.append(generate(p))\n except ValueError as error:results.append({'error':str(error)})\nprint(json.dumps(results))";
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{input:JSON.stringify([params,allM]),encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
  assert.equal(run.status,0,run.stderr);
  const [response,rejected]=JSON.parse(run.stdout) as [TessResponse,{error:string}];
  const derived=unitQuadrilateralVertices(params.angles,params.side,params.sideIndex);
  assert.ok(derived);
  response.mother!.vertices_coords.forEach(point=>assert.ok(derived.some(candidate=>Math.hypot(point[0]-candidate[0],point[1]-candidate[1])<1e-10)));
  const solved=computeFlatFold(prepareTessResult(response,params).doc);
  assert.equal(solved.geometry.status,'ready');assert.equal(solved.layers.status,'solved');
  assert.match(rejected.error,/局部山谷赋型无解/);
  assert.deepEqual(readTessParams(allM),allM);
  assert.equal(response.source.splitAssignmentMethod,'directed-twist-angle-v1');
});

test('all exact split defaults preserve continuous flat geometry and reach a layer solution',()=>{
  const params=(Object.keys(SPLIT_VARIANTS) as SplitVariant[]).map(splitPreset);
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
  assert.equal(run.status,0,run.stderr);
  (JSON.parse(run.stdout) as TessResponse[]).forEach((response,i)=>{
    const result=prepareTessResult(response,params[i]),flat=computeFlatFold(result.doc);
    assert.equal(flat.geometry.status,'ready',params[i].variant);
    assert.equal(flat.layers.status,'solved',params[i].variant+JSON.stringify(flat.layers));
    assert.deepEqual(readTessParams((result.doc.metadata?.tessellation as {parameters:unknown}).parameters),params[i]);
  });
});
