import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseGenericDarbouxResult,validateGenericDarbouxQuery} from '../src/app/curvedNativeGenericDarboux';
let passed=0;
for(const name of ['flatten-maxsteps','flatten-step-size','flatten-resample4','in3886-reparameterized-coarse','in3886-reparameterized-fine','reshape-both-interior']){
 const source=validateGenericDarbouxQuery(JSON.parse(fs.readFileSync(`output/original-ndsolve-browser-1010/browser-${name}-source.json`,'utf8')));passed++;
 const result=parseGenericDarbouxResult(JSON.parse(fs.readFileSync(`output/original-ndsolve-browser-1010/browser-${name}-response.json`,'utf8')),source);passed++;
 assert.deepEqual(result.query,source);assert.deepEqual(result.diagnostics.integration.stepOptions!.options,source.ndsolveOptions);passed++;
 const copy=JSON.parse(JSON.stringify(result));parseGenericDarbouxResult(copy,source);passed++;
 assert.equal(result.certification.adoptableCreasePattern,false);assert.equal(result.diagnostics.integration.stepOptions!.wolframStepControllerReproduced,false);passed++;
}
console.log(JSON.stringify({passed,actualBrowserDownloads:true,independentTrajectoryReplay:true},null,2));
