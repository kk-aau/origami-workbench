import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseGenericLinkedResult,validateGenericLinkedQuery,GENERIC_LINKED_PRESET} from '../src/app/curvedGenericLinked';
import {parseCurve2DSystemsFile,parseCurve2DSystemsResult} from '../src/app/curvedCurve2DSystems';
let passed=0;
const read=(p:string)=>JSON.parse(fs.readFileSync(`output/original-independent-browser-1010/${p}`,'utf8'));
for(const count of [1,2,3]){
  const source=validateGenericLinkedQuery(read(`browser-raw-prefix-${count}-source.json`));passed++;
  const systems=parseCurve2DSystemsFile(read(`browser-raw-prefix-${count}-systems.json`),source.curves,'independent-external');passed++;
  assert.deepEqual(systems,source.curve2DSystems);passed++;
  const r=parseGenericLinkedResult(read(`browser-raw-prefix-${count}-response.json`),source);passed++;
  assert.deepEqual(r.query,source);assert.equal(r.certification.adoptableCreasePattern,false);passed++;
  const reread=JSON.parse(JSON.stringify({query:source,response:r}));parseGenericLinkedResult(reread.response,reread.query);passed++;
}
parseCurve2DSystemsResult(read('browser-verified-precomputed-response.json'),GENERIC_LINKED_PRESET.curves);passed++;
parseCurve2DSystemsFile(read('browser-verified-systems.json'),GENERIC_LINKED_PRESET.curves);passed++;
console.log(JSON.stringify({passed,actualBrowserDownloads:true,independentOdeTrajectoryReadback:true},null,2));
