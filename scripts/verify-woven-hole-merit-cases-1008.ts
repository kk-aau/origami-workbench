import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareTessResult} from '../src/app/tessellation';
import {readWovenMeritReport} from '../src/app/wovenMeritReport';
import {inspectWovenCutTopology} from '../src/app/wovenCutTopology';
import {wovenMaterialDocument} from '../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
import {importDocument,exportDocument} from '../src/core/formats';
import {exportDXF} from '../src/core/dxf';
const cases=JSON.parse(fs.readFileSync('output/audits/woven-hole-merit-cases-1008.json','utf8')),reports=[];
assert.equal(cases.length,8);
for(const c of cases){
 assert.equal(c.status,'generated',c.name);const result=prepareTessResult(c.response,c.params),q=readWovenMeritReport(result.source);assert.ok(q,c.name+' merit');const original=inspectWovenCutTopology(result,c.params);assert.ok(original.ok,original.ok?'':c.name+':'+original.reason);
 const doc=wovenMaterialDocument(result,c.params),material=inspectMaterialTopology(doc);assert.ok(material.ok,material.ok?'':material.reason);assert.equal(computeFlatFold(doc).layers.status,'solved',c.name);
 for(const kind of ['json','fold'] as const){const restored=importDocument(exportDocument(doc,kind).text,kind).doc,actual=inspectMaterialTopology(restored);assert.ok(actual.ok,actual.ok?'':actual.reason);assert.deepEqual(actual.graph,material.graph);assert.deepEqual(actual.foldedVertices,material.foldedVertices);assert.equal(computeFlatFold(restored).layers.status,'solved');}
 const dxf=exportDXF(doc).text;assert.equal((dxf.match(/\r?\nLINE\r?\n/g)??[]).length,doc.segments.length);
 reports.push({name:c.name,certificate:q.certificate,holeRows:q.holeClosureEquationCount,independentRows:q.independentEquationCount,merit:q.merit,closureError:result.source.closureError,layers:'solved',dxfLines:doc.segments.length});
}
fs.writeFileSync('output/audits/woven-hole-merit-cases-verified-1008.json',JSON.stringify({verified:true,cases:reports},null,2));console.log('Verified 8 public original-merit hole domains: source, all closure reports, exact JSON/FOLD roundtrips, layers and ordinary DXF lines.');
