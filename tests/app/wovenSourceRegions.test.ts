import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readWovenGraphSource,recomputeWovenGraphSource,wovenGraphSourceMatches,withWovenMotherSelection,wovenNativeMotherReady,wovenIn3437Source,type WovenGraphSource} from '../../src/app/wovenGraphSource';
import {readWovenPreprocessResult} from '../../src/app/wovenGraphPreprocess';
import {readWovenGraphPackage} from '../../src/app/wovenGraphInspection';
import {prepareTessResult,readTessParams,type TessResponse} from '../../src/app/tessellation';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import type {WovenParams} from '../../src/app/wovenParams';
const cases=JSON.parse(fs.readFileSync('tests/fixtures/woven-source-regions-1008.json','utf8')).cases as {name:string;query:any;primitive:any;params:WovenParams&{mode:'graph';graphSource:Extract<WovenGraphSource,{kind:'origamica-intersectify-native'}>};response:TessResponse}[];

test('native original line split then explicit rings/cell holes/sheets independently reconstruct and adopt',()=>{
 for(const c of cases){
  assert.ok(readWovenPreprocessResult(c.primitive,c.query),c.name);assert.ok(readTessParams(c.params),c.name);
  assert.ok(readWovenGraphSource(c.params.graphSource));assert.ok(wovenNativeMotherReady(c.params.graphSource,c.params.graph));assert.ok(wovenGraphSourceMatches(c.params.graphSource,c.params.graph));
  const replay=recomputeWovenGraphSource(c.params.graphSource);assert.deepEqual(replay.graph.edges,c.params.graph.edges);assert.deepEqual(replay.originalEdgeForSegment,c.primitive.originalEdgeForSegment);
  const bound=withWovenMotherSelection(c.primitive.source,c.params.graph);assert.deepEqual(bound,c.params.graphSource);
  const result=prepareTessResult(c.response,c.params),doc=wovenMaterialDocument(result,c.params);
  assert.equal(computeFlatFold(doc).layers.status,'solved',c.name);
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(doc,format).text,format).doc;assert.equal(computeFlatFold(back).layers.status,'solved',`${c.name}/${format}`);}
  const pack={schema:'zhezhi-woven-mother-v1',graph:c.params.graph,graphSource:bound};assert.deepEqual(readWovenGraphPackage(JSON.parse(JSON.stringify(pack))),pack);
 }
});

test('source matches checks region roles and immutable derived stamp, never just coordinates',()=>{
 const {params:p,primitive}=cases[0],source=p.graphSource;
 for(const change of [(g:any)=>delete g.ringHoles,(g:any)=>g.ringHoles[0].face=1,(g:any)=>g.nestedSheets=true,(g:any)=>g.vertices[0][0]+=.01,(g:any)=>g.edges.reverse()]){const g=structuredClone(p.graph);change(g);assert.equal(wovenGraphSourceMatches(source,g),false);assert.equal(readTessParams({...p,graph:g}),null);}
 assert.equal(wovenGraphSourceMatches(primitive.source,p.graph),false,'raw split source cannot claim extra hand-declared holes');
 for(const change of [(s:any)=>s.inputGraph.vertices[0][0]=7,(s:any)=>s.motherSelection.geometry.vertices[0][0]=7,(s:any)=>s.inputGraph.edges.reverse(),(s:any)=>s.samePtTolerance=10]){const s=structuredClone(source);change(s);assert.equal(readWovenGraphSource(s),null);assert.equal(wovenGraphSourceMatches(s,p.graph),false);}
 const moved=structuredClone(p.graph);moved.vertices[0][0]+=.01;assert.throws(()=>withWovenMotherSelection(source,moved),/修改点边/);
});

test('region removal/undo preserves raw primitive but never carries stale native CP',()=>{
 const c=cases[0],restored=structuredClone(c.params.graph);delete restored.ringHoles;
 const without=withWovenMotherSelection(c.params.graphSource,restored);assert.equal(without.motherSelection,undefined);assert.equal(wovenNativeMotherReady(without,restored),false,'undeclared nested contour cannot become saveable');assert.ok(wovenGraphSourceMatches(without,restored));
 assert.deepEqual(withWovenMotherSelection(without,c.params.graph),c.params.graphSource);
 assert.deepEqual(c.params.graphSource.inputGraph,c.query.inputGraph);
 const inverted={...c.params.graphSource,invertFoldType:true};assert.ok(wovenGraphSourceMatches(inverted,c.params.graph),'assignment choice does not move derived coordinates');
});

test('region schema rejects malformed/unknown data and cannot extend frozen In3437 source',()=>{
 const source=cases[0].params.graphSource;
 for(const change of [(s:any)=>s.motherSelection.extra=1,(s:any)=>s.motherSelection.ringHoles=[],(s:any)=>s.motherSelection.holeFaces=[true],(s:any)=>s.motherSelection.nestedSheets=false,(s:any)=>s.motherSelection.geometry.ringHoles=s.motherSelection.ringHoles,(s:any)=>s.motherSelection.ringHoles[0].face=true,(s:any)=>delete s.motherSelection.geometry]){const s=structuredClone(source);change(s);assert.equal(readWovenGraphSource(s),null);}
 assert.equal(readWovenGraphSource({...wovenIn3437Source(),motherSelection:source.motherSelection}),null);
 const frozen=wovenIn3437Source();frozen.inputGraph.nestedSheets=true;assert.equal(readWovenGraphSource(frozen),null,'frozen raw input cannot carry a region label either');
 const reordered=structuredClone(cases[0].params.graph);reordered.ringHoles=reordered.ringHoles!.map(b=>({component:b.component,face:b.face}));assert.ok(wovenGraphSourceMatches(source,reordered),'object field order does not change a role');
 const raw=structuredClone(cases[0].primitive);raw.source.motherSelection=source.motherSelection;assert.equal(readWovenPreprocessResult(raw,cases[0].query),null,'split endpoint remains geometry-only');
});
