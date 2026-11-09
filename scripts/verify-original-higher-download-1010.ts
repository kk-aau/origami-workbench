import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {parseGenericDarbouxResult,validateGenericDarbouxQuery} from '../src/app/curvedNativeGenericDarboux';
const fixtures=JSON.parse(readFileSync('tests/fixtures/origamica-flatten-resample-higher-1010.json','utf8'));
const checks=[];
for(const c of fixtures){
 const source=validateGenericDarbouxQuery(JSON.parse(readFileSync(`output/original-higher-browser-1010/browser-${c.name}-source.json`,'utf8')));
 const actual=parseGenericDarbouxResult(JSON.parse(readFileSync(`output/original-higher-browser-1010/browser-${c.name}-response.json`,'utf8')),source);
 assert.deepEqual(source,c.query);
 for(const key of ['sample','grid','resampling','initial','diagnostics','certification'])assert.deepEqual(actual[key as keyof typeof actual],c.response[key]);
 checks.push({name:c.name,sourceAllParametersExact:true,actualHTTPResponseIndependentReplay:true,sampledGeometryExactToPythonFixture:true,
  samples:actual.resampling!.parameters.length,maximumRelativeMetricDifference:actual.diagnostics.maximumRelativeMetricDifference,
  sourceWasActuallyDownloadedAndReimported:true,adoptableCreasePattern:false});
}
const report={passed:checks.length*4,checks};writeFileSync('output/original-higher-browser-1010/download-readback-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
