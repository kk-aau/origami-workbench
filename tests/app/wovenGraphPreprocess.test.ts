import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readWovenGraphSource,readWovenIntersectionInput,recomputeWovenGraphSourceDetails,wovenGraphSourceMatches} from '../../src/app/wovenGraphSource';
import {readWovenPreprocessQuery,readWovenPreprocessResult,preprocessWovenGraph,type WovenPreprocessQuery,type WovenPreprocessResult} from '../../src/app/wovenGraphPreprocess';
import {readTessParams,prepareTessResult,type TessResponse} from '../../src/app/tessellation';
import type {WovenParams} from '../../src/app/wovenParams';
type Case={name:string;query:WovenPreprocessQuery;response:WovenPreprocessResult;params?:WovenParams;construction?:TessResponse};
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/woven-native-intersectify-20261001.json','utf8')) as {cases:Case[]};
const current=spawnSync(path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-c',"import sys,json;sys.path.insert(0,'backend');from test_tessellation_woven_preprocess import native_fixtures;print(json.dumps(native_fixtures()))"],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:20*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(current.status,0,current.stderr);const actual=JSON.parse(current.stdout) as Case[];
const find=(name:string)=>actual.find(c=>c.name===name)!;
const transported=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,value)=>key==='elapsedMs'?undefined:value));

test('native Intersectify independent TS traversal reproduces all source medials, owners and first representatives',()=>{
 assert.deepEqual(transported(actual),transported(fixture.cases),'frozen actual CP and raw splitter fixtures remain stable');
 for(const c of actual){
  const query=readWovenPreprocessQuery(c.query)!;assert.ok(query);assert.deepEqual(readWovenPreprocessResult(c.response,query),c.response);
  const source=readWovenGraphSource(c.response.source)!;assert.ok(source);const checked=recomputeWovenGraphSourceDetails(source);
  assert.deepEqual(checked.graph.edges,c.response.graph.edges);assert.deepEqual(checked.originalEdgeForSegment,c.response.originalEdgeForSegment);
  assert.equal(checked.pairwiseMedials.length,c.response.pairwiseMedials.length);assert.equal(checked.welds.length,c.response.welds.length);assert.ok(wovenGraphSourceMatches(source,c.response.graph));
 }
 const cross=find('exact-cross').response;assert.deepEqual(cross.graph,{vertices:[[-1,0],[0,0],[1,0],[0,-1],[0,1]],edges:[[0,1],[1,2],[3,1],[1,4]]});assert.deepEqual(cross.originalEdgeForSegment,[0,0,1,1]);
 const near=find('near-endpoint').response;assert.deepEqual(near.graph,{vertices:[[-1,0],[-.1,0],[0,-1],[0,1]],edges:[[0,1],[2,1],[1,3]]});assert.deepEqual(near.welds[0].representative,[-.1,0]);
 assert.deepEqual(find('collapsed').response.graph,{vertices:[[-1,0]],edges:[]});
});

test('native source validates raw unsplit/open input separately from a usable mother and never claims CP',()=>{
 const c=find('complete-grid'),q=readWovenPreprocessQuery(c.query)!;assert.equal(q.intersectionTolerance,0);assert.equal(q.samePtTolerance,1e-6);assert.equal(q.invertFoldType,false);
 for(const name of ['exact-cross','near-endpoint','coincident-indices','collapsed','overlapping']){const c=find(name);assert.ok(readWovenIntersectionInput(c.query.inputGraph));assert.equal(c.response.diagnostics.wovenInput.status,'not_ready');assert.ok(Object.values(c.response.certificates).every(v=>v===false));}
 for(const patch of [{intersectionTolerance:null},{samePtTolerance:undefined},{samePtTolerance:true},{intersectionTolerance:-1},{samePtTolerance:101},{invertFoldType:1},{family:'woven-lines'},{operation:'woven-graph-preprocess'}, {inputGraph:{...c.query.inputGraph,edges:[[0,0]]}}])assert.equal(readWovenPreprocessQuery({...c.query,...patch}),null);
 const source=structuredClone(c.response.source);source.inputGraph.vertices[1]=[...source.inputGraph.vertices[0]];assert.equal(readWovenGraphSource(source),null);
 assert.equal(readWovenGraphSource({...c.response.source,fake:true}),null);
});

test('native saved source, actual CP and source edge stamps survive full workbench readback',()=>{
 for(const c of actual.filter(c=>c.params)){
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(c.params))),c.params);const result=prepareTessResult(c.construction!,c.params!);
  const saved=result.doc.metadata!.tessellation as {parameters:unknown;source:unknown};assert.deepEqual(saved.parameters,c.params);assert.deepEqual(saved.source,c.construction!.source);
  assert.deepEqual((c.construction!.source.graphSource as {inputGraph:unknown}).inputGraph,c.query.inputGraph);assert.deepEqual(c.construction!.source.originalEdgeForSegment,c.response.originalEdgeForSegment);
  for(const name of ['geometry','local','lff'])assert.equal((c.construction!.stats.checks as any)[name].status,'passed');
  const bad=structuredClone(c.params!);bad.graphSource!.samePtTolerance=1.1;assert.equal(readTessParams(bad),null,'a tolerance that changes the reconstructed graph invalidates its old actual geometry');
  const same=structuredClone(c.params!);same.graphSource!.samePtTolerance=.01;assert.deepEqual(readTessParams(same),same,'a saved source remains valid when its declared tolerances really reproduce the same geometry');
 }
 const a=find('complete-grid').construction!,b=find('grid-inverted').construction!;assert.deepEqual(a.fold.vertices_coords,b.fold.vertices_coords);assert.equal(a.source.invertFoldType,false);assert.equal(b.source.invertFoldType,true);
});

test('strict preprocess reader rejects forged certificates, query source, topology, geometry, every trace and owners',()=>{
 const c=find('complete-grid'),query=readWovenPreprocessQuery(c.query)!;
 const mutations:((p:any)=>void)[]=[p=>p.source.intersectionTolerance=2,p=>p.source.invertFoldType=true,p=>p.source.inputGraph.edges.reverse(),p=>p.graph.vertices[0][0]+=.1,p=>p.graph.edges.reverse(),p=>p.originalEdgeForSegment[0]=1,p=>p.pairwiseMedials[0].point[0]+=.1,p=>p.pairwiseMedials[0].edges.reverse(),p=>p.pairwiseMedials[0].halfDistance=NaN,p=>p.welds.push({}),p=>p.original.averagesRepresentatives=true,p=>p.original.cells[0]=123,p=>p.original.boundingBoxTolerance=1,p=>p.certificates.adoptAsFold=true,p=>p.diagnostics.outputEdges++,p=>p.diagnostics.wovenInput.sourceFaceCycles.reverse(),p=>p.diagnostics.wovenInput.edgeLines[0]=0,p=>p.family='woven-lines',p=>p.extra=true];
 for(const mutate of mutations){const bad=structuredClone(c.response);mutate(bad);assert.equal(readWovenPreprocessResult(bad,query),null,String(mutate));}
 const near=find('near-endpoint'),bad=structuredClone(near.response);bad.welds[0].representative[0]=0;assert.equal(readWovenPreprocessResult(bad,readWovenPreprocessQuery(near.query)!),null);
 const cross=find('exact-cross'),fake=structuredClone(cross.response);fake.diagnostics.wovenInput={status:'accepted',sourceFaceCycles:[],edgeLines:[0,0,0,0]};assert.equal(readWovenPreprocessResult(fake,readWovenPreprocessQuery(cross.query)!),null);
});

test('native API uses the dedicated route, carries exact original input, abort signal and validates every response',async()=>{
 const c=find('complete-grid'),query=readWovenPreprocessQuery(c.query)!,previous=globalThis.fetch,controller=new AbortController();let observed=false;
 globalThis.fetch=async(url,init)=>{observed=true;assert.equal(url,'/api/tessellation/woven-graph-preprocess');assert.equal(init?.signal,controller.signal);assert.deepEqual(JSON.parse(String(init?.body)),query);return new Response(JSON.stringify(c.response),{status:200,headers:{'Content-Type':'application/json'}});};
 try{assert.deepEqual(await preprocessWovenGraph(query,controller.signal),transported(c.response));assert.ok(observed);
  globalThis.fetch=async()=>new Response(JSON.stringify({...c.response,originalEdgeForSegment:[]}),{status:200});await assert.rejects(()=>preprocessWovenGraph(query),/源线网重算不一致/);
 }finally{globalThis.fetch=previous;}
});

test('preprocessing waits for the active workbench job but aborts queued old input and does not retry invalid geometry',async()=>{
 const c=find('complete-grid'),query=readWovenPreprocessQuery(c.query)!,previous=globalThis.fetch;let calls=0;
 const busy=()=>new Response(JSON.stringify({error:'已有镶嵌计算正在进行，请等待或取消后重试。'}),{status:429});
 try{
  globalThis.fetch=async()=>++calls===1?busy():new Response(JSON.stringify(c.response),{status:200});
  assert.deepEqual(await preprocessWovenGraph(query),transported(c.response));assert.equal(calls,2);
  const controller=new AbortController();calls=0;
  globalThis.fetch=async()=>{calls++;return busy();};
  const pending=preprocessWovenGraph(query,controller.signal);setTimeout(()=>controller.abort(),20);
  await assert.rejects(pending,(error:any)=>error.name==='AbortError');assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'母图包含零长线段'}),{status:422});};
  await assert.rejects(()=>preprocessWovenGraph(query),/零长线段/);assert.equal(calls,1);
 }finally{globalThis.fetch=previous;}
});
