import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseGenericSystemHelpersResult,validateGenericSystemHelpersQuery} from '../src/app/curvedNativeSystemHelpers';
const directory=path.resolve(process.argv[2]??'output/original-recover-ndsolve-browser-1010'),evidence=[];
for(const mode of ['recover2','recover3','recover-darboux'])for(const kind of ['preset','edited']){
 const name=mode+'-'+kind,read=(suffix:string)=>JSON.parse(fs.readFileSync(path.join(directory,name+'-'+suffix+'.json'),'utf8')),
  source=validateGenericSystemHelpersQuery(read('source')),rules=parseGenericSystemHelpersResult(read('rules'),source),response=read('response');
 assert.deepEqual(rules,response);assert.deepEqual(source,response.query);
 assert.equal(source.initialParameter,.4);assert.equal(source.initialTangent![0],2);assert.equal(source.ndsolveOptions!.MaxStepSize,kind==='edited'?.01:.02);
 assert.equal(rules.initial!.frameCompatible,false);assert.equal(rules.certification.adoptableCreasePattern,false);assert.equal(rules.source.wolframOptionsReproduced,false);
 const s=rules.diagnostics.integration.stepOptions!;assert.ok(s.forwardSteps>0&&s.backwardSteps>0);
 evidence.push({name,sourceAndFullRulesIndependentlyReplayed:true,actualResponseExact:true,rawInitialsPreserved:true,originalDomain:[s.backwardParameters.at(-1),s.forwardParameters.at(-1)],acceptedSteps:s.backwardSteps+s.forwardSteps});
}
fs.writeFileSync(path.join(directory,'independent-download-evidence.json'),JSON.stringify({passed:evidence.length,actualFilesRead:18,evidence},null,2));
console.log(JSON.stringify({passed:evidence.length,actualFilesRead:18,independentScalarAndDP54Replay:true}));
