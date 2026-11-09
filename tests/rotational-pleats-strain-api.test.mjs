import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures=JSON.parse(await readFile(path.join(root,'tests/fixtures/rotational-pleats-engineering-roots-1012.json'),'utf8')).cases;

test('bounded rotational pleats API keeps original queries, rejects invalid input and exposes honest root diagnostics',async()=>{
  const out=process.env.ROTATIONAL_PLEATS_API_EVIDENCE||path.join(root,'output/rotational-pleats-api-tests');
  await mkdir(out,{recursive:true});
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:path.join(out,'owned-data'),PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},stdio:['ignore','pipe','pipe']});
  let port=0,output='',exited=false;
  child.once('exit',()=>{exited=true;});
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(output||'Test service did not start')),10000);
      child.stdout.on('data',chunk=>{output+=chunk;const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(match){port=Number(match[1]);clearTimeout(timer);resolve();}});
      child.stderr.on('data',chunk=>{output+=chunk;});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);if(!port)reject(new Error(`Test service exit ${code}: ${output}`));});
    });
    const base=`http://127.0.0.1:${port}`,health=await(await fetch(base+'/api/health')).json();
    const post=async(route,input)=>{
      const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},body:JSON.stringify(input),signal:AbortSignal.timeout(65000)});
      return {status:response.status,value:await response.json()};
    };
    const route='/api/tessellation/rotational-pleats-strain',requests=[];
    for(const [field,value] of [['repetitionPairs',0],['repetitionPairs',true],['repetitionPairs',25],['arcDeg','60'],['arcDeg',null],['sourceKey','execute arbitrary code'],['unknown',1]]){
      const query=structuredClone(fixtures.rectangle.query);query[field]=value;
      const result=await post(route,query);
      assert.equal(result.status,422,field);assert.equal(typeof result.value.error,'string');
      requests.push({kind:'invalid',field,status:result.status});
    }
    const duplicate=structuredClone(fixtures.rectangle.query);duplicate.edges.push([...duplicate.edges[0]]);
    assert.equal((await post(route,duplicate)).status,422);
    assert.equal((await post('/api/tessellate',{operation:'rotational-pleats-strain'})).status,400);
    for(const model of ['rectangle','canonical']){
      const expected=fixtures[model],result=await post(route,expected.query),native=result.value;
      assert.equal(result.status,200,model);assert.deepEqual(native.query,expected.query);assert.equal(native.sourceKey,expected.sourceKey);
      assert.equal(native.solver.initialCoordinatesExactlyOriginalRx90,true);assert.deepEqual(native.solver.stationaryAnchorUntranslated,expected.solver.stationaryAnchorUntranslated);
      assert.ok(native.residuals.maximumOriginalConstraint<2e-9);assert.ok(native.residuals.maximumMinimumDiagonalError<2e-8);
      assert.equal(native.source.rigidSceneCertified,false);assert.equal(native.source.originalWolframBranchUniquelyCertified,false);
      assert.equal(native.solutionVertices3D.length,expected.query.verticesMm.length);
      assert.ok(native.solutionVertices3D.every(point=>point.length===3&&point.every(Number.isFinite)));
      await writeFile(path.join(out,model+'-actual-api-response.json'),JSON.stringify(native,null,2)+'\n');
      requests.push({kind:'valid',model,status:result.status,actualHTTP:true});
    }
    await writeFile(path.join(out,'api-checks.json'),JSON.stringify({verified:true,requests,duplicateRejected:true,genericGenerationOperationRejected:true,fixtureResponsesUsed:false,machineVerified:false},null,2)+'\n');
  }finally{
    if(!exited){const finished=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([finished,new Promise(resolve=>setTimeout(resolve,5000).unref())]);if(!exited)child.kill('SIGKILL');}
    await writeFile(path.join(out,'owned-runtime-cleanup.json'),JSON.stringify({pid:child.pid,exited,ownedOnly:true},null,2)+'\n');
  }
});
