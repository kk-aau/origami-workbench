import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readWovenMeritReport} from '../../src/app/wovenMeritReport';
import {prepareTessResult} from '../../src/app/tessellation';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {computeFlatFold} from '../../src/core/flatFold';
import {wovenHoleMeritPreset} from '../../src/app/wovenParams';
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/woven-hole-merit-1008.json','utf8'));
test('asymmetric hole merit reports the original objective, full global constraints and a local candidate',()=>{
 assert.deepEqual(wovenHoleMeritPreset(),fixture.params);
 const q=readWovenMeritReport(fixture.response.source);assert.ok(q);assert.equal(q.certificate,'local-numerical-candidate');assert.equal(q.holeClosureEquationCount,64);assert.equal(q.independentEquationCount,3);assert.ok(q.holeClosureMaximumResidual!<1e-7);assert.equal(q.equalityEquationCount,64);
});
test('hole diagnostics reject forged counts, row indices, raw residuals and missing global binding',()=>{
 for(const mutate of [
  (s:any)=>delete s.meritReport.holeClosureContract,
  (s:any)=>s.meritReport.holeClosureEquationCount=2,
  (s:any)=>s.meritReport.equalityRowIndices=[0,0,1],
  (s:any)=>s.meritReport.equalityRowIndices=[0,1,64],
  (s:any)=>s.meritReport.holeClosureRawResiduals[0]=.1,
  (s:any)=>s.meritReport.independentEquationCount=600,
  (s:any)=>s.wovenMotherHoles.faceIds=[0],
  (s:any)=>s.closureError=.01,
  (s:any)=>delete s.wovenMotherHoles
 ]){const source=structuredClone(fixture.response.source);mutate(source);assert.equal(readWovenMeritReport(source),null);}
});
test('asymmetric original-merit CP genuinely adopts, preserves source and round-trips with solved layers',()=>{
 const result=prepareTessResult(fixture.response,fixture.params),i=inspectWovenCutTopology(result,fixture.params);assert.ok(i.ok,i.ok?'':i.reason);
 const doc=wovenMaterialDocument(result,fixture.params),actual=inspectMaterialTopology(doc);assert.ok(actual.ok,actual.ok?'':actual.reason);assert.equal(computeFlatFold(doc).layers.status,'solved');
 for(const kind of ['json','fold'] as const){const r=importDocument(exportDocument(doc,kind).text,kind).doc,m=inspectMaterialTopology(r);assert.ok(m.ok,m.ok?'':m.reason);assert.deepEqual(m.graph,actual.graph);assert.deepEqual(m.foldedVertices,actual.foldedVertices);assert.equal(computeFlatFold(r).layers.status,'solved');}
});
