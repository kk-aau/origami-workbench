import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {polygonTilePreset} from '../../src/app/polygonTileParams';
import {prepareTessResult,readTessParams,tessConstructionKey,tessDocument,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

test('small exact tiles keep every crease when imported and produce the same flat form',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const original={...polygonTilePreset(),width:.2};
 const requests=[original,...[1e-6,1e-8,1e-14].map(scale=>({...original,
  polygon:original.polygon.map(([x,y])=>[x*scale,y*scale])}))];
 const code='import sys,json;sys.path.insert(0,"backend");from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))';
 const run=spawnSync(path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),
  ['-c',code],{cwd:root,input:JSON.stringify(requests),encoding:'utf8',timeout:30000,
   maxBuffer:8*1024*1024,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 assert.equal(run.status,0,run.error?.message||run.stderr);
 const results=JSON.parse(run.stdout) as TessResponse[];
 const reference=prepareTessResult(results[0],original);
 const referenceInput=tessFlatInput(reference,reference.doc,tessConstructionKey(original),true);
 const referenceFlat=computeFlatGeometry(referenceInput.graph,1e-6);
 assert.equal(referenceFlat.geometry.status,'ready');
 const referenceLayers=recomputeFlatLayers(referenceFlat).layers.status;
 assert.equal(referenceLayers,'solved');
 for(let i=1;i<requests.length;i++){
  const params=readTessParams(JSON.parse(JSON.stringify(requests[i])));
  assert.ok(params);
  const prepared=prepareTessResult(results[i],params);
  assert.equal(prepared.doc.segments.length,24);
  assert.equal(prepared.motherDoc?.segments.length,4);
  assert.deepEqual(prepared.doc.paper,reference.doc.paper);
  prepared.doc.segments.forEach((segment,j)=>{
   const baseline=reference.doc.segments[j];
   assert.equal(segment.assignment,baseline.assignment);
   for(const end of ['a','b'] as const)
    assert.ok(Math.hypot(segment[end][0]-baseline[end][0],segment[end][1]-baseline[end][1])<1e-7);
  });
  const input=tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true);
  const flat=computeFlatGeometry(input.graph,1e-6);
  assert.equal(flat.geometry.status,'ready',flat.geometry.message);
  assert.equal(flat.geometry.vertices.length,16);
  flat.geometry.vertices.forEach((p,j)=>assert.ok(Math.hypot(
   p[0]-referenceFlat.geometry.vertices[j][0],p[1]-referenceFlat.geometry.vertices[j][1])<1e-7));
  assert.equal(recomputeFlatLayers(flat).layers.status,referenceLayers);
 }
});

test('large generated geometry normalizes every vertex and retains every crease without a capacity cutoff',()=>{
 const count=100000,vertices_coords=Array.from({length:count*2},(_,i)=>[Math.floor(i/2)%1000*2+i%2,Math.floor(i/2000)*2]),
  edges_vertices=Array.from({length:count},(_,i)=>[i*2,i*2+1]),edges_assignment=Array.from({length:count},(_,i)=>i%2?'V':'M');
 const graph={vertices_coords,edges_vertices,edges_assignment},before=structuredClone(graph),doc=tessDocument(graph,'large generated drawing'),scale=200/1999;
 assert.equal(doc.segments.length,count);assert.equal(new Set(doc.segments.map(s=>s.id)).size,count);
 doc.segments.forEach((segment,i)=>{
  assert.deepEqual(segment.a,vertices_coords[2*i].map(n=>n*scale));
  assert.deepEqual(segment.b,vertices_coords[2*i+1].map(n=>n*scale));
  assert.equal(segment.assignment,edges_assignment[i]);assert.equal(segment.angle,i%2?180:-180);
 });
 assert.deepEqual(doc.paper,{width:200,height:198*scale});assert.deepEqual(graph,before);
 assert.throws(()=>tessDocument({...graph,edges_vertices:[[0,vertices_coords.length]],edges_assignment:['M']},'bad index'),/索引/);
});
