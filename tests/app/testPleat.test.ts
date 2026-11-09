import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readTestPleatQuery,readTestPleatResult,type TestPleatQuery,type TestPleatResult} from '../../src/app/testPleat';
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/test-pleat-source-20261010.json',import.meta.url),'utf8')).cases as {name:string;query:TestPleatQuery;response:TestPleatResult}[];
test('all nine genuine original data results independently preserve four primitives and original endpoints',()=>{
 for(const c of cases){assert.deepEqual(readTestPleatQuery(c.query),c.query);assert.deepEqual(readTestPleatResult(c.response,c.query),c.response);const g=c.response.data.graphics;assert.equal(g.length,4);assert.equal(g[0].points.length,4);assert.deepEqual(g[0].points.slice(2),[c.query.points[1],c.query.points[0]]);assert.deepEqual(g[1].points,c.query.points);assert.deepEqual(g.map(p=>p.style),[{Opacity:.1},'Black','Red','Blue']);assert.equal(c.response.source.paperCertification,false);}
});
test('right-angle literal output retains source Polygon corner order, not a canonical graph',()=>{
 const r=cases.find(c=>c.name==='horizontal-90')!.response;for(const [p,expect] of r.data.graphics[0].points.map((p,i)=>[p,[[0,1.8],[1,1.8],[1,0],[0,0]][i]])){for(let i=0;i<2;i++)assert.ok(Math.abs(p[i]-expect[i])<1e-12);}
});
test('deleted corners, original lines, changed point order, colors, opacity and source are rejected',()=>{
 const c=cases[1];for(const mutate of [(r:any)=>r.data.graphics.pop(),(r:any)=>r.data.graphics[0].points.pop(),(r:any)=>r.data.graphics[1].points.reverse(),(r:any)=>r.data.graphics[2].points[1][0]+=.001,(r:any)=>r.data.graphics[2].style='Blue',(r:any)=>r.data.graphics[0].style.Opacity=.2,(r:any)=>r.source.definitionCell='In[1]']){const forged=structuredClone(c.response);mutate(forged);assert.throws(()=>readTestPleatResult(forged,c.query));}
});
test('public original graphic domain accepts degenerate polygons and tiny edges but rejects zero normalization',()=>{
 for(const c of cases.filter(c=>['horizontal-0','horizontal-180','tiny','large-angle'].includes(c.name)))assert.ok(readTestPleatQuery(c.query));
 const q=cases[0].query;for(const bad of [{...q,points:[[0,0],[0,0]]},{...q,points:null},{...q,angleDeg:null},{...q,angleDeg:36001},{...q,paper:{}},{...q,opts:{}}])assert.equal(readTestPleatQuery(bad),null);
});
test('complete raw JSON export roundtrips all four graphic styles and source values',()=>{
 for(const c of cases){const text=JSON.stringify(c.response,null,2),r=readTestPleatResult(JSON.parse(text),c.query);assert.equal(JSON.stringify(r),JSON.stringify(c.response));assert.ok(!Object.hasOwn(r,'fold'));}
});
