import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {sampleMaterialCurves,type MaterialCurveIntent} from '../src/core/materialCurves';
import {computeFlatFold} from '../src/core/flatFold';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
import type {Assignment,Doc} from '../src/core/types';
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const read=(name:string,ext:string)=>fs.readFileSync(`output/playwright/material-curves-${name}-1009.${ext}`,'utf8');
const cases:Record<string,unknown>={};
for(const name of ['ellipse','bezier','nested','crossing','hole','cp-only']){
 const source=importDocument(fs.readFileSync(`output/playwright/material-curves-${name}-initial-1009.zhezhi.json`,'utf8'),'json').doc,native=importDocument(read(name,'zhezhi.json'),'json').doc,m=material(native),fold=importDocument(read(name,'fold'),'fold').doc,fm=material(fold),record=native.metadata!.materialCurveConstruction as {schema:string;intent:MaterialCurveIntent;sampledGraph:unknown;errorBounds:number[];insertedSegmentIds:string[]};
 assert.equal(record.schema,'zhezhi-material-curves-v1');const expected=editMaterialFaces(source,record.intent),em=material(expected.doc);assert.deepEqual(m.graph,em.graph);assert.deepEqual(m.foldedVertices,em.foldedVertices);assert.equal(m.startingFace,em.startingFace);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);assert.equal(fm.startingFace,m.startingFace);
 const sampled=sampleMaterialCurves(record.intent.curves,record.intent.deviation);assert.deepEqual(sampled.graph,record.sampledGraph);assert.deepEqual(sampled.errorBounds,record.errorBounds);assert.ok(sampled.maximumError<=record.intent.deviation);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,name==='hole'?2:1);assert.deepEqual(m.graph.vertices_coords.slice(0,source.paper.width===100&&name==='hole'?8:4),material(source).graph.vertices_coords);
 if(name==='cp-only'){assert.equal(m.foldedVertices,undefined);assert.equal(record.intent.cpOnly,true);}else{assert.equal(computeFlatFold(native).layers.status,'solved');assert.equal(computeFlatFold(fold).layers.status,'solved');}
 const dxf=read(name,'dxf');assert.equal(dxf,exportDXF(native).text);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('LWPOLYLINE'));
 const lines=dxf.trim().split(/\r?\n/),entities:Map<number,string>[]=[];let entity:Map<number,string>|null=null;
 for(let i=0;i<lines.length;i+=2){const code=Number(lines[i]),value=lines[i+1];if(code===0){if(entity)entities.push(entity);entity=value==='LINE'?new Map():null;}else if(entity)entity.set(code,value);}
 assert.equal(entities.length,native.segments.length);native.segments.forEach((s,i)=>{const e=entities[i];assert.equal(e.get(8),DXF_LAYERS[s.assignment as Assignment].name);for(const [code,value] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]] as const)assert.ok(Number(e.get(code))===value);});
 cases[name]={curves:record.intent.curves.length,curveInputSegments:sampled.graph.edges.length,maximumError:sampled.maximumError,deviation:record.intent.deviation,vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,ordinaryDXFLines:entities.length,placement:name==='cp-only'?'no-FF':'preserved'};
}
const source=importDocument(fs.readFileSync('output/playwright/material-curves-ellipse-initial-1009.zhezhi.json','utf8'),'json').doc,sm=material(source);
for(const name of ['cancel','undo']){const doc=importDocument(read(name,'zhezhi.json'),'json').doc,m=material(doc);assert.deepEqual(m.graph,sm.graph);assert.deepEqual(m.foldedVertices,sm.foldedVertices);assert.equal(m.startingFace,sm.startingFace);assert.deepEqual(doc.segments,source.segments);assert.equal(doc.metadata!.materialCurveConstruction,undefined);}
const applied=importDocument(read('history-applied','zhezhi.json'),'json').doc,redo=importDocument(read('redo','zhezhi.json'),'json').doc;assert.deepEqual(material(redo),material(applied));assert.deepEqual(redo.segments,applied.segments);assert.deepEqual(redo.metadata!.materialCurveConstruction,applied.metadata!.materialCurveConstruction);
fs.writeFileSync('output/audits/material-curves-download-1009.json',JSON.stringify({verified:true,sixActualDownloadGroups:true,sourceCurvesIndependentlyResampled:true,proposalIndependentlyReplayed:true,oldMaterialCoordinatesAndHolesPreserved:true,nativeFOLDGeometryPlacementRootExact:true,reopenedFlatLayersExceptExplicitCPOnly:true,ordinaryR12LINEMillimetersAndCountsExact:true,cancelUndoRedoExact:true,cases},null,2));
console.log('Verified six real curve construction/download groups: bounded resampling, replayed material graph, JSON/FOLD CP/FF/root, preserved holes, and ordinary R12 LINE millimeters/counts.');
