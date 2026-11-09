import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {wovenHighEvenPreset,WOVEN_HIGH_EVEN_EXAMPLES,type WovenParams} from '../../src/app/wovenParams';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {canAdoptWovenCP,wovenCPDocument} from '../../src/app/wovenCPDocument';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput} from '../../src/app/tessellationFlat';

type Case={name:string;params:WovenParams&{mode:'graph'};response:TessResponse};
const saved=JSON.parse(fs.readFileSync(new URL('../fixtures/woven-high-even-20261010.json',import.meta.url),'utf8')) as {cases:Case[]};
const selected=saved.cases.filter(c=>WOVEN_HIGH_EVEN_EXAMPLES.some(n=>c.name===`star-${n}-parity-1`));

test('certified high-even presets preserve full source indices and original square-sum parameters',()=>{
 for(const c of selected){const degree=c.params.graph.vertices.length-1,p= wovenHighEvenPreset(degree);assert.deepEqual(p,c.params);assert.deepEqual(readTessParams(p),p);assert.equal(p.graph.edges.filter(e=>e.includes(0)).length,degree);assert.equal(p.optimization,'origamica-merit');assert.equal(c.response.source.meritReport!==undefined,true);}
 for(const n of [9,11,33,34,10.5,NaN])assert.throws(()=>wovenHighEvenPreset(n));
});

test('every genuine 10-to-32 degree public CP passes independent original construction and adoption proof',()=>{
 for(const c of saved.cases){
  const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),proof=inspectWovenCutTopology(r,c.params);assert.ok(proof.ok,`${c.name}: ${proof.ok?'':proof.reason}`);
  assert.equal(canAdoptWovenCP(r,false,key,c.params),true,c.name);const d=wovenCPDocument(r,c.params),m=inspectMaterialTopology(d);assert.ok(m.ok,c.name);assert.equal(m.foldedVertices,undefined);assert.equal(d.segments.length,8*(c.params.graph.vertices.length-1));
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'no-solution'),false);assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'checking'),false);
 }
});

test('high-even CP copies survive native and FOLD readback and export actual DXF lines',()=>{
 for(const c of selected){
  const r=prepareTessResult(c.response,c.params),d=wovenCPDocument(r,c.params),m=inspectMaterialTopology(d);assert.ok(m.ok);
  for(const format of ['json','fold'] as const){const text=exportDocument(d,format).text,back=importDocument(text,format).doc,b=inspectMaterialTopology(back);assert.ok(b.ok);assert.deepEqual(b.graph,m.graph);assert.equal(b.foldedVertices,undefined);if(format==='fold')assert.ok(!(JSON.parse(text).file_frames??[]).some((f:any)=>(f.frame_classes??[]).includes('foldedForm')));}
  assert.equal((exportDXF(d).text.match(/\r?\nLINE\r?\n/g)??[]).length,d.segments.length);
 }
});

test('forged affine coordinates, missing source edge, stale or changed candidate cannot adopt',()=>{
 const c=selected[0],r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
 assert.equal(canAdoptWovenCP(r,true,key,c.params),false);assert.equal(canAdoptWovenCP(r,false,'stale',c.params),false);
 for(const field of ['ff','source-edge','candidate'] as const){const bad=structuredClone(r);if(field==='ff')(bad.source.foldedForm as number[][])[0][0]+=.01;else if(field==='source-edge')(bad.source.graph as any).edges.pop();else bad.doc.segments[0].a[0]+=.01;assert.equal(canAdoptWovenCP(bad,false,key,c.params),false,field);}
});

test('actual high-even layer solve independently enables normal adoption for all four presets',()=>{
 for(const c of selected){const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),input=tessFlatInput(r,r.doc,key,true),geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});assert.equal(geometry.geometry.status,'ready',c.name);const flat=recomputeFlatLayers(geometry);assert.equal(flat.layers.status,'solved',c.name);console.log(c.name,'actual layer order:',flat.layers.status);assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),true);}
});
