import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {prepareTessResult,hasWovenInternalBoundary,type TessResponse,type TessParams} from '../src/app/tessellation';
import {wovenMaterialDocument} from '../src/app/wovenMaterialDocument';
import {buildFold} from '../src/core/geometry';
import {computeFlatFold} from '../src/core/flatFold';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
import {inspectMaterialTopology} from '../src/core/materialTopology';
const read=(name:string,ext:string)=>fs.readFileSync(`output/playwright/woven-visual-${name}-1008.${ext}`,'utf8'),saved=JSON.parse(fs.readFileSync('output/audits/woven-visual-replay-1008.json','utf8')) as Record<string,{params:TessParams;response:TessResponse}>;
const cases:Record<string,unknown>={};
for(const name of ['manual','native']){
 const packet=JSON.parse(read(`${name}-mother`,'json')),doc=importDocument(read(name,'zhezhi.json'),'json').doc,fold=importDocument(read(name,'fold'),'fold').doc,{params,response}=saved[name];
 assert.equal(params.family,'woven-lines');assert.equal(params.mode,'graph');if(params.family!=='woven-lines'||params.mode!=='graph')throw Error('Wrong recipe');
 assert.deepEqual(params.graph,packet.graph);assert.deepEqual(params.graphSource,packet.graphSource);assert.equal(params.fullEdgeInsets,undefined);assert.equal(params.periodicity,undefined);assert.equal(params.periodicityEnabled,undefined);assert.equal(params.stationaryFace,0);
 if(name==='manual'){assert.equal(params.graph.vertices[0][0],.002345678901234567);assert.equal(params.graph.vertices[0][1],.0011234567890123456);}else{assert.equal(params.graph.vertices.length,5);assert.equal(params.graph.edges.length,8);assert.deepEqual(params.graphSource!.inputGraph,{vertices:[[-1,-1],[1,-1],[1,1],[-1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[0,2],[1,3]]});}
 const result=prepareTessResult(response,params),expected=hasWovenInternalBoundary(result)?wovenMaterialDocument(result,params):result.doc;
 assert.deepEqual(doc.segments.map(({a,b,assignment,angle})=>({a,b,assignment,angle})),expected.segments.map(({a,b,assignment,angle})=>({a,b,assignment,angle})));
 const nativeGraph=buildFold(doc).graph,foldGraph=buildFold(fold).graph,raw=JSON.parse(read(name,'fold'));assert.deepEqual(raw.vertices_coords,nativeGraph.vertices_coords);assert.deepEqual(raw.edges_vertices,nativeGraph.edges_vertices);assert.deepEqual(foldGraph.edges_vertices,nativeGraph.edges_vertices);assert.equal(foldGraph.vertices_coords.length,nativeGraph.vertices_coords.length);
 const roundoff=Math.max(...foldGraph.vertices_coords.map((p,i)=>Math.hypot(p[0]-nativeGraph.vertices_coords[i][0],p[1]-nativeGraph.vertices_coords[i][1])));if(name==='manual')assert.equal(roundoff,0);else assert.ok(roundoff<1e-10,'Ordinary FOLD rebuild roundoff is bounded; actual exported coordinates above remain exact');
 if(name==='manual'){const m=inspectMaterialTopology(doc),fm=inspectMaterialTopology(fold);assert.ok(m.ok&&fm.ok);assert.equal(m.components.length,2);assert.deepEqual(fm.foldedVertices,m.foldedVertices);}
 assert.equal(computeFlatFold(doc).layers.status,'solved');assert.equal(computeFlatFold(fold).layers.status,'solved');
 const dxf=read(name,'dxf');assert.equal(dxf,exportDXF(doc).text);const tokens=dxf.trim().split(/\r?\n/),entities:Map<number,string>[]=[];let entity:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){if(entity)entities.push(entity);entity=value==='LINE'?new Map():null;}else if(entity)entity.set(code,value);}
 assert.equal(entities.length,doc.segments.length);doc.segments.forEach((s,i)=>{const e=entities[i];assert.equal(e.get(8),DXF_LAYERS[s.assignment].name);for(const [code,value] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]] as const)assert.ok(Number(e.get(code))===value);});
 cases[name]={motherVertices:params.graph.vertices.length,motherEdges:params.graph.edges.length,CPVertices:nativeGraph.vertices_coords.length,CPEdges:nativeGraph.edges_vertices.length,CPFaces:nativeGraph.faces_vertices!.length,dxfLines:entities.length,ordinaryFOLDRebuildRoundoff:roundoff};
}
fs.writeFileSync('output/audits/woven-visual-download-1008.json',JSON.stringify({verified:true,actualPublicReplayMatches:true,preciseMotherCoordinatesPreserved:true,noStaleGeometryBindings:true,nativeLineInputAndDerivedMotherSeparate:true,actualNativeFOLDReopenAndLayerSolved:true,ordinaryR12LinesMillimetersExact:true,cases},null,2));
console.log('Verified real visual editing outputs: public replay, exact point precision, source bindings, native/FOLD geometry and layers, and ordinary R12 LINE millimeters.');
