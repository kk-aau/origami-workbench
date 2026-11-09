import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {wovenMeritPeriodicPreset,type WovenParams} from '../../src/app/wovenParams';
import {readWovenMeritReport} from '../../src/app/wovenMeritReport';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {recomputeFlatLayers,computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {buildFold} from '../../src/core/geometry';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';

type Case={name:string;params:WovenParams;response:TessResponse};
const data=JSON.parse(fs.readFileSync('tests/fixtures/woven-period-merit-20261007.json','utf8')) as {cases:Case[];legacy:Case[]};

test('original periodic objective preserves pair order and survives strict parameter reload',()=>{
 assert.deepEqual(wovenMeritPeriodicPreset(),data.cases[0].params);
 for(const c of data.cases){assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(c.params))),c.params);const q=readWovenMeritReport(c.response.source);assert.ok(q,c.name);assert.equal(q.periodicEquationCount,15);}
});

test('period reports are independently checked against unscaled source FF, including dropped equation',()=>{
 const c=data.cases[0];
 for(const mutate of [
  (s:any)=>{s.meritReport.periodicRecords[0].color=-1;},
  (s:any)=>{s.meritReport.periodicRecords[0].corners[0]=10000;},
  (s:any)=>{s.meritReport.periodicRecords[0].far[0]=NaN;},
  (s:any)=>{s.meritReport.periodicRecords[1].mother[0]=1;},
  (s:any)=>{s.meritReport.periodicRecords[0].delta[0]=Infinity;},
  (s:any)=>{s.meritReport.periodicRecords[0].delta=[0,0];},
  (s:any)=>{s.meritReport.periodicRawResiduals[0]=.1;},
  (s:any)=>{s.meritReport.periodicRawResiduals.pop();},
  (s:any)=>{s.meritReport.periodicEquationCount=16;},
  (s:any)=>{s.meritReport.droppedPeriodicEquation=14;},
  (s:any)=>{s.meritReport.droppedPeriodicResidual=1;},
  (s:any)=>{s.foldedForm[s.meritReport.periodicRecords[0].corners[1]][0]+=.001;},
  (s:any)=>{s.meritReport.periodicContract='not-supported';},
 ]){const source=structuredClone(c.response.source);mutate(source);assert.equal(readWovenMeritReport(source),null);}
});

test('periodic original solutions pass whole layers and keep front/back visible regions ordered',()=>{
 for(const c of data.cases){
  const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
  const geometry=computeTessFlatGeometry(tessFlatInput(r,r.doc,key,true)),flat=recomputeFlatLayers(geometry);
  assert.equal(geometry.geometry.status,'ready',c.name);assert.equal(flat.layers.status,'solved',`${c.name}: ${flat.layers.message}`);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),true,c.name);
  const overlap=modelOverlapRegions(flat);
  for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(q=>q.layers.status==='ordered'));}
 }
});

test('adopted periodic CP exports without moving coordinates and re-folds after JSON/FOLD roundtrip',()=>{
 const c=data.cases[0],r=prepareTessResult(c.response,c.params),original=buildFold(r.doc).graph;
 for(const format of ['json','fold'] as const){
  const text=exportDocument(r.doc,format).text,doc=importDocument(text,format).doc;
  if(format==='json')assert.deepEqual(buildFold(doc).graph.vertices_coords,original.vertices_coords);
  else{
   assert.deepEqual(JSON.parse(text).vertices_coords,original.vertices_coords,'actual exported FOLD coordinates are unchanged');
   const coords=buildFold(doc).graph.vertices_coords;assert.equal(coords.length,original.vertices_coords.length);
   coords.forEach((p,i)=>assert.ok(Math.hypot(p[0]-original.vertices_coords[i][0],p[1]-original.vertices_coords[i][1])<1e-10,'existing ordinary FOLD reimport only introduces floating arithmetic roundoff'));
  }
  assert.deepEqual(buildFold(doc).graph.edges_vertices,original.edges_vertices);
  const flat=computeFlatFold(doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');
  if(format==='json'){const meta=doc.metadata!.tessellation as any;assert.deepEqual(meta.parameters,c.params);assert.ok(readWovenMeritReport(meta.source));}
 }
});

test('numeric periodic certificates never bypass current signature or layer gate',()=>{
 const c=data.cases[0],r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
 assert.equal(canAdoptTessWithTileLayers(r,true,key,c.params,'solved'),false);
 assert.equal(canAdoptTessWithTileLayers(r,false,key,{...c.params,width:.19},'solved'),false);
 for(const state of ['checking','no-solution','unconfirmed'] as const)assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,state),false);
});
