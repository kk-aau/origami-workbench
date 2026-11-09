import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {copyMaterialSelection,pasteMaterialSelection,cutMaterialSelection,type MaterialPasteIntent} from '../src/app/materialClipboard';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {resolveStartingFace} from '../src/app/flatFoldSettings';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {DXF_LAYERS} from '../src/core/dxf';
import type {Doc} from '../src/core/types';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-clipboard-${name}-1008.zhezhi.json`,'utf8'),'json').doc,material=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const source=read('source'),sm=material(source),target=read('target'),clip=copyMaterialSelection(source,sm.edgeSegmentIds),request=(offset:[number,number]=[400,-20]):MaterialPasteIntent=>({kind:'material-clipboard-paste',clipboard:clip,offset,cpOnly:false,splitTarget:false});
const final=read('final'),expected=pasteMaterialSelection(target,request()).doc;assert.deepEqual(final,expected);assert.deepEqual(read('cancel'),target);assert.deepEqual(read('undo'),target);assert.deepEqual(read('applied'),final);assert.deepEqual(read('redo'),final);assert.deepEqual(final.segments.slice(0,target.segments.length),target.segments);assert.deepEqual(final.objects,target.objects);
const cpOnly=read('cp-only');assert.deepEqual(cpOnly,pasteMaterialSelection(read('no-ff'),{...request([0,0]),cpOnly:true}).doc);assert.equal(material(cpOnly).foldedVertices,undefined);
for(const id of ['plain','empty'])assert.deepEqual(read(id+'-final'),pasteMaterialSelection(read(id),request([400,0])).doc);
const pieceIds=sm.components[0].edges.map(e=>sm.edgeSegmentIds[e]),pieceClip=copyMaterialSelection(source,pieceIds);assert.deepEqual(read('piece-final'),pasteMaterialSelection(target,{...request([400,0]),clipboard:pieceClip}).doc);
const cutRequest={kind:'material-clipboard-cut' as const,segmentIds:pieceIds,lockBoundary:false},cut=cutMaterialSelection(source,cutRequest).doc;assert.deepEqual(read('cut-protected'),source);assert.deepEqual(read('cut-piece'),cut);assert.deepEqual(read('cut-undo'),source);assert.deepEqual(read('cut-redo'),cut);assert.deepEqual(read('cut-all'),cutMaterialSelection(source,{...cutRequest,segmentIds:sm.edgeSegmentIds}).doc);assert.deepEqual(read('cut-paste'),pasteMaterialSelection(read('empty'),request([0,0])).doc);
assert.deepEqual(read('keyboard-final'),pasteMaterialSelection(target,request([0,0])).doc);
const square=importDocument(fs.readFileSync('output/playwright/material-copy-square-source-1008.zhezhi.json','utf8'),'json').doc;assert.deepEqual(read('partial-copy-rejected'),square);assert.deepEqual(read('split-cancel'),read('plain'));
const cases:Record<string,unknown>={};
for(const id of ['final','plain-final','empty-final','cp-only']){
 const doc=read(id),m=material(doc),text=fs.readFileSync(`output/playwright/material-clipboard-${id}-1008.fold`,'utf8'),raw=JSON.parse(text),fold=importDocument(text,'fold').doc,fm=material(fold);assert.deepEqual(raw.vertices_coords,m.graph.vertices_coords);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);
 if(id==='cp-only'){assert.equal(raw.file_frames,undefined);assert.equal(fm.foldedVertices,undefined);}
 else{assert.deepEqual(raw.file_frames[0].vertices_coords,m.foldedVertices);for(const candidate of [doc,fold]){const root=resolveStartingFace(candidate,material(candidate).graph);assert.equal(root.stale,false);const flat=computeFlatFold(candidate,undefined,{startingFace:root.face});assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}}
 const dxf=fs.readFileSync(`output/playwright/material-clipboard-${id}-1008.dxf`,'utf8'),pairs=dxf.trimEnd().split(/\r?\n/),rows:Record<string,string>[]=[];let row:Record<string,string>={};assert.equal(pairs.length%2,0);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('POLYLINE'));for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};rows.push(row);}row[pairs[i]]=pairs[i+1];}const lines=rows.filter(r=>r['0']==='LINE');assert.equal(lines.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=lines[i];assert.equal(e['8'],DXF_LAYERS[s.assignment].name);assert.ok([Number(e['10']),-Number(e['20'])].every((n,j)=>n===s.a[j]));assert.ok([Number(e['11']),-Number(e['21'])].every((n,j)=>n===s.b[j]));});
 cases[id]={vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,components:m.components.length,ordinaryDxfLines:lines.length,hasFF:!!m.foldedVertices};
}
for(const id of ['piece-final','cut-piece','cut-paste','keyboard-final']){const doc=read(id),m=material(doc),root=resolveStartingFace(doc,m.graph);assert.equal(root.stale,false);assert.equal(computeFlatFold(doc,undefined,{startingFace:root.face}).layers.status,'solved');}
fs.writeFileSync('output/audits/material-clipboard-download-1008.json',JSON.stringify({verified:true,fullPasteAndCutIntentsReplayExactly:true,previewCancelAndUndoRedoExact:true,targetOriginalCPFFSegmentsAndObjectsExact:true,sourceUnrelatedObjectsNotCopied:true,cpOnlyExplicitlyDropsFFAndExportsNoFoldedFrame:true,actualNativeFOLDCPFFAndRootVerified:true,allAvailableNativeFOLDLayersSolved:true,allAvailableFrontBackRegionsOrdered:true,ordinaryR12DxfMillimetersExact:true,partialFullCutAndCrossProjectPasteVerified:true,keyboardPasteAndPartialRejectionAndSplitCancelWholeDocumentsExact:true,cases},null,2));
console.log('Verified actual clipboard outputs: target/source identities, full cut/paste replay, history, explicit CP-only, actual FOLD/ordinary DXF and front/back layers.');
