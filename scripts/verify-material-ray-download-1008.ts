import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {editMaterialFaces,type MaterialFaceRayIntent} from '../src/core/materialFaceEdit';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
const read=(f:string)=>fs.readFileSync(f,'utf8'),load=(f:string)=>importDocument(read(f),'json').doc;
const cases=JSON.parse(read('output/playwright/material-ray-cases-1008.json')) as {name:string;source:string;intent:MaterialFaceRayIntent}[],reports=[];
for(const c of cases){
 const source=load(`output/playwright/material-ray-${c.source}-source-1008.zhezhi.json`),expected=editMaterialFaces(source,c.intent),doc=load(`output/playwright/material-ray-${c.name}-1008.zhezhi.json`),original=inspectMaterialTopology(expected.doc),actual=inspectMaterialTopology(doc);assert.ok(original.ok,original.ok?'':original.reason);assert.ok(actual.ok,actual.ok?'':actual.reason);assert.deepEqual(actual.graph,original.graph);assert.deepEqual(actual.foldedVertices,original.foldedVertices);
 const restored=importDocument(read(`output/playwright/material-ray-${c.name}-1008.fold`),'fold').doc,m=inspectMaterialTopology(restored);assert.ok(m.ok,m.ok?'':m.reason);assert.deepEqual(m.graph,actual.graph);assert.deepEqual(m.foldedVertices,actual.foldedVertices);
 if(c.intent.cpOnly){assert.equal(actual.foldedVertices,undefined);assert.equal(expected.placement,'unavailable');}else{assert.equal(computeFlatFold(doc).layers.status,'solved');assert.equal(computeFlatFold(restored).layers.status,'solved');}
 const dxf=read(`output/playwright/material-ray-${c.name}-1008.dxf`);assert.equal(dxf,exportDXF(doc).text);const tokens=dxf.trim().split(/\r?\n/),entities:Map<number,string>[]=[];let entity:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){if(entity)entities.push(entity);entity=value==='LINE'?new Map():null;}else if(entity)entity.set(code,value);}
 assert.equal(entities.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=entities[i];assert.equal(e.get(8),DXF_LAYERS[s.assignment].name);for(const [code,value] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]] as const)assert.ok(Number(e.get(code))===value);});
 reports.push({name:c.name,materialLength:expected.ray!.materialLength,blankLength:expected.ray!.blankLength,vertices:actual.graph.vertices_coords.length,edges:actual.graph.edges_vertices.length,faces:actual.graph.faces_vertices!.length,components:actual.components.length,dxfLines:entities.length,cpOnly:c.intent.cpOnly,placement:expected.placement});
}
const grid=load('output/playwright/material-ray-grid-source-1008.zhezhi.json'),old=inspectMaterialTopology(grid);assert.ok(old.ok);for(const name of ['cancel','undo']){const doc=load(`output/playwright/material-ray-${name}-1008.zhezhi.json`),m=inspectMaterialTopology(doc);assert.ok(m.ok);assert.deepEqual(m.graph,old.graph);assert.deepEqual(m.foldedVertices,old.foldedVertices);}
const partial=inspectMaterialTopology(load('output/playwright/material-ray-partial-1008.zhezhi.json')),redo=inspectMaterialTopology(load('output/playwright/material-ray-redo-1008.zhezhi.json'));assert.ok(partial.ok&&redo.ok);assert.deepEqual(redo.graph,partial.graph);assert.deepEqual(redo.foldedVertices,partial.foldedVertices);
fs.writeFileSync('output/audits/material-ray-download-1008.json',JSON.stringify({verified:true,exactNativeAndFOLDGeometry:true,exactFoldedPositions:true,ordinaryDXFLinesMillimetersExact:true,cancelUndoRedoExact:true,explicitCPOnlyWithoutOldFF:true,cases:reports},null,2));console.log('Verified four actual ray outputs, material identities/poses, cancel/undo/redo, JSON/FOLD and ordinary LINE DXF endpoints.');
