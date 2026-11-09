import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareTessResult,readTessParams,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {wovenNestedSheetsPreset,type WovenParams} from '../../src/app/wovenParams';
import {readWovenGraph} from '../../src/app/wovenGraph';
import {readWovenGraphDraft,editWovenGraphDraft} from '../../src/app/wovenGraphEdit';
import {readWovenGraphPackage,wovenResultMatchesGraph} from '../../src/app/wovenGraphInspection';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {recomputeFlatLayers,computeFlatFold} from '../../src/core/flatFold';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
type Case={name:string;params:WovenParams&{mode:'graph'};response:TessResponse};
const {cases}=JSON.parse(fs.readFileSync('tests/fixtures/woven-nested-sheets-1008.json','utf8')) as {cases:Case[]};
test('a nested independent sheet keeps explicit hole provenance, original cuts and its own frame',()=>{
 const c=JSON.parse(fs.readFileSync('tests/fixtures/woven-nested-hole-sheet-1008.json','utf8')) as Case,r=prepareTessResult(c.response,c.params),i=inspectWovenCutTopology(r,c.params);assert.ok(i.ok,i.ok?'':i.reason);assert.equal(r.mother!.faces_vertices!.length,8);assert.equal(i.topology.components.length,9);assert.deepEqual((r.source.wovenMotherHoles as any).faceIds,[8]);const doc=wovenMaterialDocument(r,c.params),m=inspectMaterialTopology(doc);assert.ok(m.ok);assert.equal(m.components.length,9);assert.equal(computeFlatFold(doc).layers.status,'solved');for(const format of ['json','fold'] as const){const x=inspectMaterialTopology(importDocument(exportDocument(doc,format).text,format).doc);assert.ok(x.ok);assert.deepEqual(x.graph,m.graph);assert.deepEqual(x.foldedVertices,m.foldedVertices);}
});
test('explicit nested sheet intent survives readers, edits and original graph packages',()=>{
 assert.deepEqual(wovenNestedSheetsPreset(),cases[0].params);for(const c of cases){assert.deepEqual(readTessParams(c.params),c.params);assert.deepEqual(readWovenGraphPackage(c.params.graph)?.graph,c.params.graph);const g=editWovenGraphDraft(c.params.graph,{kind:'move',vertex:0,point:[.009,.008]}).graph;assert.equal(g.nestedSheets,true);assert.equal(editWovenGraphDraft(g,{kind:'nested-sheets',enabled:false}).graph.nestedSheets,undefined);}
 for(const flag of [false,null,1,'true',undefined]){const bad={...cases[0].params.graph,nestedSheets:flag};assert.equal(readWovenGraph(bad),null);assert.equal(readWovenGraphDraft(bad),null);assert.equal(readTessParams({...cases[0].params,graph:bad}),null);}
});
test('nested contours remain eight mother faces and two distinct physical sheets with exact independent FF placement',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),i=inspectWovenCutTopology(r,c.params);assert.ok(i.ok,i.ok?'':i.reason);assert.equal(r.mother!.faces_vertices!.length,8);assert.equal(i.topology.components.length,2);assert.equal(i.topology.internalBoundaryEdges.length,0);assert.equal(i.topology.standardSingleSheetFold,false);const key=tessConstructionKey(c.params),input=tessFlatInput(r,r.doc,key,true),geometry=computeTessFlatGeometry(input),flat=recomputeFlatLayers(geometry);assert.equal(flat.layers.status,'solved');assert.deepEqual(geometry.geometry.vertices,input.wovenCutFoldedVertices);assert.ok(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status));assert.equal(r.source.wovenMotherHoles,undefined);const component=new Map<number,number>();i.topology.components.forEach((c,f)=>c.vertices.forEach(v=>component.set(v,f)));for(const [a,b] of i.topology.splitGraph.edges_vertices)assert.equal(component.get(a),component.get(b));}
});
test('nested independent material uses existing native/FOLD/DXF without inserted connections or altered scale',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),doc=wovenMaterialDocument(r,c.params),m=inspectMaterialTopology(doc);assert.ok(m.ok);assert.equal(m.components.length,2);assert.deepEqual(m.components.map(c=>c.boundaryLoops.length),[1,1]);assert.equal(computeFlatFold(doc).layers.status,'solved');for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(doc,format).text,format).doc,n=inspectMaterialTopology(loaded);assert.ok(n.ok);assert.deepEqual(n.graph,m.graph);assert.deepEqual(n.foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(loaded).layers.status,'solved');}assert.equal(exportDXF(doc).text.split(/\r?\n/).filter(s=>s==='LINE').length,64);assert.deepEqual(doc.metadata!.tessellation&&((doc.metadata!.tessellation as any).parameters.graph),c.params.graph);}
});
test('removing nested intent invalidates old result; forged independent roots and FF cannot bypass verification',()=>{
 const c=cases[0],r=prepareTessResult(c.response,c.params),g=structuredClone(c.params.graph);delete g.nestedSheets;assert.equal(wovenResultMatchesGraph(r,g),false);const p={...c.params,graph:g};assert.equal(inspectWovenCutTopology(r,p).ok,false);const forged=structuredClone(c.response);delete (forged.source.graph as any).nestedSheets;(forged.stats.parameters as any).graph=g;assert.equal(inspectWovenCutTopology(prepareTessResult(forged,p),p).ok,false);
 for(const mutate of [(r:TessResponse)=>{delete r.source.wovenIndependentMother;},(r:TessResponse)=>{(r.source.wovenIndependentMother as any).foldRoots[1]=0;},(r:TessResponse)=>{(r.source.foldedForm as number[][])[25][0]+=.01;}]){const bad=structuredClone(c.response);mutate(bad);assert.equal(inspectWovenCutTopology(prepareTessResult(bad,c.params),c.params).ok,false);assert.throws(()=>wovenMaterialDocument(prepareTessResult(bad,c.params),c.params));}
});
