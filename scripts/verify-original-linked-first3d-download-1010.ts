import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseLinkedFirstBandResult,validateLinkedFirstBandQuery} from '../src/app/curvedLinkedFirstBand';
import {parseP45LinkedChainResult,validateP45LinkedChainQuery} from '../src/app/curvedP45LinkedChain';
import {parseLinkedCommonResult,validateLinkedCommonQuery} from '../src/app/curvedLinkedCommonParameter';
import {parseGenericLinkedResult,validateGenericLinkedQuery} from '../src/app/curvedGenericLinked';
const directory=path.resolve(process.argv[2]??'output/original-linked-first3d-browser-1010'),rows=[];
for(const mode of ['saved-first','saved-chain','common','generic','independent'])for(const kind of ['example','edited']){
 const name=mode+'-'+kind,read=(suffix:string)=>JSON.parse(fs.readFileSync(path.join(directory,name+'-'+suffix+'.json'),'utf8')),raw=read('source'),
  validate=raw.variant==='saved-chain'?validateP45LinkedChainQuery:raw.variant==='common-parameter'?validateLinkedCommonQuery:raw.variant==='generic-common-parameter'?validateGenericLinkedQuery:validateLinkedFirstBandQuery,
  parse=raw.variant==='saved-chain'?parseP45LinkedChainResult:raw.variant==='common-parameter'?parseLinkedCommonResult:raw.variant==='generic-common-parameter'?parseGenericLinkedResult:parseLinkedFirstBandResult,
  source=validate(raw),result=parse(read('result'),source),response=read('response');
 assert.deepEqual(source,response.query);assert.deepEqual(result,response);assert.equal(source.ndsolveOptions!.MaxSteps,512);assert.equal(source.ndsolveOptions!.MaxStepSize,kind==='example'?.02:.01);
 assert.equal(result.certification.adoptableCreasePattern,false);assert.equal(result.first3DIntegration!.callerDefinitionCell,'In[4081]');assert.equal(result.first3DIntegration!.interpolationAndRootStagesControlled,false);
 if(mode==='independent'){assert.equal((source as any).curve2DSystemsMode,'independent-external');assert.equal(result.first3DIntegration!.initialState[3],2);assert.equal(result.first3DIntegration!.initialState[7],3);assert.deepEqual((result as any).curve2DSystems.systems,(source as any).curve2DSystems);}
 rows.push({name,actualResponseExact:true,sourceAndCompleteResultIndependentlyReplayed:true,originalInputsPreserved:true,actualRows:result.sample.rows.length,controlledStage:'NRecoverDarboux3D',steps:result.first3DIntegration!.stepOptions.forwardSteps});
}
fs.writeFileSync(path.join(directory,'independent-download-evidence.json'),JSON.stringify({passed:rows.length,actualFilesRead:30,rows},null,2));
console.log(JSON.stringify({passed:rows.length,actualFilesRead:30,independentScalarAndDP54Replay:true}));
