import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {exportDXF} from '../src/core/dxf';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {prepareSimulationDocument} from '../src/engine/simmodel';
import {OrigamiModel} from '../vendor/simulator/oristudio/packages/origami-simulator/src/model';
const read=(name:string,ext:string)=>fs.readFileSync(`output/playwright/material-weak-sim-${name}-1009.${ext}`,'utf8');
const rounded=(v:number)=>Number(v.toFixed(7));
const cases:Record<string,unknown>={};
function mesh(name:string){
 const f=JSON.parse(read(name,'fold')),obj=read(name,'obj'),stl=read(name,'stl');
 const vertices=obj.split(/\r?\n/).filter(r=>r.startsWith('v ')).map(r=>r.slice(2).split(' ').map(Number));
 assert.equal(vertices.length,f.vertices_coords.length);vertices.forEach((p,i)=>p.forEach((x,k)=>assert.ok(Math.abs(x-f.vertices_coords[i][k])<=1e-7)));
 const faces=obj.split(/\r?\n/).filter(r=>r.startsWith('f ')).map(r=>r.slice(2).split(' ').map(v=>Number(v.split('//')[0])-1));assert.deepEqual(faces,f.faces_vertices);
 const stlVertices=[...stl.matchAll(/vertex ([^\r\n]+)/g)].map(m=>m[1].split(' ').map(Number));assert.deepEqual(stlVertices,faces.flatMap(r=>r.map((v:number)=>vertices[v])));assert.equal((stl.match(/facet normal/g)??[]).length,faces.length);
}
for(const name of ['interior','boundary','cross','hole','free-F','free-M','original-F','hinge-F']){
 const initial=importDocument(read(`${name}-initial`,'zhezhi.json'),'json').doc,after=importDocument(read(`${name}-after`,'zhezhi.json'),'json').doc;
 assert.deepEqual(after,initial);assert.equal(exportDXF(after).text,exportDXF(initial).text);
 const material=inspectMaterialTopology(initial);assert.ok(material.ok,material.ok?'':material.reason);const g=material.graph,{prepared}=prepareSimulationDocument(g),model=new OrigamiModel(prepared),flat=JSON.parse(read(`${name}-reset`,'fold'));
 assert.equal(flat.vertices_coords.length,g.vertices_coords.length);assert.deepEqual(flat.edges_vertices.slice(0,g.edges_vertices.length),g.edges_vertices);assert.deepEqual(flat.edges_assignment.slice(0,g.edges_vertices.length),g.edges_assignment);
 assert.deepEqual(flat.faces_edges,prepared.facesEdges);assert.deepEqual(flat.edges_faces,prepared.edgesFaces);assert.deepEqual(flat.faces_vertices,prepared.facesVertices);
 assert.equal(flat.edges_foldAngle,undefined);assert.equal(flat.faceOrders,undefined);assert.equal(flat.faces_holes,undefined);
 assert.deepEqual(flat.vertices_coords,Array.from({length:prepared.vertexCount},(_,v)=>[rounded(model.originalPositions[3*v]),rounded(-model.originalPositions[3*v+2]),rounded(model.originalPositions[3*v+1])]));
 flat.edges_faces.forEach((fs:number[],e:number)=>assert.equal(fs.length,flat.edges_assignment[e]==='B'?1:2));
 const back=prepareSimulationDocument(flat).prepared;assert.deepEqual(back.edgesVertices,prepared.edgesVertices);assert.deepEqual(back.facesEdges,prepared.facesEdges);assert.deepEqual(back.edgesFaces,prepared.edgesFaces);mesh(`${name}-reset`);
 if(name==='hinge-F'||name==='free-M'){
  for(const backend of ['gpu','cpu']){const moved=JSON.parse(read(`${name}-${backend}`,'fold'));assert.deepEqual(moved.edges_vertices,flat.edges_vertices);assert.deepEqual(moved.faces_edges,flat.faces_edges);assert.deepEqual(moved.edges_faces,flat.edges_faces);assert.ok(moved.vertices_coords.every((p:number[])=>p.length===3&&p.every(Number.isFinite)));if(name==='hinge-F')assert.ok(moved.vertices_coords.some((p:number[])=>Math.abs(p[2])>.001));}
  mesh(`${name}-cpu`);const reset=JSON.parse(read(`${name}-cpu-reset`,'fold'));assert.deepEqual(reset.vertices_coords,flat.vertices_coords);
 }
 cases[name]={sourceVertices:g.vertices_coords.length,sourceEdges:g.edges_vertices.length,triangles:prepared.faceCount,originalCPUnchanged:true,ordinaryDXFUnchanged:true,actualFOLDReparsed:true,OBJSTLGeometryMatches:true,allSourceBanksRetained:true};
}
fs.writeFileSync('output/audits/material-weak-sim-download-1009.json',JSON.stringify({verified:true,cases,actualGPUCPUDrivers:2,notVerified:['Physical collision-free folding','Desktop portable/native bridge','Third-party mesh import','Machine processing']},null,2));console.log('Verified eight actual CP returns, reset FOLD banks/positions/reopen, OBJ/STL and two GPU/CPU moving cases.');
