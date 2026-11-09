import fs from 'node:fs';
import assert from 'node:assert/strict';
const file=process.argv[2],log=fs.readFileSync(file,'utf8'),match=log.match(/^### Result\r?\n([^\r\n]+)/m);
if(!match){console.error(log.slice(-2500));process.exit(1);}
const result=JSON.parse(match[1]);assert.ok(result.passed>0);if(result.errors)assert.deepEqual(result.errors,[]);
console.log(JSON.stringify({file,passed:result.passed,errors:result.errors??[],bundle:result.bundle,actualCapturedResponses:result.responses?.length,layout:result.layout}));
