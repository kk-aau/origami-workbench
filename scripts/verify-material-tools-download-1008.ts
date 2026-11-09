import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {constructMaterialCopy,type MaterialConstructionCopyIntent} from '../src/app/materialConstructionCopy';
import {computeFlatFold} from '../src/core/flatFold';
import {resolveStartingFace} from '../src/app/flatFoldSettings';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {DXF_LAYERS} from '../src/core/dxf';
import type {Doc} from '../src/core/types';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-tools-${name}-1008.zhezhi.json`,'utf8'),'json').doc;
const material=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const source=read('source'),old=material(source),cases:Record<string,unknown>={};
const transforms:Record<string,MaterialConstructionCopyIntent['transform']>={copyselection:{kind:'translate',from:[0,0],to:[600,0]},copyfour:{kind:'similarity',a:[0,0],b:[200,0],c:[600,0],d:[600,200]},mirrorselection:{kind:'reflect',a:[600,0],b:[600,200]},inplace:{kind:'translate',from:[0,0],to:[0,0]}};
for(const [id,transform] of Object.entries(transforms)){
 const expected=constructMaterialCopy(source,{kind:'material-construction-copy',segmentIds:old.edgeSegmentIds,transform}).doc,doc=read(id+'-final'),m=material(doc);
 assert.deepEqual(doc,expected);assert.deepEqual(read(id+'-preview'),source);assert.deepEqual(read(id+'-undo'),source);assert.deepEqual(read(id+'-applied'),doc);assert.deepEqual(read(id+'-redo'),doc);
 assert.deepEqual(doc.segments.slice(0,source.segments.length),source.segments);assert.deepEqual(m.graph.vertices_coords.slice(0,14),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,14),old.foldedVertices);
 const text=fs.readFileSync(`output/playwright/material-tools-${id}-final-1008.fold`,'utf8'),raw=JSON.parse(text),fold=importDocument(text,'fold').doc,fm=material(fold);
 assert.deepEqual(raw.vertices_coords,m.graph.vertices_coords);assert.deepEqual(raw.file_frames[0].vertices_coords,m.foldedVertices);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);
 for(const candidate of [doc,fold]){const root=resolveStartingFace(candidate,material(candidate).graph);assert.equal(root.stale,false);const flat=computeFlatFold(candidate,undefined,{startingFace:root.face});assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}
 const dxf=fs.readFileSync(`output/playwright/material-tools-${id}-final-1008.dxf`,'utf8'),pairs=dxf.trimEnd().split(/\r?\n/),rows:Record<string,string>[]=[];let row:Record<string,string>={};assert.equal(pairs.length%2,0);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('POLYLINE'));for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};rows.push(row);}row[pairs[i]]=pairs[i+1];}const lines=rows.filter(r=>r['0']==='LINE');assert.equal(lines.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=lines[i];assert.equal(e['8'],DXF_LAYERS[s.assignment].name);assert.ok([Number(e['10']),-Number(e['20'])].every((n,j)=>n===s.a[j]));assert.ok([Number(e['11']),-Number(e['21'])].every((n,j)=>n===s.b[j]));});
 cases[id]={vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,components:m.components.length,dxfLines:lines.length};
}
assert.deepEqual(read('mirror-ready'),source);assert.deepEqual(read('cancel'),source);
const square=importDocument(fs.readFileSync('output/playwright/material-copy-square-source-1008.zhezhi.json','utf8'),'json').doc;
for(const id of ['copyselection','copyfour','mirrorselection']){assert.deepEqual(read('partial-'+id+'-before'),square);assert.deepEqual(read('partial-'+id+'-after'),square);}
fs.writeFileSync('output/audits/material-tools-download-1008.json',JSON.stringify({verified:true,fullIntentsReplayedExactly:true,previewsCancelUndoRedoExact:true,partialRejectionsLeaveWholeDocumentExact:true,originalCPFFSegmentsExact:true,actualFOLDCPFFExact:true,allNativeFOLDLayersSolved:true,allFrontBackRegionsOrdered:true,ordinaryR12DXFGeometryExactlySameMillimeters:true,cases},null,2));
console.log('Verified four actual canvas tool outputs, complete intent replay, history, CP/FF FOLD, front/back layers and ordinary LINE DXF.');
