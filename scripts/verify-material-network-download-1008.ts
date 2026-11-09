import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {editMaterialFaces,type MaterialFaceNetworkIntent} from '../src/core/materialFaceEdit';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
const read=(file:string)=>fs.readFileSync(file,'utf8'),load=(file:string)=>importDocument(read(file),'json').doc;
const cases=JSON.parse(read('output/playwright/material-network-cases-1008.json')) as {name:string;source:string;intent:MaterialFaceNetworkIntent}[],reports=[];
for(const c of cases){
 const source=load(`output/playwright/material-network-${c.source}-source-1008.zhezhi.json`),expected=editMaterialFaces(source,c.intent),doc=load(`output/playwright/material-network-${c.name}-1008.zhezhi.json`),want=inspectMaterialTopology(expected.doc),actual=inspectMaterialTopology(doc);assert.ok(want.ok,want.ok?'':want.reason);assert.ok(actual.ok,actual.ok?'':actual.reason);assert.deepEqual(actual.graph,want.graph);assert.deepEqual(actual.foldedVertices,want.foldedVertices);
 const restored=importDocument(read(`output/playwright/material-network-${c.name}-1008.fold`),'fold').doc,m=inspectMaterialTopology(restored);assert.ok(m.ok,m.ok?'':m.reason);assert.deepEqual(m.graph,actual.graph);assert.deepEqual(m.foldedVertices,actual.foldedVertices);
 if(c.intent.cpOnly){assert.equal(actual.foldedVertices,undefined);assert.equal(expected.placement,'unavailable');}else{assert.equal(computeFlatFold(doc).layers.status,'solved');assert.equal(computeFlatFold(restored).layers.status,'solved');}
 const text=read(`output/playwright/material-network-${c.name}-1008.dxf`);assert.equal(text,exportDXF(doc).text);const lines=text.trim().split(/\r?\n/),entities:Map<number,string>[]=[];let entity:Map<number,string>|null=null;
 for(let i=0;i<lines.length;i+=2){const code=Number(lines[i]),value=lines[i+1];if(code===0){if(entity)entities.push(entity);entity=value==='LINE'?new Map():null;}else if(entity)entity.set(code,value);}
 assert.equal(entities.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=entities[i];assert.equal(e.get(8),DXF_LAYERS[s.assignment].name);for(const [code,value] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]] as const)assert.ok(Number(e.get(code))===value);});reports.push({name:c.name,...expected.network,faces:actual.graph.faces_vertices!.length,paperLoops:actual.components.map(c=>c.boundaryLoops.length),dxfLines:entities.length,placement:expected.placement});
}
const source=inspectMaterialTopology(load('output/playwright/material-network-sheet-source-1008.zhezhi.json'));assert.ok(source.ok);for(const name of ['cancel','undo']){const m=inspectMaterialTopology(load(`output/playwright/material-network-${name}-1008.zhezhi.json`));assert.ok(m.ok);assert.deepEqual(m.graph,source.graph);assert.deepEqual(m.foldedVertices,source.foldedVertices);}
const a=inspectMaterialTopology(load('output/playwright/material-network-rectangle-1008.zhezhi.json')),b=inspectMaterialTopology(load('output/playwright/material-network-redo-1008.zhezhi.json'));assert.ok(a.ok&&b.ok);assert.deepEqual(a.graph,b.graph);assert.deepEqual(a.foldedVertices,b.foldedVertices);
fs.writeFileSync('output/audits/material-network-download-1008.json',JSON.stringify({verified:true,actualBrowserFiles:true,independentIntentReplay:true,nativeAndFOLDExact:true,ordinaryDXFLineCoordinatesAndCountsExact:true,cancelUndoRedoExact:true,cases:reports},null,2));console.log('Four browser-produced outputs verified against independent replay, FOLD, exact ordinary LINE DXF, hole boundaries, folded layers and history.');
