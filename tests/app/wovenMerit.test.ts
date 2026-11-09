import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readWovenMeritReport} from '../../src/app/wovenMeritReport';
import {wovenMeritPreset,wovenMeritConcavePreset,type WovenParams} from '../../src/app/wovenParams';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {validateDoc} from '../../src/core/types';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';

const cases=JSON.parse(fs.readFileSync('tests/fixtures/woven-merit-20261007.json','utf8')).cases as {name:string;params:WovenParams;response:TessResponse}[];

test('merit mode and finite mother example survive parameter and project round trips',()=>{
 const preset=wovenMeritPreset();assert.deepEqual(readTessParams(preset),preset);
 assert.deepEqual(preset,cases.find(c=>c.name==='internal-diagonal')!.params);
 assert.deepEqual(wovenMeritConcavePreset(),cases.find(c=>c.name==='reflex-cell-usable-merit')!.params);
 const other=wovenMeritPreset();other.graph.vertices[0][0]=5;assert.equal(wovenMeritPreset().graph.vertices[0][0],-1);
 for(const c of cases){
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(c.params))),c.params);
  const r=prepareTessResult(c.response,c.params),saved=JSON.parse(JSON.stringify(r.doc));
  assert.doesNotThrow(()=>validateDoc(saved));
  assert.deepEqual(saved.metadata.tessellation.parameters,c.params);
  assert.deepEqual(readWovenMeritReport(saved.metadata.tessellation.source),readWovenMeritReport(c.response.source));
 }
});

test('only matching finite factor reports display certificates and numerical diagnostics',()=>{
 for(const c of cases){const q=readWovenMeritReport(c.response.source);assert.ok(q,c.name);assert.equal(q.certificate,c.name==='internal-diagonal'?'feasible-lower-bound':'local-numerical-candidate');}
 const cut=cases.find(c=>c.name==='internal-diagonal')!;
 for(const mutate of [
  (s:any)=>{s.pleatFactors[0]+=.01;},(s:any)=>{s.meritReport.lowerBounds[0]=0;},
  (s:any)=>{s.meritReport.maximumResidual=NaN;},(s:any)=>{s.meritReport.evaluationCount=20000;},
  (s:any)=>{s.meritReport.wolframExecuted=true;},(s:any)=>{s.meritReport.noArtificialUpperBound=false;},
  (s:any)=>{s.meritReport.certificate='global-minimum';},(s:any)=>{s.meritReport.iterations=1;},
  (s:any)=>{s.merit=1;},(s:any)=>{s.optimization='legacy';},
  (s:any)=>{s.pleatFactors[0]=1e200;},(s:any)=>{s.meritReport.activeBounds=0;},
 ]){const s=structuredClone(cut.response.source);mutate(s);assert.equal(readWovenMeritReport(s),null);}
 const numeric=structuredClone(cases.find(c=>c.name==='reflex-cell-positive')!.response.source);
 (numeric.meritReport as any).certificate='feasible-lower-bound';assert.equal(readWovenMeritReport(numeric),null);
});

test('optimized internal cut solves both sides and adopts a valid material document',()=>{
 const c=cases.find(c=>c.name==='internal-diagonal')!,r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
 const input=tessFlatInput(r,r.doc,key,true),geometry=computeTessFlatGeometry(input),flat=recomputeFlatLayers(geometry);
 assert.equal(geometry.geometry.status,'ready');assert.equal(flat.layers.status,'solved',flat.layers.message);
 assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),true);
 const overlap=modelOverlapRegions(flat);
 for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(q=>q.layers.status==='ordered'));}
 const doc=wovenMaterialDocument(r,c.params);assert.doesNotThrow(()=>validateDoc(JSON.parse(JSON.stringify(doc))));
 const material=inspectMaterialTopology(doc);assert.ok(material.ok);assert.equal(material.graph.vertices_coords.length,input.graph.vertices_coords.length);
});

test('numerical merit candidates retain the whole paper layer gate',()=>{
 for(const c of cases.filter(c=>c.name!=='internal-diagonal')){
  const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),input=tessFlatInput(r,r.doc,key,true),geometry=computeTessFlatGeometry(input);
  assert.equal(geometry.geometry.status,'ready',c.name);
  const flat=recomputeFlatLayers(geometry);
  if(c.name==='reflex-cell-usable-merit')assert.equal(flat.layers.status,'solved',flat.layers.message);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),flat.layers.status==='solved',c.name);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'checking'),false);
 }
});
