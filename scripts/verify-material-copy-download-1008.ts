import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {copyMaterialComponents,type MaterialCopyIntent} from '../src/core/materialCopy';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {resolveStartingFace,setStartingFace} from '../src/app/flatFoldSettings';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {DXF_LAYERS} from '../src/core/dxf';
import type {Doc} from '../src/core/types';
import {buildFold} from '../src/core/geometry';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-copy-${name}-1008.zhezhi.json`,'utf8'),'json').doc,material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;},source=read('source'),old=material(source);
const array:MaterialCopyIntent={kind:'material-copy',segmentIds:old.edgeSegmentIds,placements:[{dx:400,dy:-20,rotation:0,scale:1,mirror:'none'},{dx:800,dy:-40,rotation:0,scale:1,mirror:'none'}]},arrayExpected=copyMaterialComponents(source,array),arrayDoc=read('array-final');
assert.deepEqual(arrayDoc,arrayExpected.doc);assert.deepEqual(read('cancel'),source);assert.deepEqual(read('undo'),source);assert.deepEqual(read('redo'),arrayDoc);assert.deepEqual(read('applied'),arrayDoc);
const transform:MaterialCopyIntent={kind:'material-copy',segmentIds:old.edgeSegmentIds,placements:[{dx:400,dy:0,rotation:30,scale:.75,mirror:'x'}]},transformed=read('transform-final');assert.deepEqual(transformed,copyMaterialComponents(source,transform).doc);
const square=read('square-source'),inplace=copyMaterialComponents(square,{kind:'material-copy',segmentIds:material(square).edgeSegmentIds,placements:[{dx:0,dy:0,rotation:0,scale:1,mirror:'none'}]}).doc,chosen=setStartingFace(inplace,1);assert.deepEqual(read('inplace-root'),chosen);
const direct:MaterialCopyIntent={kind:'material-copy',segmentIds:old.components[0].edges.map(e=>old.edgeSegmentIds[e]),placements:[{dx:400,dy:0,rotation:0,scale:1,mirror:'none'}]};assert.deepEqual(read('direct-copy'),copyMaterialComponents(source,direct).doc);
const summary:Record<string,unknown>={};
for(const name of ['array-final','transform-final','inplace-root']){
 const doc=read(name),m=material(doc),root=resolveStartingFace(doc,m.graph);assert.equal(root.stale,false);const text=fs.readFileSync(`output/playwright/material-copy-${name}-1008.fold`,'utf8'),raw=JSON.parse(text),fold=importDocument(text,'fold').doc,fm=material(fold);
 assert.deepEqual(raw.vertices_coords,m.graph.vertices_coords);assert.deepEqual(raw.file_frames[0].vertices_coords,m.foldedVertices);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);assert.deepEqual(resolveStartingFace(fold,fm.graph),root);
 for(const candidate of [doc,fold]){const flat=computeFlatFold(candidate,undefined,{startingFace:root.face});assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}
 if(name!=='inplace-root'){
  assert.deepEqual(m.graph.vertices_coords.slice(0,14),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,14),old.foldedVertices);assert.deepEqual(doc.segments.slice(0,source.segments.length),source.segments);
  const dxf=fs.readFileSync(`output/playwright/material-copy-${name}-1008.dxf`,'utf8'),pairs=dxf.trimEnd().split(/\r?\n/),records:Record<string,string>[]=[];let row:Record<string,string>={};assert.equal(pairs.length%2,0);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('POLYLINE'));for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};records.push(row);}row[pairs[i]]=pairs[i+1];}const lines=records.filter(r=>r['0']==='LINE');assert.equal(lines.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=lines[i];assert.equal(e['8'],DXF_LAYERS[s.assignment].name);assert.ok([Number(e['10']),-Number(e['20'])].every((n,j)=>n===s.a[j])&&[Number(e['11']),-Number(e['21'])].every((n,j)=>n===s.b[j]));});
 }
 summary[name]={vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,components:m.components.length,activeRoot:root.face};
}
const repaired=read('ordinary-root-repaired');assert.equal(repaired.flatFold!.materialFace,undefined);assert.deepEqual(resolveStartingFace(repaired,buildFold(repaired).graph),{face:0,stale:false});assert.equal(computeFlatFold(repaired).layers.status,'solved');
fs.writeFileSync('output/audits/material-copy-download-1008.json',JSON.stringify({verified:true,cancelUndoRedoExact:true,completeArrayTransformAndDirectReplayExact:true,originalCPFFAndSegmentsExact:true,actualFoldCPFFExact:true,selectedCoincidentCopyRootPreserved:true,allNativeAndFoldLayersSolved:true,allFrontBackRegionsOrdered:true,ordinaryDXFLineMillimeterGeometryExact:true,ordinaryRootRepairDownloadedAndSolved:true,cases:summary},null,2));
console.log('Actual material copy files verified: full replay, unchanged originals, array/transform/in-place roots, CP/FF FOLD and ordinary R12 DXF.');
