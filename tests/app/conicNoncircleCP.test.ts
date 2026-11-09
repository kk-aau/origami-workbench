import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {conicNoncircleCPDocument,conicNoncircleCPSourceMatches,readConicNoncircleRecipe,validateConicNoncircleRecipe,fetchConicNoncircleCP,CONIC_NONCIRCLE_PRESETS} from '../../src/app/conicNoncircleCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';import {exportDocument,importDocument} from '../../src/core/formats';import {exportDXF} from '../../src/core/dxf';
const rows=JSON.parse(fs.readFileSync(new URL('../fixtures/conic-noncircle-cp-20261011.json',import.meta.url),'utf8')).cases;
test('original/edited finite ellipse parabola hyperbola use all real native chain points as honest mm material',()=>{
 for(const row of rows){const doc=conicNoncircleCPDocument(row.recipe,row.proofs),n=row.recipe.divisions+1,material=inspectMaterialTopology(doc),system=row.proofs.nativeSystem.sample.rules;
  assert.equal(material.ok,true,row.name);assert.equal(conicNoncircleCPSourceMatches(doc),true,row.name);
  assert.deepEqual(material.graph.vertices_coords,[...system[0].values,...system[4].values,...system[8].values]);
  assert.deepEqual([material.graph.vertices_coords.length,material.graph.edges_vertices.length,material.graph.faces_vertices!.length],[3*n,5*n-3,2*n-2]);
  assert.equal(doc.segments.filter(s=>s.assignment==='B').length,2*n+2);assert.equal(doc.segments.filter(s=>s.assignment==='U').length,3*n-5);
  assert.equal(doc.segments.some(s=>s.assignment==='M'||s.assignment==='V'),false);assert.equal('foldedVertices' in (doc.metadata!.materialTopology as object),false);assert.equal(doc.flatFold,undefined);
  const m=doc.metadata!.originalConicNoncircleCP as any;assert.equal(m.evidence.flatFold,false);assert.equal(m.source.rightDirectorReversed,false);assert.equal(m.source.rawRulingsNormalized,false);
  assert.deepEqual(m.sampling.parameters,row.proofs.nativeUniform.sample.parameters);assert.deepEqual(readConicNoncircleRecipe(doc),row.recipe);
 }
});
test('signed coefficient margins and real poles reject instead of clipping or changing director',()=>{
 for(const mutate of [(r:any)=>r.leftCross=-.4,(r:any)=>r.rightCross=.25,(r:any)=>r.parameterEnd=2,(r:any)=>r.divisions=16,(r:any)=>r.rightFocus=0,(r:any)=>r.leftFocus=false,(r:any)=>r.parameterStart=null]){
  const r=structuredClone(CONIC_NONCIRCLE_PRESETS[0]);mutate(r);assert.throws(()=>validateConicNoncircleRecipe(r));
 }
 const h=structuredClone(CONIC_NONCIRCLE_PRESETS[2]);h.parameterEnd=1.4;assert.throws(()=>validateConicNoncircleRecipe(h));
 const p=structuredClone(CONIC_NONCIRCLE_PRESETS[1]);p.leftCross=-.25;assert.throws(()=>validateConicNoncircleRecipe(p));
});
test('maximum direction residual cannot be negative even below generic roundoff tolerance',()=>{
 for(const row of rows)for(const value of [-1e-13,-Number.MIN_VALUE,-1e-3,NaN,Infinity,null,false,'0']){
  const doc=conicNoncircleCPDocument(row.recipe,row.proofs),proofs=structuredClone(row.proofs);
  proofs.nativeUniform.sample.maximumDirectionResidual=value;
  assert.throws(()=>conicNoncircleCPDocument(row.recipe,proofs),row.name+'/'+String(value));
  (doc.metadata!.originalConicNoncircleCP as any).proofs=proofs;
  assert.equal(conicNoncircleCPSourceMatches(doc),false,row.name+'/'+String(value));
 }
});
test('native CP error and threshold metadata keep their actual nonnegative/positive domains',()=>{
 for(const row of rows)for(const [group,field,positive] of [['local','maxKawasakiErrorDeg',false],['local','toleranceDeg',true],['geometry','tolerance',true]] as const){
  const original=row.proofs.nativeCP.stats.checks[group][field];assert.ok(Number.isFinite(original)&&(positive?original>0:original>=0),row.name+'/'+field);
  for(const value of [-Number.MIN_VALUE,-1e-13,NaN,Infinity,null,false,'0',...(positive?[0]:[])]){
   const doc=conicNoncircleCPDocument(row.recipe,row.proofs),proofs=structuredClone(row.proofs);proofs.nativeCP.stats.checks[group][field]=value;
   assert.throws(()=>conicNoncircleCPDocument(row.recipe,proofs),row.name+'/'+field+'/'+String(value));
   (doc.metadata!.originalConicNoncircleCP as any).proofs=proofs;assert.equal(conicNoncircleCPSourceMatches(doc),false,row.name+'/'+field+'/'+String(value));
  }
 }
});
test('actual source proof current params/multiplier/source sampled indexes cannot certify changed CP',()=>{
 const row=rows[0],doc=conicNoncircleCPDocument(row.recipe,row.proofs);
 for(const mutate of [(d:any)=>d.segments[0].a[0]+=.001,(d:any)=>d.segments[0].a.push(0),(d:any)=>d.segments[0].id='changed',
  (d:any)=>d.segments[0].assignment='M',(d:any)=>d.paper.width=String(d.paper.width),(d:any)=>d.paper.height=NaN,
  (d:any)=>d.metadata.materialTopology.graph.faces_vertices[0][0]+=1e-12,(d:any)=>d.metadata.originalConicNoncircleCP.recipe.leftCross+=.01,
  (d:any)=>d.metadata.originalConicNoncircleCP.proofs.nativeSystem.sample.rules[4].values[1][0]+=.001,
  (d:any)=>d.metadata.originalConicNoncircleCP.proofs.nativeUniform.sample.parameters[1]+=.001,
  (d:any)=>d.metadata.originalConicNoncircleCP.proofs.nativeCP.source.nativeDiscretization.sample.multipliers[0]+=.01,
  (d:any)=>d.metadata.originalConicNoncircleCP.proofs.nativeCP.fold.faces_vertices[0][0]+=1e-12,
  (d:any)=>d.metadata.originalConicNoncircleCP.proofs.nativeCP.fold.frame_attributes=['3D'],
  (d:any)=>d.metadata.originalConicNoncircleCP.proofs.nativeCP.fold.frame_unit='cm',
  (d:any)=>d.flatFold={startingFace:[[0,0],[1,0],[0,1]]},(d:any)=>d.metadata.originalConicNoncircleCP.evidence.flatFold=true]){
  const bad=structuredClone(doc);mutate(bad);assert.equal(conicNoncircleCPSourceMatches(bad),false);
 }
 const named=structuredClone(doc);named.name='我的编辑工程';named.metadata!.note='用户注记';assert.equal(conicNoncircleCPSourceMatches(named),true);
});
test('construction uses four existing API stages with actual fixture queries; it never substitutes display samples',async()=>{
 const row=rows[0],actualFetch=globalThis.fetch,expected=[['tessellation/curved-conic-section-generic',row.proofs.nativeConic.query,row.proofs.nativeConic],
  ['tessellation/curved-discretization-generic',row.proofs.nativeUniform.query,row.proofs.nativeUniform],
  ['tessellation/curved-discretization-generic',row.proofs.nativeSystem.query,row.proofs.nativeSystem],
  ['tessellate',row.proofs.nativeCP.source.parameters,row.proofs.nativeCP]];
 let index=0;
 globalThis.fetch=(async(url:any,init:any)=>{const [endpoint,query,response]=expected[index++];assert.equal(url,'/api/'+endpoint);assert.deepEqual(JSON.parse(init.body),query);return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});}) as typeof fetch;
 try{const doc=await fetchConicNoncircleCP(row.recipe);assert.equal(index,4);assert.equal(conicNoncircleCPSourceMatches(doc),true);}finally{globalThis.fetch=actualFetch;}
});
test('real JSON/FOLD functions save full recipe/native/material and ordinary DXF is literal raw-mm LINE',()=>{
 for(const row of rows){const doc=conicNoncircleCPDocument(row.recipe,row.proofs);
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(doc,format).text,format).doc;assert.equal(conicNoncircleCPSourceMatches(back),true,row.name+'/'+format);assert.deepEqual(readConicNoncircleRecipe(back),row.recipe);assert.deepEqual(back.segments,doc.segments);}
  assert.equal((exportDXF(doc).text.match(/\r?\nLINE\r?\n/g)||[]).length,doc.segments.length);
 }
});
