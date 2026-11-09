import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {wovenHolePreset,readWovenParams} from '../../src/app/wovenParams';
import {readWovenGraph,wovenGraphEdgeKinds,wovenGraphFaceCycles} from '../../src/app/wovenGraph';
import {editWovenGraphDraft} from '../../src/app/wovenGraphEdit';
import {prepareTessResult,hasWovenInternalBoundary} from '../../src/app/tessellation';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {computeFlatFold} from '../../src/core/flatFold';
import {wovenResultMatchesGraph} from '../../src/app/wovenGraphInspection';
const saved=JSON.parse(fs.readFileSync('tests/fixtures/woven-mother-holes-1008.json','utf8'));
test('mother hole stamp binds source half-edge IDs and both boundary rims without moving geometry',()=>{
 const p=wovenHolePreset();assert.deepEqual(readWovenParams(p),p);assert.ok(readWovenGraph(p.graph));assert.deepEqual(wovenGraphFaceCycles(p.graph)?.inner[4],[4,5,6,7]);assert.deepEqual(wovenGraphEdgeKinds(p.graph),[...Array(8).fill(-1),...Array(4).fill(0)]);
 for(const holeFaces of [[],[4,4],[true],[-1],[256]])assert.equal(readWovenGraph({...p.graph,holeFaces}),null);
});
test('explicit hole creation/restoration is reversible; topology changes cannot silently retarget a hole',()=>{
 const p=wovenHolePreset(),graph=structuredClone(p.graph);delete graph.holeFaces;
 const added=editWovenGraphDraft(graph,{kind:'toggle-hole',face:4}).graph;assert.deepEqual(added,p.graph);
 assert.deepEqual(editWovenGraphDraft(added,{kind:'toggle-hole',face:4}).graph,graph);
 assert.throws(()=>editWovenGraphDraft(added,{kind:'delete-edge',edge:0}),/恢复孔洞/);
 assert.throws(()=>editWovenGraphDraft(graph,{kind:'toggle-hole',face:0}),/外边界/);
 const moved=editWovenGraphDraft(added,{kind:'move',vertex:0,point:[-2.01,-2]}).graph;assert.deepEqual(moved.holeFaces,[4]);assert.deepEqual(moved.edges,added.edges);
});
test('real holed public response independently verifies, adopts and round-trips indexed CP and FF',()=>{
 const result=prepareTessResult(saved.response,saved.params);assert.equal(hasWovenInternalBoundary(result),true);
 const i=inspectWovenCutTopology(result,saved.params);assert.ok(i.ok,i.ok?'':i.reason);
 const doc=wovenMaterialDocument(result,saved.params),m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);
 assert.equal(computeFlatFold(doc).layers.status,'solved');
 for(const format of ['json','fold'] as const){const restored=importDocument(exportDocument(doc,format).text,format).doc;const actual=inspectMaterialTopology(restored);assert.ok(actual.ok,actual.ok?'':actual.reason);assert.deepEqual(actual.graph,m.graph);assert.deepEqual(actual.foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(restored).layers.status,'solved');}
 const ordinary=exportDXF(doc).text;assert.equal((ordinary.match(/\r?\nLINE\r?\n/g)??[]).length,doc.segments.length);assert.ok(!ordinary.includes('LWPOLYLINE'));
});
test('tampered hole provenance and a filled missing face cannot pass source inspection',()=>{
 const r=prepareTessResult(saved.response,saved.params),bad=structuredClone(r);(bad.source.wovenMotherHoles as {faceIds:number[]}).faceIds=[0];assert.equal(inspectWovenCutTopology(bad,saved.params).ok,false);
 const changed=structuredClone(saved.params);delete changed.graph.holeFaces;assert.equal(inspectWovenCutTopology(r,changed).ok,false);
 assert.equal(wovenResultMatchesGraph(r,changed.graph),false);
});
