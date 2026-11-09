import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {resolveStartingFace} from '../src/app/flatFoldSettings';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {DXF_LAYERS} from '../src/core/dxf';
import {traceMaterialBatch} from '../src/core/materialTraceBatch';
import {copyMaterialComponents} from '../src/core/materialCopy';
import type {Doc} from '../src/core/types';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-holes-${name}-1008.zhezhi.json`,'utf8'),'json').doc,material=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const source=read('source'),old=material(source),remove={kind:'material-face-remove' as const,segmentIds:old.edgeSegmentIds.filter((_,e)=>old.graph.edges_assignment[e]!=='B')},merged=editMaterialFaces(source,remove).doc,doc=read('final');assert.deepEqual(doc,merged);assert.deepEqual(read('applied'),merged);assert.deepEqual(read('undo'),source);assert.deepEqual(read('redo'),merged);assert.deepEqual(read('cancel'),source);assert.equal((doc.metadata!.materialTopology as {schema:string}).schema,'zhezhi-material-topology-v2');assert.equal(material(doc).graph.faces_holes![0].length,1);assert.equal(doc.segments.length,16);
const crease=editMaterialFaces(doc,{kind:'material-face-trace',component:0,from:{edgeId:'material-edge-13',fraction:.5},to:{edgeId:'material-edge-16',fraction:.5},assignment:'M',fixedSide:'left'}).doc;assert.deepEqual(read('M-final'),crease);
assert.deepEqual(read('insert-final'),editMaterialFaces(doc,{kind:'material-face-insert',face:0,from:{edgeId:'material-edge-13',fraction:.5},to:{edgeId:'material-edge-16',fraction:.5},assignment:'M',fixedPart:0}).doc);
assert.deepEqual(read('batch-final'),traceMaterialBatch(doc,{kind:'material-face-traces',component:0,lines:[{from:{edgeId:'material-edge-13',fraction:.5},to:{edgeId:'material-edge-16',fraction:.5},assignment:'F'},{from:{edgeId:'material-edge-4',fraction:.5},to:{edgeId:'material-edge-22',fraction:.5},assignment:'F'}],fixedPoint:[10,10],cpOnly:false,overrides:[]}).doc);
assert.deepEqual(read('copy-final'),copyMaterialComponents(doc,{kind:'material-copy',segmentIds:material(doc).edgeSegmentIds,placements:[{dx:400,dy:0,rotation:0,scale:1,mirror:'x'}]}).doc);
const cases:Record<string,unknown>={};
for(const id of ['final','M-final','insert-final','batch-final','copy-final']){
 const native=read(id),m=material(native),fold=importDocument(fs.readFileSync(`output/playwright/material-holes-${id}-1008.fold`,'utf8'),'fold').doc,fm=material(fold);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);assert.deepEqual(resolveStartingFace(fold,fm.graph),resolveStartingFace(native,m.graph));
 for(const candidate of [native,fold]){const root=resolveStartingFace(candidate,material(candidate).graph);assert.equal(root.stale,false);const flat=computeFlatFold(candidate,undefined,{startingFace:root.face});assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);if(id==='final')assert.equal(overlap.cells.reduce((n,r)=>n+r.area,0),80000);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}
 const dxf=fs.readFileSync(`output/playwright/material-holes-${id}-1008.dxf`,'utf8'),pairs=dxf.trimEnd().split(/\r?\n/),rows:Record<string,string>[]=[];let row:Record<string,string>={};assert.equal(pairs.length%2,0);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('POLYLINE'));for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};rows.push(row);}row[pairs[i]]=pairs[i+1];}const lines=rows.filter(r=>r['0']==='LINE');assert.equal(lines.length,native.segments.length);native.segments.forEach((s,i)=>{const e=lines[i];assert.equal(e['8'],DXF_LAYERS[s.assignment].name);assert.ok([Number(e['10']),-Number(e['20'])].every((n,j)=>n===s.a[j]));assert.ok([Number(e['11']),-Number(e['21'])].every((n,j)=>n===s.b[j]));});
 cases[id]={vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,holes:m.graph.faces_holes?.reduce((n,r)=>n+r.length,0)??0,boundaryLoops:m.components[0].boundaryLoops.length,dxfLines:lines.length};
}
fs.writeFileSync('output/audits/material-holes-download-1008.json',JSON.stringify({verified:true,trueFaceHoleSchemaV2:true,noHelperCPDXFEdges:true,completeRemoveAndMTraceReplay:true,cancelUndoRedoExact:true,actualFOLDCPFFRootsExact:true,frontBackRegionsOrdered:true,annulusArea80000:true,ordinaryR12LineMillimetersExact:true,cases},null,2));console.log('Verified actual holed face/M trace outputs: full replay, no CP helper edges, history, v2 JSON/FOLD rings/CP/FF/roots, exact annulus coverage, both layer directions and ordinary R12 DXF.');
