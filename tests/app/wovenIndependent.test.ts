import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareTessResult,readTessParams,tessConstructionKey,canAdoptTessWithTileLayers,hasWovenInternalBoundary,type TessResponse} from '../../src/app/tessellation';
import {wovenIndependentPreset,type WovenParams} from '../../src/app/wovenParams';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
type Case={name:string;params:WovenParams;response:TessResponse};
const saved=JSON.parse(fs.readFileSync('tests/fixtures/woven-independent-1008.json','utf8')) as {cases:Case[]};

test('independent mother sources retain all original vertex/edge/face IDs and independently verified fixed roots',()=>{
 assert.deepEqual(wovenIndependentPreset(),saved.cases[0].params);
 for(const c of saved.cases){
  assert.deepEqual(readTessParams(c.params),c.params);const result=prepareTessResult(c.response,c.params),inspection=inspectWovenCutTopology(result,c.params);assert.ok(inspection.ok,inspection.ok?'':inspection.reason);
  assert.equal(inspection.topology.components.length,c.name==='merit-cut-pair'?6:2);assert.equal(inspection.topology.internalBoundaryEdges.length,c.name==='merit-cut-pair'?4:0);
  assert.equal(inspection.topology.standardSingleSheetFold,false);assert.ok(hasWovenInternalBoundary(result));
  assert.deepEqual(result.mother!.vertices_coords,(c.params as WovenParams&{mode:'graph'}).graph.vertices);
  assert.deepEqual(result.mother!.edges_vertices,(c.params as WovenParams&{mode:'graph'}).graph.edges);
 }
});

test('both independent components retain generator FF placement and solve whole layers without connecting the blank',()=>{
 for(const c of saved.cases){const result=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),input=tessFlatInput(result,result.doc,key,true),geometry=computeTessFlatGeometry(input),flat=recomputeFlatLayers(geometry);
  assert.equal(geometry.geometry.status,'ready');assert.equal(flat.layers.status,'solved',`${c.name}: ${flat.layers.message}`);assert.ok(canAdoptTessWithTileLayers(result,false,key,c.params,flat.layers.status));
  assert.deepEqual(geometry.geometry.vertices,input.wovenCutFoldedVertices);assert.equal(input.graph.edges_vertices.length,c.name==='merit-cut-pair'?32:64);
  const seen=inspectWovenCutTopology(result,c.params);assert.ok(seen.ok);const owners=new Map<number,number>();seen.topology.components.forEach((comp,i)=>comp.vertices.forEach(v=>owners.set(v,i)));
  for(const [a,b] of input.graph.edges_vertices)assert.equal(owners.get(a),owners.get(b));
 }
});

test('adopted independent material survives native/FOLD roundtrip and can fold again with two separate boundaries',()=>{
 for(const c of saved.cases){const result=prepareTessResult(c.response,c.params),doc=wovenMaterialDocument(result,c.params),before=structuredClone(doc),m=inspectMaterialTopology(doc);assert.ok(m.ok);assert.equal(m.components.length,c.name==='merit-cut-pair'?6:2);
  const flat=computeFlatFold(doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.deepEqual(doc,before);
  for(const format of ['json','fold'] as const){const imported=importDocument(exportDocument(doc,format).text,format).doc,n=inspectMaterialTopology(imported);assert.ok(n.ok);assert.equal(n.components.length,m.components.length);assert.deepEqual(n.graph,m.graph);assert.deepEqual(n.foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(imported).layers.status,'solved');}
  const dxf=exportDXF(doc).text;assert.equal(dxf.split(/\r?\n/).filter(s=>s==='LINE').length,c.name==='merit-cut-pair'?32:64);
 }
});

test('missing or fabricated independent-component provenance fails closed rather than taking a ordinary-sheet fallback',()=>{
 const c=saved.cases[0];
 for(const mutate of [(r:TessResponse)=>{delete r.source.wovenIndependentMother;},(r:TessResponse)=>{(r.source.wovenIndependentMother as any).foldRoots[1]=0;},(r:TessResponse)=>{(r.source.wovenIndependentMother as any).vertices[1][0]=0;},(r:TessResponse)=>{(r.source.foldedForm as number[][])[25][0]+=.01;}]){
  const response=structuredClone(c.response);mutate(response);const result=prepareTessResult(response,c.params);assert.ok(hasWovenInternalBoundary(result));assert.equal(inspectWovenCutTopology(result,c.params).ok,false);
  assert.throws(()=>wovenMaterialDocument(result,c.params));
 }
});

test('an unrelated construction with a graph extension is not routed into the woven material pipeline',()=>{
 const c=saved.cases[0],result=prepareTessResult(c.response,c.params);delete result.source.wovenIndependentMother;
 (result.doc.metadata!.tessellation as {parameters:unknown}).parameters={family:'primal-dual'};
 assert.equal(hasWovenInternalBoundary(result),false);
});
