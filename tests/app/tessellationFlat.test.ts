import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareTessResult,tessPreset,type TessParams,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot,type TessFlatFrame,type TessFlatInput} from '../../src/app/tessellationFlat';
import {computeFlatFold,computeFlatGeometry,emptyFoldResult,recomputeFlatLayers} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import {createTessFlatClient} from '../../src/app/tessellationFlatClient';

test('generated tessellations fold directly with the same geometry validity and layer outcome as the editor engine',()=>{
  const params=[tessPreset('twist'),tessPreset('periodic'),tessPreset('woven')];
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
  assert.equal(run.status,0,run.stderr);
  const responses=JSON.parse(run.stdout) as TessResponse[];
  responses.forEach((response,index)=>{
    const result=prepareTessResult(response,params[index]),input=tessFlatInput(result,result.doc,JSON.stringify(params[index]),true);
    const original=structuredClone(input),fast=computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}),full=computeFlatFold(result.doc);
    assert.equal(fast.geometry.status,full.geometry.status);assert.equal(fast.geometry.status,'ready');
    assert.equal(fast.geometry.faces.length,full.geometry.faces.length);
    for(const [a,b] of input.graph.edges_vertices)assert.ok(Math.abs(distance(input.graph.vertices_coords[a],input.graph.vertices_coords[b])-distance(fast.geometry.vertices[a],fast.geometry.vertices[b]))<1e-5);
    assert.equal(recomputeFlatLayers(fast).layers.status,full.layers.status);
    assert.deepEqual(input,original);
  });
});

test('geometry rejects path inconsistency and orphan vertices without claiming a folded result',()=>{
  const graph={vertices_coords:[[0,0],[2,0],[2,2],[0,2],[.7,1]] as [number,number][],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]] as [number,number][],edges_assignment:['B','B','B','B','M','M','M','V'],edges_foldAngle:[null,null,null,null,-180,-180,-180,180],faces_vertices:[[0,1,4],[1,2,4],[2,3,4],[3,0,4]]};
  assert.equal(computeFlatGeometry(graph,1e-6).geometry.status,'invalid');
  const orphan={...graph,vertices_coords:[[0,0],[2,0],[2,2],[0,2],[1,1],[8,8]] as [number,number][]};
  assert.equal(computeFlatGeometry(orphan,1e-6).geometry.status,'invalid');
});

test('live worker keeps one running frame, replaces queued inputs, survives crashes and ignores replies after disposal',()=>{
  const saved=globalThis.Worker,workers:FakeWorker[]=[],frames:TessFlatFrame[]=[];
  class FakeWorker{
    onmessage:((event:any)=>void)|null=null;onerror:(()=>void)|null=null;terminated=false;messages:any[]=[];
    constructor(){workers.push(this);}
    postMessage(message:any){this.messages.push(structuredClone(message));}
    terminate(){this.terminated=true;}
    reply(){const id=this.messages.at(-1).id;this.onmessage?.({data:{id,result:emptyFoldResult('invalid','test')}});}
  }
  globalThis.Worker=FakeWorker as unknown as typeof Worker;
  const client=createTessFlatClient(f=>frames.push(f)),input=(key:string)=>({key,graph:{},checked:false}) as TessFlatInput;
  try{
    client.update(input('a'));client.update(input('b'));client.update(input('c'));
    assert.equal(workers.length,1);assert.equal(workers[0].messages.length,1);
    workers[0].reply();assert.equal(frames[0].input.key,'a');assert.equal(workers[0].messages[1].input.key,'c');
    workers[0].reply();assert.equal(frames[1].input.key,'c');assert.equal(workers.length,1);
    client.update(input('d'));client.update(input('e'));workers[0].onerror?.();
    assert.equal(workers[0].terminated,true);assert.equal(workers.length,2);assert.equal(frames[2].result.geometry.status,'error');
    workers[0].onerror?.();assert.equal(workers[1].terminated,false);
    workers[1].reply();assert.equal(frames[3].input.key,'e');
    client.update(input('f'));client.dispose();workers[1].reply();assert.equal(frames.length,4);assert.equal(workers[1].terminated,true);
  }finally{client.dispose();globalThis.Worker=saved;}
});
