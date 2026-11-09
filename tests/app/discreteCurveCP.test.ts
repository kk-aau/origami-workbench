import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {discreteCurveCPPreset,readDiscreteCurveCPParams,discreteCurveCPSourceValid,discreteCurveCPDocument,canAdoptDiscreteCurveCP} from '../../src/app/discreteCurveCP';
import {canAdoptTess,canAdoptTessWithTileLayers,needsTessellationLayerCheck,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/discrete-curve-cp-20261010.json',import.meta.url),'utf8')).cases;

test('finite saved-source reader defaults only absent fields and refuses wrong types/domain',()=>{
 assert.deepEqual(readTessParams({family:'discrete-curve-cp'}),discreteCurveCPPreset());
 for(const key of ['source','leftWidth','rightWidth','assignments'])for(const value of [null,undefined,false,'0.4',{}])assert.equal(readTessParams({family:'discrete-curve-cp',[key]:value}),null);
 for(const c of cases)assert.deepEqual(readTessParams(c.params),c.params);
 assert.equal(readDiscreteCurveCPParams({...discreteCurveCPPreset(),assignments:['B','U','U','U']}),null);
});
test('real CP defaults are adopted only by explicit CP-only route with material topology and no FF',()=>{
 const c=cases[0],r=prepareTessResult(c.response as TessResponse,c.params),key=tessConstructionKey(c.params);
 assert.equal(discreteCurveCPSourceValid(r,c.params),true);
 assert.equal(canAdoptTess(r,false,key,c.params),false);assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'solved'),false);
 assert.equal(canAdoptDiscreteCurveCP(r,false,key,c.params),true);assert.equal(canAdoptDiscreteCurveCP(r,true,key,c.params),false);assert.equal(canAdoptDiscreteCurveCP(r,false,'stale',c.params),false);
 const doc=discreteCurveCPDocument(r,c.params),topology=inspectMaterialTopology(doc);
 assert.equal(topology.ok,true);assert.equal(doc.segments.length,12);assert.equal(doc.segments.filter(s=>s.assignment==='B').length,8);
 assert.equal((doc.metadata!.discreteCurveCPAdoption as any).flatFoldCertified,false);
 assert.equal('foldedVertices' in (doc.metadata!.materialTopology as any),false);
});
test('ordinary adoption requires explicit MV, valid local/LFF and final whole-sheet layer state',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),valid=c.name==='explicit-valid-assignments';
  assert.equal(needsTessellationLayerCheck(c.params),true);
  assert.equal(canAdoptTess(r,false,key,c.params),valid,c.name);
  for(const status of [undefined,'checking','unconfirmed','no-solution','invalid'])assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,status),false,c.name);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'solved'),valid,c.name);
  assert.equal(canAdoptDiscreteCurveCP(r,false,key,c.params),true,c.name);
 }
});
test('source, raw original multiplier, fold coordinates, types and displayed coordinates cannot be forged',()=>{
 const c=cases[0];
 for(const mutate of [(r:any)=>r.source.staticGlobalIsometryChecked=true,(r:any)=>r.source.foldedForm3D=[[0,0,0]],
  (r:any)=>r.source.nativeDiscretization.sample.multipliers[1]+=.1,(r:any)=>r.source.nativeDiscretization.query.foldPoints[0][0]+=.1,
  (r:any)=>r.fold.vertices_coords[4][0]+=.1,(r:any)=>r.fold.edges_assignment[0]='M',(r:any)=>r.doc.segments[0].a[0]+=.01]){
  const r=prepareTessResult(structuredClone(c.response),c.params);mutate(r);assert.equal(canAdoptDiscreteCurveCP(r,false,tessConstructionKey(c.params),c.params),false);assert.throws(()=>discreteCurveCPDocument(r,c.params));
 }
 const r=prepareTessResult(structuredClone(c.response),c.params);r.stats.checks.local.status='passed';r.stats.checks.lff!.status='passed';
 assert.equal(canAdoptTessWithTileLayers(r,false,tessConstructionKey(c.params),c.params,'solved'),false);
});
test('actual material JSON/FOLD preserves source recipe and coordinates; ordinary DXF is literal 12 LINE',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),doc=discreteCurveCPDocument(r,c.params);
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(doc,format).text,format).doc;
   assert.deepEqual(back.segments.map(s=>[s.a,s.b,s.assignment,s.angle]),doc.segments.map(s=>[s.a,s.b,s.assignment,s.angle]));
   assert.deepEqual((back.metadata!.tessellation as any).parameters,c.params);
   assert.deepEqual((back.metadata!.tessellation as any).source,c.response.source);
   assert.equal(inspectMaterialTopology(back).ok,true);
  }
  assert.equal((exportDXF(doc).text.match(/\r?\nLINE\r?\n/g)??[]).length,12);
 }
});
