import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {TWO_UNIFORM,RESCH_CATALOG,readTessParams,prepareTessResult,type TessResponse,type TessParams} from '../../src/app/tessellation';
import {buildFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';

test('twenty two-uniform and five Resch presets roundtrip with continuous flat geometry',()=>{
  const params=[...TWO_UNIFORM,...RESCH_CATALOG].map(([tiling])=>({family:'archimedean',tiling,rings:1,angle:45,scale:.3,...(tiling.startsWith('resch-')?{starAngle:40}:{})} as TessParams));
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000,maxBuffer:16*1024*1024});
  assert.equal(run.status,0,run.stderr);
  (JSON.parse(run.stdout) as TessResponse[]).forEach((response,i)=>{
    assert.deepEqual(readTessParams(params[i]),params[i]);
    const result=prepareTessResult(response,params[i]),{graph}=buildFold(result.doc);
    const flat=computeFlatGeometry(graph,1e-6);
    assert.equal(flat.geometry.status,'ready',JSON.stringify(params[i])+flat.geometry.message);
    assert.deepEqual(readTessParams((result.doc.metadata?.tessellation as {parameters:unknown}).parameters),params[i]);
    const cell=response.source.periodicCell as {lattice:number[][];polygons:number[][][]};
    assert.equal(cell.lattice.length,2);assert.ok(cell.polygons.length);
  });
  assert.equal(readTessParams({...params[0],tiling:'two-uniform-21'}),null);
  assert.equal(readTessParams({...params[20],starAngle:60}),null);
});
