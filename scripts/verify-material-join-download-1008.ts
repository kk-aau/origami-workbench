import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {joinMaterialEdges} from '../src/core/materialJoin';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-join-${name}-1008.zhezhi.json`,'utf8'),'json').doc;
const source=read('source'),applied=read('applied'),final=read('final');
assert.deepEqual(read('cancel'),source);assert.deepEqual(read('flat-cancel'),source);assert.deepEqual(read('undo'),source);assert.deepEqual(read('redo'),applied);assert.deepEqual(final,applied);
const before=inspectMaterialTopology(source);assert.ok(before.ok);
const expected=joinMaterialEdges(source,{kind:'material-join',pairs:[{first:'material-11',second:'material-11::cut-bank-1',assignment:'V'}]});
assert.equal(expected.placement,'preserved');assert.deepEqual(expected.doc,final);
const material=inspectMaterialTopology(final);assert.ok(material.ok);assert.equal(material.components.length,3);
for(const [f,face] of material.graph.faces_vertices!.entries()){
 const old=before.graph.faces_vertices![f];assert.deepEqual(face.map(v=>material.graph.vertices_coords[v]),old.map(v=>before.graph.vertices_coords[v]));
 assert.deepEqual(face.map(v=>material.foldedVertices![v]),old.map(v=>before.foldedVertices![v]));
}
const text=fs.readFileSync('output/playwright/material-join-final-1008.fold','utf8'),raw=JSON.parse(text),doc=importDocument(text,'fold').doc,loaded=inspectMaterialTopology(doc);assert.ok(loaded.ok);
assert.deepEqual(raw.vertices_coords,material.graph.vertices_coords);assert.deepEqual(raw.file_frames[0].vertices_coords,material.foldedVertices);assert.deepEqual(loaded.graph,material.graph);assert.deepEqual(loaded.foldedVertices,material.foldedVertices);
for(const candidate of [final,doc]){const flat=computeFlatFold(candidate);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}
const flatApplied=read('flat-applied'),flatExpected=joinMaterialEdges(source,{kind:'material-join',pairs:[{first:'material-11',second:'material-11::cut-bank-1',assignment:'F'}]});assert.equal(flatExpected.placement,'recomputed');assert.deepEqual(flatApplied,flatExpected.doc);
const flatFoldText=fs.readFileSync('output/playwright/material-join-flat-applied-1008.fold','utf8'),flatLoaded=importDocument(flatFoldText,'fold').doc,flatMaterial=inspectMaterialTopology(flatLoaded);assert.ok(flatMaterial.ok);
const flatNative=inspectMaterialTopology(flatApplied);assert.ok(flatNative.ok);
assert.deepEqual(flatMaterial.graph,flatNative.graph);assert.deepEqual(flatMaterial.foldedVertices,flatNative.foldedVertices);
assert.equal(computeFlatFold(flatLoaded).layers.status,'solved');
fs.writeFileSync('output/audits/material-join-download-1008.json',JSON.stringify({verified:true,
 cancelExact:true,flatPreviewCancelExact:true,undoExact:true,redoExact:true,independentJoinReplayExact:true,
 before:{vertices:before.graph.vertices_coords.length,edges:before.graph.edges_vertices.length,components:before.components.length},
 after:{vertices:material.graph.vertices_coords.length,edges:material.graph.edges_vertices.length,components:material.components.length},
 perFaceCPAndFFExact:true,actualFoldCPAndFFExact:true,foldRoundtripTopologyExact:true,
 nativeLayers:'solved',foldLayers:'solved',frontAndBackOrdered:true,
 flatJoinRecomputedAndIndependentlyReplayed:true,flatJoinActualFoldRoundtrip:true,
},null,2));
console.log('Actual join downloads verified: explicit join replay, exact face CP/FF, cancel/undo/redo, material FOLD and both sides.');
