import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareTessResult,type TessParams} from '../src/app/tessellation';
import {readWovenGraphPackage} from '../src/app/wovenGraphInspection';
import {recomputeWovenGraphSource,wovenGraphSourceMatches} from '../src/app/wovenGraphSource';
import {wovenMaterialDocument} from '../src/app/wovenMaterialDocument';
import {importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
import type {Assignment,Doc} from '../src/core/types';
const read=(name:string,ext:string)=>fs.readFileSync(`output/playwright/woven-source-regions-${name}-1008.${ext}`,'utf8');
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const cases:Record<string,unknown>={};
for(const name of ['one-ring','two-rings','cell-and-ring-hole','nested-pair']){
 const response=JSON.parse(read(name+'-source','json')),params=response.params as TessParams;assert.equal(params.family,'woven-lines');if(params.family!=='woven-lines'||params.mode!=='graph')throw Error('Wrong source');
 const source=params.graphSource!;assert.ok(source.kind==='origamica-intersectify-native'&&source.motherSelection);assert.ok(wovenGraphSourceMatches(source,params.graph));
 const replay=recomputeWovenGraphSource(source);assert.deepEqual(replay.graph.edges,params.graph.edges);assert.deepEqual(replay.originalEdgeForSegment,response.source.originalEdgeForSegment);assert.deepEqual(source.motherSelection.geometry.vertices,params.graph.vertices);assert.deepEqual(source.motherSelection.geometry.edges,params.graph.edges);
 const pack=readWovenGraphPackage(JSON.parse(read(name+'-mother','json')))!;assert.ok(pack);assert.deepEqual(pack.graph,params.graph);assert.deepEqual(pack.graphSource,source);
 const expected=material(wovenMaterialDocument(prepareTessResult(response,params),params)),native=importDocument(read(name,'zhezhi.json'),'json').doc,m=material(native),fold=importDocument(read(name,'fold'),'fold').doc,fm=material(fold);
 assert.deepEqual(m.graph,expected.graph);assert.deepEqual(m.foldedVertices,expected.foldedVertices);assert.equal(m.startingFace,expected.startingFace);assert.deepEqual(fm.graph,m.graph);assert.deepEqual(fm.foldedVertices,m.foldedVertices);assert.equal(fm.startingFace,m.startingFace);
 assert.equal(m.components.length,name==='cell-and-ring-hole'?8:name==='nested-pair'?2:1);assert.deepEqual((native.metadata!.tessellation as {parameters:unknown}).parameters,params);assert.equal(computeFlatFold(native).layers.status,'solved');assert.equal(computeFlatFold(fold).layers.status,'solved');
 const dxf=read(name,'dxf');assert.equal(dxf,exportDXF(native).text);assert.ok(dxf.includes('AC1009'));assert.ok(!dxf.includes('LWPOLYLINE'));
 const tokens=dxf.trim().split(/\r?\n/),entities:Map<number,string>[]=[];let current:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){if(current)entities.push(current);current=value==='LINE'?new Map():null;}else if(current)current.set(code,value);}
 assert.equal(entities.length,native.segments.length);native.segments.forEach((s,i)=>{const e=entities[i];assert.equal(e.get(8),DXF_LAYERS[s.assignment as Assignment].name);for(const [code,value] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]] as const)assert.ok(Number(e.get(code))===value);});
 cases[name]={vertices:m.graph.vertices_coords.length,edges:m.graph.edges_vertices.length,faces:m.graph.faces_vertices!.length,materials:m.components.length,rings:m.graph.faces_holes?.flat().length??0,dxfLines:entities.length};
}
fs.writeFileSync('output/audits/woven-source-regions-download-1008.json',JSON.stringify({verified:true,sourceGeometryAndRegionsReplayed:true,actualMotherPackages:true,nativeAndFOLDExactCPFFAndRoot:true,reopenedLayersSolved:true,ordinaryR12LineMillimetersAndCountsExact:true,cases},null,2));
console.log('Verified four real native-source region groups: replayed geometry/roles, adopted JSON/FOLD CP/FF, solved layers, ordinary R12 LINE coordinates/units/counts.');
