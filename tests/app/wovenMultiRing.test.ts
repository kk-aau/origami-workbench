import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareTessResult,readTessParams,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {wovenMultiRingPreset,type WovenParams} from '../../src/app/wovenParams';
import {wovenMotherRegions} from '../../src/app/wovenMotherRings';
import {readWovenGraph,wovenGraphEdgeKinds} from '../../src/app/wovenGraph';
import {editWovenGraphDraft} from '../../src/app/wovenGraphEdit';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {wovenCutFold,readWovenGraphPackage} from '../../src/app/wovenGraphInspection';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
type Case={name:string;params:WovenParams&{mode:'graph'};response:TessResponse};
const {cases}=JSON.parse(fs.readFileSync('tests/fixtures/woven-multiring-1008.json','utf8')) as {cases:Case[]};
test('explicit ring ownership, geometry editing and source package preserve source indices without bridges',()=>{
 assert.deepEqual(wovenMultiRingPreset(),cases[0].params);for(const c of cases){assert.deepEqual(readTessParams(c.params),c.params);const g=c.params.graph,r=wovenMotherRegions(g);assert.equal(r.physicalComponents.length,1);assert.equal(r.holes.flat().length,g.ringHoles!.length);assert.deepEqual(readWovenGraphPackage(g)?.graph,g);assert.deepEqual(wovenGraphEdgeKinds(g),c.response.source.edgeLines);const before=structuredClone(g),moved=editWovenGraphDraft(g,{kind:'move',vertex:g.vertices.length-1,point:g.vertices.at(-1)!}).graph;assert.deepEqual(moved,g);assert.deepEqual(g,before);assert.throws(()=>editWovenGraphDraft(g,{kind:'delete-edge',edge:0}),/恢复孔洞/);}
 const g=structuredClone(cases[0].params.graph);delete g.ringHoles;const bound=editWovenGraphDraft(g,{kind:'toggle-ring-hole',face:0,component:1}).graph;assert.deepEqual(bound,cases[0].params.graph);assert.deepEqual(editWovenGraphDraft(bound,{kind:'toggle-ring-hole',face:0,component:1}).graph,g);
});
test('every real multi-ring candidate has original-source verification, material holes and solved layers',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),i=inspectWovenCutTopology(r,c.params);assert.ok(i.ok,i.ok?'':i.reason);assert.equal(i.topology.splitGraph.faces_holes!.flat().length,c.params.graph.ringHoles!.length);assert.equal(i.topology.components.length,c.name==='cell-and-ring-hole'?8:1);const key=tessConstructionKey(c.params),input=tessFlatInput(r,r.doc,key,true),flat=recomputeFlatLayers(computeTessFlatGeometry(input));assert.equal(flat.layers.status,'solved',`${c.name}: ${flat.layers.message}`);assert.ok(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status));const doc=wovenMaterialDocument(r,c.params),m=inspectMaterialTopology(doc);assert.ok(m.ok);assert.equal(computeFlatFold(doc).layers.status,'solved');assert.deepEqual(m.graph.faces_holes,i.topology.splitGraph.faces_holes);}
});
test('native/FOLD and original inspection export retain all ring indices, folded locations and ordinary LINE geometry',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),i=inspectWovenCutTopology(r,c.params);assert.ok(i.ok);const doc=wovenMaterialDocument(r,c.params),m=inspectMaterialTopology(doc);assert.ok(m.ok);for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(doc,format).text,format).doc,n=inspectMaterialTopology(loaded);assert.ok(n.ok);assert.deepEqual(n.graph,m.graph);assert.deepEqual(n.foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(loaded).layers.status,'solved');}const original=wovenCutFold(i.topology);assert.deepEqual(original.faces_holes,i.topology.splitGraph.faces_holes);assert.deepEqual(original.file_frames[0].faces_holes,original.faces_holes);const inspectedFile=inspectMaterialTopology(importDocument(JSON.stringify(original),'fold').doc);assert.ok(inspectedFile.ok);assert.deepEqual(inspectedFile.graph.faces_holes,i.topology.splitGraph.faces_holes);assert.deepEqual(inspectedFile.foldedVertices,i.topology.splitFolded);assert.equal(exportDXF(doc).text.split(/\r?\n/).filter(l=>l==='LINE').length,doc.segments.length);}
});
test('wrong ring roles, duplicate bindings, orphan components and stale provenance reject explicitly',()=>{
 const c=cases[0];for(const ringHoles of [[],[true],[{face:0,component:true}],[{face:0,component:1,extra:0}],[{face:0,component:1},{face:1,component:1}]])assert.equal(readWovenGraph({...c.params.graph,ringHoles}),null);for(const b of [{face:1,component:1},{face:4,component:1},{face:0,component:0}])assert.throws(()=>wovenMotherRegions({...c.params.graph,ringHoles:[b]}));
 for(const mutate of [(r:TessResponse)=>{delete r.source.wovenMotherRingHoles;},(r:TessResponse)=>{(r.source.sourceFaceHoles as number[][][])[0][0].reverse();},(r:TessResponse)=>{r.fold.faces_holes![1]=[];},(r:TessResponse)=>{(r.source.foldedForm as number[][])[5][0]+=.01;}]){const bad=structuredClone(c.response);mutate(bad);assert.equal(inspectWovenCutTopology(prepareTessResult(bad,c.params),c.params).ok,false);}
});
test('holes are rigid corners in live geometry validation and multi-hole declarations do not silently select sheets',()=>{
 const c=cases[1],r=prepareTessResult(c.response,c.params),input=tessFlatInput(r,r.doc,tessConstructionKey(c.params),true),bad=structuredClone(input),v=bad.graph.faces_holes!.flat(2)[0];bad.wovenCutFoldedVertices![v][0]+=.01;assert.equal(computeTessFlatGeometry(bad).geometry.status,'invalid');assert.equal(c.params.graph.nestedSheets,undefined);assert.equal(wovenMotherRegions(c.params.graph).physicalComponents.length,1);const partial=structuredClone(c.params.graph);partial.ringHoles!.pop();assert.throws(()=>wovenMotherRegions(partial),/未声明/);
});
