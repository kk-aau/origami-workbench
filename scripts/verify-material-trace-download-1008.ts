import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {editMaterialFaces,type MaterialFaceTraceIntent} from '../src/core/materialFaceEdit';
import {computeFlatFold} from '../src/core/flatFold';
import {resolveStartingFace} from '../src/app/flatFoldSettings';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {DXF_LAYERS} from '../src/core/dxf';
import type {Doc} from '../src/core/types';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-trace-${name}-1008.zhezhi.json`,'utf8'),'json').doc,material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const requests=JSON.parse(fs.readFileSync('output/audits/material-trace-requests-1008.json','utf8')) as Record<string,MaterialFaceTraceIntent>,summary:Record<string,unknown>={};
assert.deepEqual(read('cancel'),read('grid-source'));assert.deepEqual(read('undo'),read('grid-source'));assert.deepEqual(read('redo'),read('applied'));assert.deepEqual(read('applied'),read('grid-final'));
for(const name of ['grid','hole','original']){
 const source=read(`${name}-source`),doc=read(`${name}-final`),before=material(source),result=editMaterialFaces(source,requests[name]),m=material(doc);assert.deepEqual(doc,result.doc);assert.deepEqual(m.graph.vertices_coords.slice(0,before.graph.vertices_coords.length),before.graph.vertices_coords);assert.equal(m.components.length,before.components.length);
 if(name==='original'){assert.equal(result.trace!.faces,5);assert.equal(result.placement,'preserved');assert.deepEqual(m.foldedVertices!.slice(0,before.foldedVertices!.length),before.foldedVertices);}
 else assert.equal(result.placement,'recomputed');
 if(name==='hole'){assert.equal(m.components[0].boundaryLoops.length,2);for(const id of result.insertedIds!){const s=doc.segments.find(s=>s.id===id)!;assert.ok(Math.max(s.a[0],s.b[0])<=100||Math.min(s.a[0],s.b[0])>=200,'no crease spans the hole');}}
 if(name==='grid')assert.ok(m.graph.faces_vertices![m.startingFace!].every(v=>m.graph.vertices_coords[v][1]<=50),'visual left side kept');
 const foldText=fs.readFileSync(`output/playwright/material-trace-${name}-final-1008.fold`,'utf8'),raw=JSON.parse(foldText),loaded=importDocument(foldText,'fold').doc,fm=material(loaded);assert.deepEqual(raw.vertices_coords,m.graph.vertices_coords);assert.deepEqual(raw.file_frames[0].vertices_coords,m.foldedVertices);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);
 for(const candidate of [doc,loaded]){const graph=material(candidate).graph;assert.deepEqual(resolveStartingFace(candidate,graph),{face:m.startingFace,stale:false});const flat=computeFlatFold(candidate);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}
 const dxf=fs.readFileSync(`output/playwright/material-trace-${name}-final-1008.dxf`,'utf8'),pairs=dxf.trimEnd().split(/\r?\n/),records:Record<string,string>[]=[];let row:Record<string,string>={};assert.equal(pairs.length%2,0);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('POLYLINE'));
 for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};records.push(row);}row[pairs[i]]=pairs[i+1];}const lines=records.filter(r=>r['0']==='LINE');assert.equal(lines.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=lines[i];assert.equal(e['8'],DXF_LAYERS[s.assignment].name);assert.ok([Number(e['10']),-Number(e['20'])].every((n,j)=>n===s.a[j])&&[Number(e['11']),-Number(e['21'])].every((n,j)=>n===s.b[j]));});
 summary[name]={before:{vertices:before.graph.vertices_coords.length,edges:before.graph.edges_vertices.length,faces:before.graph.faces_vertices!.length,components:before.components.length},after:{vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,components:m.components.length,root:m.startingFace},trace:result.trace,placement:result.placement,ordinaryDXF:'exact R12 LINE endpoints, assignment layers and millimeters'};
}
fs.writeFileSync('output/audits/material-trace-download-1008.json',JSON.stringify({verified:true,cancelUndoRedoExact:true,independentCompleteReplayExact:true,originalCPExact:true,originalFFExactWhenPreserved:true,realHoleNeverBridged:true,visualLeftRootVerified:true,actualFoldTopologyAndCPFFExact:true,actualOrdinaryDXFExact:true,allNativeAndFoldLayersSolved:true,allFrontBackRegionsOrdered:true,cases:summary},null,2));
console.log('Actual trace downloads verified: three complete operation replays, material CP/FF, hole exclusion, visual root side, JSON/FOLD layers and ordinary R12 DXF.');
