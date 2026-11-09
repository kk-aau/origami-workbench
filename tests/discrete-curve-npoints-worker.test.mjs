import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),fixture=JSON.parse(await readFile(path.join(root,'tests/fixtures/discrete-curve-npoints-20261010.json'),'utf8')).cases;
test('actual JSON worker protocol accepts finite N CP and survives malformed-domain/original-Abort frames',async()=>{
 const out=process.env.DISCRETE_N_CP_EVIDENCE||path.join(root,'output/npoints-worker');await mkdir(out,{recursive:true});
 const old=JSON.parse(await readFile(path.join(root,'tests/fixtures/discrete-curve-cp-20261010.json'),'utf8')).cases[0];
 const requests=[{family:'discrete-curve-cp',source:null},...fixture.filter(r=>r.name.endsWith('unassigned')).map(r=>r.params)];
 const bad=structuredClone(fixture[0].params);bad.source.foldPoints[1][0]=.1;requests.push(bad);
 const wrong=structuredClone(fixture[0].params);wrong.assignments=Array(4).fill('U');requests.push(wrong);requests.push(old.params);
 const child=spawn(path.join(root,'.venv/Scripts/python.exe'),[path.join(root,'backend/tessellate.py'),'--worker'],{cwd:root,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},stdio:['pipe','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
 const complete=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`worker exit ${code}: ${errors}`)));});
 child.stdin.end(requests.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const timer=setTimeout(()=>child.kill(),20000);
 try{await complete;}finally{clearTimeout(timer);}
 const answers=output.trim().split(/\r?\n/).map(line=>JSON.parse(line));assert.equal(answers.length,requests.length);assert.ok(answers[0].error);
 const checks=[];let index=1;
 for(const row of fixture.filter(r=>r.name.endsWith('unassigned'))){const actual=answers[index++].result;assert.ok(actual,row.name);assert.deepEqual([actual.stats.vertices,actual.stats.edges,actual.stats.faces],[3*row.params.source.foldPoints.length,5*row.params.source.foldPoints.length-3,2*row.params.source.foldPoints.length-2]);assert.equal(actual.stats.checks.geometry.status,'passed');assert.equal(actual.stats.checks.local.status,'incomplete');assert.deepEqual(actual.source.nativeDiscretization.query,row.params.source);checks.push(row.name);}
 assert.match(answers[index++].error,/original-kawasaki-abort/);assert.ok(answers[index++].error);
 assert.deepEqual([answers[index].result.stats.vertices,answers[index].result.stats.edges,answers[index].result.stats.faces],[9,12,4]);
 await writeFile(path.join(out,'worker-checks.json'),JSON.stringify({verified:true,checks,frames:requests.length,errorsAreFramesNotSuccess:true,lastLegacyRequestSucceeded:true,noHTTPServiceStarted:true,ownedWorkerExited:true},null,2)+'\n');
});
