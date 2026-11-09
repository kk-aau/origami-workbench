import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readVertexFigureQuery,readVertexFigureResult,type VertexFigureQuery,type VertexFigureResult} from '../../src/app/vertexFigure';
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/vertex-figure-source-20261010.json',import.meta.url),'utf8')).cases as {name:string;query:VertexFigureQuery;response:VertexFigureResult}[];
test('all 12 source catalog types and five edge cases independently read every line and origin',()=>{
 for(const c of cases){assert.deepEqual(readVertexFigureQuery(c.query),c.query);assert.deepEqual(readVertexFigureResult(c.response,c.query),c.response);assert.equal(c.response.data.graphics[0].reduce((n,g)=>n+g[0].length,0),c.query.vertexType.reduce((a,b)=>a+b,0));assert.equal(c.response.source.paperCertification,false);}
});
test('source square figure uses cumulative division angle and unfilled original lines',()=>{
 const r=cases.find(c=>c.name==='square-cycle')!.response;assert.deepEqual(r.source.rotationsRad,[0,Math.PI/2,Math.PI,3*Math.PI/2]);assert.equal(r.source.renderTileDefaults.TilePolys,false);assert.equal(r.data.graphics[0][0][0][0].primitive,'Line');assert.deepEqual(r.data.graphics[1],{primitive:'Point',point:[0,0],style:{AbsolutePointSize:5}});
});
test('deleted original edges, empty groups, swapped groups, forged source and point sizes are rejected',()=>{
 const c=cases[7];for(const mutate of [(r:VertexFigureResult)=>r.data.graphics[0][0][0].pop(),(r:VertexFigureResult)=>r.data.graphics[0].pop(),(r:VertexFigureResult)=>{[r.data.graphics[0][0],r.data.graphics[0][1]]=[r.data.graphics[0][1],r.data.graphics[0][0]];},(r:VertexFigureResult)=>r.data.graphics[0][0][0][0].points[1][0]+=.001,(r:any)=>r.source.definitionCell='In[1]',(r:any)=>r.data.graphics[1].style.AbsolutePointSize=6,(r:any)=>r.source.rotationsRad[1]+=.01]){const forged=structuredClone(c.response);mutate(forged);assert.throws(()=>readVertexFigureResult(forged,c.query));}
});
test('literal numeric public domain preserves empty/open/overlapping configurations but rejects foreign options',()=>{
 for(const vertexType of [[],[3],[3,5,24],Array(16).fill(12)])assert.ok(readVertexFigureQuery({family:'archimedean-vertex-figure-native',vertexType}));
 for(const vertexType of [null,[true],[2],[25],Array(17).fill(3),'3,4,6,4'])assert.equal(readVertexFigureQuery({family:'archimedean-vertex-figure-native',vertexType}),null);
 assert.equal(readVertexFigureQuery({family:'archimedean-vertex-figure-native',vertexType:[4,4,4,4],paper:{}}),null);
});
test('complete helper JSON export and re-read preserve the actual original graphic nesting',()=>{
 for(const c of cases){const text=JSON.stringify(c.response,null,2),back=readVertexFigureResult(JSON.parse(text),c.query);assert.equal(JSON.stringify(back),JSON.stringify(c.response));assert.ok(!Object.hasOwn(back,'fold'));assert.equal(back.data.graphics[0].length,c.query.vertexType.length);}
});
