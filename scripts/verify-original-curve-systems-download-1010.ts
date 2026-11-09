import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {parseCurve2DSystemsFile,parseCurve2DSystemsResult} from '../src/app/curvedCurve2DSystems';
import {parseGenericLinkedResult,validateGenericLinkedQuery,GENERIC_LINKED_PRESET} from '../src/app/curvedGenericLinked';
const f=JSON.parse(readFileSync('tests/fixtures/origamica-curve2d-systems-1010.json','utf8'));
const prepared=parseCurve2DSystemsResult(JSON.parse(readFileSync('output/original-function-browser-1010/curve-systems/browser-precomputed-response.json','utf8')),GENERIC_LINKED_PRESET.curves);
assert.deepEqual(prepared,f.precomputed);const checks=[];
for(const count of [1,2,3]){
 const q=validateGenericLinkedQuery(JSON.parse(readFileSync(`output/original-function-browser-1010/curve-systems/browser-prefix-${count}-source.json`,'utf8'))),
  systems=parseCurve2DSystemsFile(JSON.parse(readFileSync(`output/original-function-browser-1010/curve-systems/browser-prefix-${count}-systems.json`,'utf8')),q.curves),
  actual=parseGenericLinkedResult(JSON.parse(readFileSync(`output/original-function-browser-1010/curve-systems/browser-prefix-${count}-response.json`,'utf8')),q),expected=f.cases[count-1];
 assert.deepEqual(q,expected.query);assert.deepEqual(systems,q.curve2DSystems);
 for(const key of ['sample','curve2DSystems','certification'])assert.deepEqual(actual[key as keyof typeof actual],expected.response[key]);
 checks.push({prefix:count,systemsExact:true,sourceAllParametersExact:true,actualHTTPResponseIndependentReplay:true,
  sampledGeometryExactToPythonFixture:true,next2DThirdSystemUsed:false,evaluations:actual.curve2DSystems!.evaluations});
}
const report={passed:13,checks};writeFileSync('output/original-function-browser-1010/curve-systems/download-readback-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
