import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareTessResult,type TessResponse,type TessParams} from '../src/app/tessellation';
import {wovenMaterialDocument} from '../src/app/wovenMaterialDocument';
import {importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
import type {Assignment,Doc} from '../src/core/types';
const read=(name:string,ext:string)=>fs.readFileSync(`output/playwright/woven-independent-${name}-1008.${ext}`,'utf8');
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const saved=JSON.parse(fs.readFileSync('tests/fixtures/woven-independent-1008.json','utf8')) as {cases:{name:string;params:TessParams;response:TessResponse}[]};
const cases:Record<string,unknown>={};
for(const c of saved.cases){
 const expected=material(wovenMaterialDocument(prepareTessResult(c.response,c.params),c.params));
 const native=importDocument(read(c.name,'zhezhi.json'),'json').doc,m=material(native),fold=importDocument(read(c.name,'fold'),'fold').doc,fm=material(fold);
 assert.deepEqual(m.graph,expected.graph);assert.deepEqual(m.foldedVertices,expected.foldedVertices);assert.equal(m.startingFace,expected.startingFace);
 assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);assert.equal(fm.startingFace,m.startingFace);
 assert.deepEqual((native.metadata!.tessellation as {parameters:unknown}).parameters,c.params);
 assert.equal(computeFlatFold(native).layers.status,'solved');assert.equal(computeFlatFold(fold).layers.status,'solved');
 const dxf=read(c.name,'dxf');assert.equal(dxf,exportDXF(native).text);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('LWPOLYLINE'));
 const tokens=dxf.trim().split(/\r?\n/),entities:Map<number,string>[]=[];let current:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){if(current)entities.push(current);current=value==='LINE'?new Map():null;}else if(current)current.set(code,value);}
 assert.equal(entities.length,native.segments.length);
 native.segments.forEach((s,i)=>{const e=entities[i];assert.equal(e.get(8),DXF_LAYERS[s.assignment as Assignment].name);for(const [code,value] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]] as const)assert.ok(Number(e.get(code))===value);});
 const owner=new Map<number,number>();m.components.forEach((comp,i)=>comp.vertices.forEach(v=>owner.set(v,i)));for(const [a,b] of m.graph.edges_vertices)assert.equal(owner.get(a),owner.get(b));
 cases[c.name]={vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,materials:m.components.length,dxfLines:entities.length,startingFace:m.startingFace};
}
fs.writeFileSync('output/audits/woven-independent-download-1008.json',JSON.stringify({verified:true,sixPublicResponsesAndActualFiles:true,originalIndicesAndFFExact:true,sourceParametersExact:true,nativeFOLDReopenAndLayerSolved:true,noInterComponentCreases:true,ordinaryR12LinesMillimetersExact:true,cases},null,2));
console.log('Verified six actual adopted JSON/FOLD/DXF groups: original indexed CP/FF, roots, source parameters, independent materials, layer solving and exact ordinary R12 LINE millimeters.');
