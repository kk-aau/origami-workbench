import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {editMaterialFaces,type MaterialFaceInsertIntent} from '../src/core/materialFaceEdit';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {resolveStartingFace} from '../src/app/flatFoldSettings';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import type {Doc} from '../src/core/types';
import {DXF_LAYERS} from '../src/core/dxf';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-face-${name}-1008.zhezhi.json`,'utf8'),'json').doc;
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const source=read('source'),applied=read('applied'),final=read('final'),request=JSON.parse(fs.readFileSync('output/audits/material-face-request-1008.json','utf8')) as MaterialFaceInsertIntent;
assert.deepEqual(read('cancel'),source);assert.deepEqual(read('undo'),source);assert.deepEqual(read('redo'),applied);assert.deepEqual(final,applied);
const expected=editMaterialFaces(source,request);assert.deepEqual(final,expected.doc);assert.equal(expected.placement,'preserved');const before=material(source),after=material(final);
assert.deepEqual(after.graph.vertices_coords.slice(0,before.graph.vertices_coords.length),before.graph.vertices_coords);assert.deepEqual(after.foldedVertices!.slice(0,before.foldedVertices!.length),before.foldedVertices);assert.equal(after.components.length,before.components.length);
const removed=read('removed'),deletion=editMaterialFaces(final,{kind:'material-face-remove',segmentIds:[expected.insertedId!]});assert.deepEqual(removed,deletion.doc);assert.deepEqual(read('remove-cancel'),final);assert.deepEqual(read('remove-undo'),final);assert.deepEqual(read('remove-redo'),removed);assert.equal(deletion.placement,'preserved');
const square=read('square-source'),mountainRequest:MaterialFaceInsertIntent={kind:'material-face-insert',face:0,from:{edgeId:'material-edge-0',fraction:.5},to:{edgeId:'material-edge-2',fraction:.5},assignment:'M',fixedPart:1},mountain=editMaterialFaces(square,mountainRequest);
assert.equal(mountain.placement,'recomputed');assert.deepEqual(read('mountain'),mountain.doc);const mountainRemoved=editMaterialFaces(mountain.doc,{kind:'material-face-remove',segmentIds:[mountain.insertedId!]});assert.equal(mountainRemoved.placement,'recomputed');assert.deepEqual(read('mountain-removed'),mountainRemoved.doc);
const sizes:Record<string,unknown>={};
for(const name of ['final','removed','mountain','mountain-removed']){
 const native=read(name),m=material(native),text=fs.readFileSync(`output/playwright/material-face-${name}-1008.fold`,'utf8'),raw=JSON.parse(text),loaded=importDocument(text,'fold').doc,fold=material(loaded);
 assert.deepEqual(raw.vertices_coords,m.graph.vertices_coords);assert.deepEqual(raw.file_frames[0].vertices_coords,m.foldedVertices);assert.deepEqual(fold.graph,m.graph);assert.deepEqual(fold.foldedVertices,m.foldedVertices);assert.deepEqual(resolveStartingFace(native,m.graph),{face:m.startingFace,stale:false});assert.deepEqual(resolveStartingFace(loaded,fold.graph),{face:fold.startingFace,stale:false});
 for(const doc of [native,loaded]){const flat=computeFlatFold(doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}
 sizes[name]={vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,components:m.components.length,root:m.startingFace};
}
for(const name of ['final','mountain']){
 const doc=read(name),text=fs.readFileSync(`output/playwright/material-face-${name}-1008.dxf`,'utf8'),pairs=text.trimEnd().split(/\r?\n/),entities:Record<string,string>[]=[];let row:Record<string,string>={};
 assert.equal(pairs.length%2,0);assert.ok(text.includes('AC1009'));assert.ok(!text.includes('POLYLINE'));
 for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};entities.push(row);}row[pairs[i]]=pairs[i+1];}
 const lines=entities.filter(row=>row['0']==='LINE');assert.equal(lines.length,doc.segments.length);
 doc.segments.forEach((s,i)=>{const e=lines[i];assert.equal(e['8'],DXF_LAYERS[s.assignment].name);const a=[Number(e['10']),-Number(e['20'])],b=[Number(e['11']),-Number(e['21'])];assert.ok(a.every((n,j)=>n===s.a[j])&&b.every((n,j)=>n===s.b[j]),'DXF LINE endpoints match exactly, including physically identical signed zero');assert.equal(e['30'],'0');assert.equal(e['31'],'0');});
}
const cp=importDocument(fs.readFileSync('output/playwright/material-face-mountain-1008.cp','utf8'),'cp').doc;
assert.deepEqual(cp.segments.map(s=>({a:s.a,b:s.b,assignment:s.assignment})),mountain.doc.segments.map(s=>({a:s.a,b:s.b,assignment:s.assignment})));
fs.writeFileSync('output/audits/material-face-download-1008.json',JSON.stringify({verified:true,cancelUndoRedoExact:true,removeCancelUndoRedoExact:true,independentInsertionReplayExact:true,independentRemovalReplayExact:true,originalCPAndFFExact:true,actualFoldCPAndFFExact:true,rootIdentityResolved:true,mountainInsertionAndRemovalActuallyRecomputed:true,allNativeAndFoldLayersSolved:true,allFrontBackRegionsOrdered:true,ordinaryDXFExactLineMillimeterGeometry:true,mountainCPOriginalCoordinatesExact:true,sizes},null,2));
console.log('Actual face-edit downloads verified: insert/remove replay, exact original CP/FF, history, material FOLD, anchored M refold and both sides.');
