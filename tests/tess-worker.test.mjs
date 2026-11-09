import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TessWorker} from '../tess-worker.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const params={family:'twist',sides:4,angle:36,scale:.5};
function worker(){return new TessWorker(path.join(root,'.venv/Scripts/python.exe'),[path.join(root,'backend/tessellate.py'),'--worker'],{env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});}
test('a real warm engine reuses its process, survives bad parameters and keeps each result independent',async()=>{
  const engine=worker();try{
    const first=await engine.run(params),pid=engine.child.pid;
    await assert.rejects(engine.run({...params,angle:0}),/旋转角/);
    const second=await engine.run({...params,angle:42});
    assert.equal(engine.child.pid,pid);
    assert.equal(first.stats.parameters.angle,36);assert.equal(second.stats.parameters.angle,42);
    assert.notDeepEqual(first.fold.vertices_coords,second.fold.vertices_coords);
    assert.equal(engine.busy,false);
  }finally{engine.stop();}
});
test('cancellation releases a job immediately, rejects concurrency and restarts the engine cleanly',async()=>{
  const engine=worker();try{
    const ctrl=new AbortController(),pending=engine.run(params,ctrl.signal),pid=engine.child.pid;
    await assert.rejects(engine.run(params),error=>error.status===429);
    ctrl.abort();await assert.rejects(pending,/取消/);assert.equal(engine.busy,false);
    const result=await engine.run(params);assert.notEqual(engine.child.pid,pid);assert.equal(result.stats.vertices,16);
    await assert.rejects(engine.run({payload:'x'.repeat(131072)}),error=>error.status===413);
    assert.equal((await engine.run(params)).stats.vertices,16);
  }finally{engine.stop();}
});
test('malformed worker output and a crashed process cannot poison the next request',async()=>{
  const engine=new TessWorker(process.execPath,['-e',`process.stdin.on('data',()=>process.stdout.write('broken\\n'));`]);
  try{await assert.rejects(engine.run(params),/格式异常/);assert.equal(engine.child,null);}finally{engine.stop();}
  const crashed=new TessWorker(process.execPath,['-e','process.exit(1)']);
  try{await assert.rejects(crashed.run(params),/退出|连接|发送/);assert.equal(crashed.busy,false);}finally{crashed.stop();}
});
