import test from 'node:test';
import assert from 'node:assert/strict';
import {exportFoldInterchange,importFoldInterchange} from '../../src/core/foldInterchange';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exampleDoc} from '../../src/app/state';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {materialSlitFixture} from '../fixtures/materialModel';
import {mergeTwoHoleRing} from '../fixtures/materialHoles';

test('FOLD exports shared geometry at root and all workbench data in a namespaced extension',()=>{
  const doc=exampleDoc();doc.metadata={custom:{license:'retained',value:null}};
  doc.segments.push({id:'aux',a:[25,25],b:[75,75],assignment:'A',angle:0});
  const raw=JSON.parse(exportDocument(doc,'fold').text),fields=raw['zhezhi:workbench'].fields;
  assert.equal(raw.vertices_edges,undefined);assert.equal(raw.faces_faces,undefined);assert.equal(raw.zhezhi_paper,undefined);
  assert.ok(fields.vertices_edges.length);assert.ok(fields.faces_faces.length);
  assert.deepEqual(fields.zhezhi_paper,doc.paper);assert.deepEqual(fields.zhezhi_metadata,doc.metadata);assert.equal(fields.zhezhi_auxiliary.length,1);
  const back=importDocument(JSON.stringify(raw),'fold').doc;
  assert.deepEqual(back.metadata?.custom,doc.metadata.custom);assert.deepEqual(back.paper,doc.paper);assert.equal(back.segments.filter(line=>line.assignment==='A').length,1);
});

test('legacy underscore extensions and namespaced files both remain readable',()=>{
  const raw=JSON.parse(exportDocument(exampleDoc(),'fold').text),legacy=importFoldInterchange(raw);
  assert.deepEqual(importDocument(JSON.stringify(raw),'fold'),importDocument(JSON.stringify(legacy),'fold'));
});

test('material FOLD keeps independent cut banks, holes, CP/FF coordinates and metadata',()=>{
  for(const source of [materialSlitFixture().source,mergeTwoHoleRing().result.doc]){
    const original=inspectMaterialTopology(source);assert.ok(original.ok);
    const raw=JSON.parse(exportDocument(source,'fold').text);
    assert.equal(raw.file_frames.length,1);assert.equal(raw.file_frames[0].frame_inherit,undefined);
    const back=importDocument(JSON.stringify(raw),'fold').doc,restored=inspectMaterialTopology(back);assert.ok(restored.ok);
    assert.deepEqual(restored.graph,original.graph);assert.deepEqual(restored.foldedVertices,original.foldedVertices);assert.deepEqual(restored.edgeSegmentIds,original.edgeSegmentIds);
    assert.deepEqual(raw.vertices_coords,original.graph.vertices_coords);assert.deepEqual(raw.edges_vertices,original.graph.edges_vertices);
    const tampered=structuredClone(raw);tampered.vertices_coords[0][0]+=1;
    assert.throws(()=>importDocument(JSON.stringify(tampered),'fold'),/不一致/);
  }
});

test('unknown versions, geometry shadowing and inconsistent frame extension counts are rejected',()=>{
  const raw=exportFoldInterchange({vertices_coords:[[0,0],[1,0]],edges_vertices:[[0,1]],edges_assignment:['U'],edges_foldAngle:[null],zhezhi_paper:{width:1,height:1}});
  const change=(extension:unknown)=>({...raw,'zhezhi:workbench':extension});
  assert.throws(()=>importFoldInterchange(change({version:2,fields:{}})),/版本/);
  assert.throws(()=>importFoldInterchange(change({version:1,fields:{vertices_coords:[]}})),/覆盖标准几何/);
  assert.throws(()=>importFoldInterchange(change({version:1,fields:{},frames:[{}]})),/帧扩展/);
  assert.deepEqual(importFoldInterchange(raw).edges_foldAngle,[null]);
});
