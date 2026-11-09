import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportModelSnapshot,importModelSnapshot} from '../../src/core/modelSnapshot';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {materialCutFixture,materialSlitFixture} from '../fixtures/materialModel';

function fixture(){const source=blankDoc('模型快照',100,100);const result=moveFoldedVertices(computeFlatFold(source),{group:[0],selected:[0]},[-20,-10]);return {source,result};}

test('computed flat models with custom, zero, or unknown source angles can be saved without changing targets',()=>{
  for(const angle of [-72,0,null]){
    const source=blankDoc('非平折目标角',100,100);
    source.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'M',angle});
    const result=computeFlatFold(source),before=structuredClone({source,result});
    assert.equal(result.geometry.status,'ready');
    const loaded=importModelSnapshot(exportModelSnapshot(source,result));
    assert.deepEqual(loaded.source,source);assert.deepEqual(loaded.result.geometry.vertices,result.geometry.vertices);
    assert.deepEqual({source,result},before);
    assert.doesNotThrow(()=>exportModelSnapshot(loaded.source,loaded.result));
    const bad=structuredClone(result);bad.geometry.graph!.edges_foldAngle[0]=37;
    assert.throws(()=>exportModelSnapshot(source,bad),/拓扑/);
    const changed=JSON.parse(exportModelSnapshot(source,result));changed.model.basis.angles[0]=37;
    assert.throws(()=>importModelSnapshot(JSON.stringify(changed)),/拓扑/);
  }
});

test('layer reanalysis retains model colour constraints unless explicitly replaced',()=>{
  const {result}=fixture();result.layers.constraints=[{face:0,side:'white'}];
  assert.deepEqual(recomputeFlatLayers(result).layers.constraints,[{face:0,side:'white'}]);
  assert.deepEqual(recomputeFlatLayers(result,{constraints:[]}).layers.constraints,[]);
});

test('model snapshot roundtrip retains edited vertices, original source, and independently rebuilt topology',()=>{
  const {source,result}=fixture(),before=structuredClone({source,result});
  const text=exportModelSnapshot(source,result),loaded=importModelSnapshot(text);
  assert.deepEqual(loaded.source,source);assert.deepEqual(loaded.result.geometry.vertices,result.geometry.vertices);
  assert.notDeepEqual(loaded.graph.vertices_coords,loaded.result.geometry.vertices);
  assert.equal(loaded.result.layers.status,'unknown');assert.equal(loaded.result.geometry.modified,true);
  assert.equal(recomputeFlatLayers(loaded.result).layers.status,'solved');
  assert.deepEqual({source,result},before);loaded.source.segments[0].a[0]=1000;
  assert.deepEqual(source,before.source);
});

test('model snapshots above the former 32 MiB quota preserve their complete source',()=>{
  const {source,result}=fixture();source.metadata={padding:'x'.repeat(33*1024*1024)};
  const text=exportModelSnapshot(source,result);assert.ok(Buffer.byteLength(text)>32*1024*1024);
  assert.deepEqual(importModelSnapshot(text).source,source);
});

test('model snapshot roundtrip preserves visible-face colour constraints',()=>{
  const {source,result}=fixture();result.layers.constraints=[{face:0,side:'white'}];
  const loaded=importModelSnapshot(exportModelSnapshot(source,result));
  assert.deepEqual(loaded.result.layers.constraints,[{face:0,side:'white'}]);
  assert.deepEqual(recomputeFlatLayers(loaded.result,{constraints:loaded.result.layers.constraints}).layers.constraints,[{face:0,side:'white'}]);
});

test('serialization excludes old solved layers and matrix caches',()=>{
  const {source,result}=fixture();result.layers={status:'solved',message:'old',faceOrder:[0],solutionCount:99};
  result.geometry.graph!.faceOrders=[[0,1,1]];result.geometry.graph!.faces_matrix2=['untrusted'];
  const text=exportModelSnapshot(source,result);
  assert.ok(!text.includes('solutionCount'));assert.ok(!text.includes('faces_matrix2'));assert.ok(!text.includes('faceOrders'));
  const loaded=importModelSnapshot(text);assert.equal(loaded.result.layers.faceOrder,undefined);assert.equal(loaded.result.geometry.graph!.faces_matrix2,undefined);
});

test('degenerate edited geometry can be recovered without pretending it has a valid layer solution',()=>{
  const {source,result}=fixture();const collapsed=moveFoldedVertices(result,{group:[0],selected:[0]},result.geometry.vertices[1]);
  const loaded=importModelSnapshot(exportModelSnapshot(source,collapsed));
  assert.deepEqual(loaded.result.geometry.vertices,collapsed.geometry.vertices);
  assert.equal(loaded.result.layers.status,'unknown');assert.equal(recomputeFlatLayers(loaded.result).layers.status,'error');
});

test('input validation rejects wrong versions, unknown layer payload, vertex mismatch and extreme coordinates',()=>{
  const {source,result}=fixture(),original=JSON.parse(exportModelSnapshot(source,result));
  for(const change of [(v:any)=>v.version=3,(v:any)=>v.model.layers={status:'solved'},(v:any)=>v.model.constraints=[{face:99,side:'white'}],(v:any)=>v.model.vertices.pop(),(v:any)=>v.model.vertices[0]=[null,0],(v:any)=>v.model.vertices[0]=[1000001,0],(v:any)=>v.model.startingFace=99]){
    const value=structuredClone(original);change(value);assert.throws(()=>importModelSnapshot(JSON.stringify(value)));
  }
  assert.throws(()=>importModelSnapshot('{broken'),/JSON/);
});

test('changed source or reordered topology is rejected before model publication',()=>{
  const {source,result}=fixture(),original=JSON.parse(exportModelSnapshot(source,result));
  for(const change of [(v:any)=>v.model.basis.vertices.reverse(),(v:any)=>v.model.basis.edges.reverse(),(v:any)=>v.source.segments[0].assignment='M']){
    const value=structuredClone(original);change(value);assert.throws(()=>importModelSnapshot(JSON.stringify(value)),/拓扑|边界/);
  }
  const inconsistent=structuredClone(result);inconsistent.geometry.graph!.edges_assignment[0]='M';
  assert.throws(()=>exportModelSnapshot(source,inconsistent),/拓扑/);
});

test('original source auxiliaries and annotations survive without becoming solver edges',()=>{
  const {source,result}=fixture();source.segments.push({id:'aux',a:[-5,-5],b:[105,105],assignment:'A',angle:null});source.objects=[{id:'text',kind:'text',position:[10,10],text:'说明',fontSize:12,color:'#000000'}];
  const loaded=importModelSnapshot(exportModelSnapshot(source,result));
  assert.deepEqual(loaded.source,source);assert.equal(loaded.graph.edges_vertices.length,4);
});

test('material v3 snapshots retain actual source placement, parallel banks, root and explicit incidence',()=>{
 for(const {source,result,graph} of [materialCutFixture(),materialSlitFixture()]){
  const before=structuredClone({source,result});result.layers.constraints=[{face:0,side:'white'}];
  const text=exportModelSnapshot(source,result),saved=JSON.parse(text),loaded=importModelSnapshot(text);
  assert.equal(saved.version,3);assert.deepEqual(loaded.graph.vertices_coords,graph.vertices_coords);assert.deepEqual(loaded.result.geometry.vertices,result.geometry.vertices);
  assert.deepEqual(loaded.result.geometry.startingFace,result.geometry.startingFace);assert.deepEqual(loaded.result.layers.constraints,result.layers.constraints);
  for(const key of ['faces_edges','edges_faces','faces_faces'] as const){assert.deepEqual(JSON.parse(JSON.stringify(loaded.graph[key])),JSON.parse(JSON.stringify(graph[key])));assert.deepEqual(saved.model.basis[key],JSON.parse(JSON.stringify(graph[key])));}
  assert.equal(loaded.result.layers.status,'unknown');assert.equal(loaded.result.geometry.modified,true);assert.deepEqual(source,before.source);
  assert.doesNotThrow(()=>exportModelSnapshot(loaded.source,loaded.result));
  const reordered=JSON.parse(text);reordered.model.basis=Object.fromEntries(Object.entries(reordered.model.basis).reverse());assert.doesNotThrow(()=>importModelSnapshot(JSON.stringify(reordered)));
 }
 const slit=materialSlitFixture();assert.deepEqual(slit.graph.edges_vertices[slit.banks[0]],slit.graph.edges_vertices[slit.banks[1]]);assert.notDeepEqual(slit.graph.edges_faces![slit.banks[0]],slit.graph.edges_faces![slit.banks[1]]);
});

test('material snapshot rejects bank reassignment, incomplete incidence, source edits and version downgrade',()=>{
 const {source,result,banks}=materialSlitFixture(),saved=JSON.parse(exportModelSnapshot(source,result));
 for(const mutate of [
  (v:any)=>v.version=2,
  (v:any)=>v.model.basis.edges_faces[banks[0]]=v.model.basis.edges_faces[banks[1]],
  (v:any)=>delete v.model.basis.faces_edges,
  (v:any)=>v.model.basis.faces_faces[0][0]=8,
  (v:any)=>v.model.basis.trusted=true,
  (v:any)=>v.source.segments[0].a[0]+=.5,
  (v:any)=>v.source.metadata.materialTopology=null,
 ]){const changed=structuredClone(saved);mutate(changed);assert.throws(()=>importModelSnapshot(JSON.stringify(changed)));}
 for(const key of ['faces_edges','edges_faces','faces_faces'] as const){const changed=structuredClone(result);delete changed.geometry.graph![key];assert.throws(()=>exportModelSnapshot(source,changed),/拓扑/);}
 const changed=structuredClone(result);changed.geometry.graph!.edges_faces![banks[0]]=[...changed.geometry.graph!.edges_faces![banks[1]]];assert.throws(()=>exportModelSnapshot(source,changed),/拓扑/);
});

test('ordinary v1/v2 basis stays unchanged and material metadata never falls back to an ordinary snapshot',()=>{
 const {source,result}=fixture(),saved=JSON.parse(exportModelSnapshot(source,result));assert.equal(saved.version,2);assert.deepEqual(Object.keys(saved.model.basis),['vertices','edges','faces','assignments','angles']);
 const legacy=structuredClone(saved);legacy.version=1;delete legacy.model.constraints;assert.doesNotThrow(()=>importModelSnapshot(JSON.stringify(legacy)));
 const upgrade=structuredClone(saved);upgrade.version=3;assert.throws(()=>importModelSnapshot(JSON.stringify(upgrade)),/材料|版本/);
 for(const bad of [null,{},false]){const doc=structuredClone(source);doc.metadata={materialTopology:bad};assert.throws(()=>exportModelSnapshot(doc,result));}
});

test('material result edits preserve original source FF and discard old layer claims on snapshot import',()=>{
 const {source,result}=materialCutFixture(),original=structuredClone(source),changed=moveFoldedVertices(result,{group:[0],selected:[0]},[result.geometry.vertices[0][0]+2,result.geometry.vertices[0][1]+1]);
 changed.layers={status:'solved',message:'old',faceOrder:[0],solutionCount:123};changed.geometry.graph!.faceOrders=[[0,1,1]];
 const text=exportModelSnapshot(source,changed),loaded=importModelSnapshot(text);assert.deepEqual(loaded.source,original);assert.deepEqual(loaded.result.geometry.vertices,changed.geometry.vertices);
 assert.equal(loaded.result.layers.status,'unknown');assert.equal(loaded.result.layers.faceOrder,undefined);assert.equal(loaded.result.geometry.graph!.faceOrders,undefined);assert.ok(!text.includes('solutionCount'));
});
