import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {cutMaterialEdges} from '../src/core/materialCut';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-cut-${name}-1007.zhezhi.json`,'utf8'),'json').doc;
const original=read('source'),cancel=read('cancel'),applied=read('applied'),undo=read('undo'),redo=read('redo'),final=read('final');
assert.deepEqual(cancel,original);assert.deepEqual(undo,cancel);assert.deepEqual(redo,applied);assert.deepEqual(final,applied);
const old=inspectMaterialTopology(original);assert.ok(old.ok);
const selected=old.edgeSegmentIds.find((_,e)=>old.graph.edges_assignment[e]!=='B')!;
const expected=cutMaterialEdges(original,{kind:'material-cut',segmentIds:[selected]});assert.deepEqual(final,expected.doc);
const current=inspectMaterialTopology(final);assert.ok(current.ok);assert.equal(current.components.length,4);
assert.deepEqual(current.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);
assert.deepEqual(current.foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);
const text=fs.readFileSync('output/playwright/material-cut-final-1007.fold','utf8'),raw=JSON.parse(text),roundtrip=importDocument(text,'fold').doc,folded=inspectMaterialTopology(roundtrip);assert.ok(folded.ok);
assert.deepEqual(raw.vertices_coords,current.graph.vertices_coords);assert.deepEqual(raw.file_frames[0].vertices_coords,current.foldedVertices);
assert.deepEqual(folded.graph,current.graph);assert.deepEqual(folded.foldedVertices,current.foldedVertices);
for(const doc of [final,roundtrip]){
 const flat=computeFlatFold(doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');
 const analysis=modelOverlapRegions(flat);
 for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,analysis,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}
}
fs.writeFileSync('output/audits/material-cut-download-1007.json',JSON.stringify({verified:true,
 cancelUnchanged:true,undoExact:true,redoExact:true,independentCutReplayExact:true,
 before:{vertices:old.graph.vertices_coords.length,edges:old.graph.edges_vertices.length,components:old.components.length},
 after:{vertices:current.graph.vertices_coords.length,edges:current.graph.edges_vertices.length,components:current.components.length},
 originalCPAndFFCoordinatesExact:true,actualBrowserFoldCPAndFFExact:true,foldRoundtripTopologyExact:true,
 nativeLayers:'solved',foldLayers:'solved',frontAndBackOrdered:true,
},null,2));
console.log('Actual cut downloads verified: exact CP/FF, independent operation replay, cancel/undo/redo, FOLD roundtrip and both sides.');
