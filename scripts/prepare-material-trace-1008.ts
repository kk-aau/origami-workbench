import fs from 'node:fs';
import assert from 'node:assert/strict';
import {materialSlitFixture,materialCutFixture,materialDoc} from '../tests/fixtures/materialModel';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {joinMaterialEdges} from '../src/core/materialJoin';
import {editMaterialFaces,type MaterialFaceTraceIntent} from '../src/core/materialFaceEdit';
import {computeFlatFold} from '../src/core/flatFold';
import {exportDocument} from '../src/core/formats';
const material=(doc:Parameters<typeof inspectMaterialTopology>[0])=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok);return m;};
const {source,banks}=materialSlitFixture(),base=material(source),grid=joinMaterialEdges(source,{kind:'material-join',pairs:[{first:base.edgeSegmentIds[banks[0]],second:base.edgeSegmentIds[banks[1]],assignment:'F'}]}).doc;grid.name='跨面九格验收';
const m=material(grid),faces=m.graph.faces_vertices!.filter((_,f)=>f!==4),fe=m.graph.faces_edges!.filter((_,f)=>f!==4),owners=m.graph.edges_vertices.map(()=>[] as number[]);fe.forEach((row,f)=>row.forEach(e=>owners[e].push(f)));
const graph={...m.graph,faces_vertices:faces,faces_edges:fe,edges_faces:owners,edges_assignment:owners.map(row=>row.length===1?'B':'F'),edges_foldAngle:owners.map(()=>0),faces_faces:fe.map((row,f)=>row.map(e=>owners[e].find(other=>other!==f)??null)) as unknown as number[][]},hole=materialDoc(graph,graph.vertices_coords);hole.name='跨面孔洞验收';
const original=materialCutFixture().source;original.name='跨面原版验收';const om=material(original),boundaries=om.edgeSegmentIds.filter((_,e)=>om.graph.edges_assignment[e]==='B');let originalRequest:MaterialFaceTraceIntent|undefined;
outer:for(let a=0;a<boundaries.length;a++)for(let b=a+1;b<boundaries.length;b++){
 const request:MaterialFaceTraceIntent={kind:'material-face-trace',component:'all',from:{edgeId:boundaries[a],fraction:.5},to:{edgeId:boundaries[b],fraction:.5},assignment:'F',fixedSide:'left'};
 try{const r=editMaterialFaces(original,request);if(r.trace!.faces>=2&&computeFlatFold(r.doc).layers.status==='solved'){originalRequest=request;break outer;}}catch{}
}
assert.ok(originalRequest,'actual original material must exercise multiple faces');
const pick=(doc:typeof grid,x:number,y:number)=>{const m=material(doc),e=m.graph.edges_vertices.findIndex(([a,b])=>m.graph.vertices_coords[a][0]===x&&m.graph.vertices_coords[b][0]===x&&Math.min(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])<=y&&Math.max(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])>=y),[a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]);return {edgeId:m.edgeSegmentIds[e],fraction:(y-a[1])/(b[1]-a[1])};};
const requests={grid:{kind:'material-face-trace',component:0,from:pick(grid,0,50),to:pick(grid,300,50),assignment:'M',fixedSide:'left'},hole:{kind:'material-face-trace',component:0,from:pick(hole,0,150),to:pick(hole,300,150),assignment:'M',fixedSide:'left'},original:originalRequest};
for(const [name,doc]of Object.entries({grid,hole,original}))fs.writeFileSync(`output/playwright/material-trace-${name}-source-1008.zhezhi.json`,exportDocument(doc,'json').text);
fs.writeFileSync('output/audits/material-trace-requests-1008.json',JSON.stringify(requests,null,2));console.log(JSON.stringify({requests,originalFaces:editMaterialFaces(original,originalRequest).trace!.faces}));
