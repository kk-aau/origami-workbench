import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {reflectMaterialEdge,type MaterialEdgeReflectIntent} from '../src/core/materialReflect';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {resolveStartingFace} from '../src/app/flatFoldSettings';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {DXF_LAYERS} from '../src/core/dxf';
import type {Doc} from '../src/core/types';
const read=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-reflect-${name}-1008.zhezhi.json`,'utf8'),'json').doc,material=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const cases:Record<string,unknown>={};
for(const kind of ['F','M','D']){
 const source=read(kind+'-source'),s=source.segments.find(s=>s.assignment===(kind==='M'?'M':'F'))!,req:MaterialEdgeReflectIntent={kind:'material-edge-reflect',sourceId:s.id,axisId:'mirror-axis',component:'source',fixedSide:'left',cpOnly:false},r=reflectMaterialEdge(source,req),doc=read(kind+'-final'),m=material(doc);
 assert.deepEqual(doc,r.doc);assert.deepEqual(read(kind+'-applied'),doc);assert.deepEqual(read(kind+'-preview'),source);assert.deepEqual(read(kind+'-cancel'),source);assert.deepEqual(read(kind+'-undo'),source);assert.deepEqual(read(kind+'-redo'),doc);
 const fold=importDocument(fs.readFileSync(`output/playwright/material-reflect-${kind}-final-1008.fold`,'utf8'),'fold').doc,fm=material(fold);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);assert.deepEqual(resolveStartingFace(fold,fm.graph),resolveStartingFace(doc,m.graph));
 for(const candidate of [doc,fold]){const root=resolveStartingFace(candidate,material(candidate).graph);assert.equal(root.stale,false);const flat=computeFlatFold(candidate,undefined,{startingFace:root.face});assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}}
 const dxf=fs.readFileSync(`output/playwright/material-reflect-${kind}-final-1008.dxf`,'utf8'),pairs=dxf.trimEnd().split(/\r?\n/),rows:Record<string,string>[]=[];let row:Record<string,string>={};assert.equal(pairs.length%2,0);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('POLYLINE'));for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};rows.push(row);}row[pairs[i]]=pairs[i+1];}const lines=rows.filter(r=>r['0']==='LINE');assert.equal(lines.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=lines[i];assert.equal(e['8'],DXF_LAYERS[s.assignment].name);assert.ok([Number(e['10']),-Number(e['20'])].every((n,j)=>n===s.a[j]));assert.ok([Number(e['11']),-Number(e['21'])].every((n,j)=>n===s.b[j]));});
 if(kind==='D'){assert.deepEqual(r.reflection.from,[25,0]);assert.deepEqual(r.reflection.to,[25,100]);assert.equal(m.graph.vertices_coords.filter(p=>p[0]===25&&p[1]===25).length,1);}
 cases[kind]={vertices:m.graph.vertices_coords.length,materialEdges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,components:m.components.length,dxfLines:lines.length,placement:r.placement};
}
const source=read('F-source'),req:MaterialEdgeReflectIntent={kind:'material-edge-reflect',sourceId:source.segments.find(s=>s.assignment==='F')!.id,axisId:'mirror-axis',component:'source',fixedSide:'left',cpOnly:true};assert.deepEqual(read('duplicate'),source);assert.deepEqual(read('cp-only'),reflectMaterialEdge(source,req).doc);assert.equal(material(read('cp-only')).foldedVertices,undefined);
fs.writeFileSync('output/audits/material-reflect-download-1008.json',JSON.stringify({verified:true,fullMirrorIntentReplay:true,previewCancelUndoRedoExact:true,exact45DegreeBoundaryAndUniqueCrossing:true,actualNativeFOLDCPFFAndRootsExact:true,frontBackLayersOrdered:true,ordinaryR12LineMillimetersExact:true,cpOnlyExplicitAndDuplicateNoChange:true,cases},null,2));console.log('Verified actual finite material mirror files: F/M/45-degree full replay, exact history, native/FOLD CP/FF/roots, both layers, ordinary DXF, duplicate refusal and explicit CP-only.');
