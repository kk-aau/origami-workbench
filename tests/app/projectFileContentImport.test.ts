import test from 'node:test';
import assert from 'node:assert/strict';
import {startProjectImport} from '../../src/app/projectImportTask';
import {blankDoc} from '../../src/app/state';

test('content-routed JSON reaches the real importer with full geometry and errors remain atomic',async()=>{
  const global=globalThis as any,oldMessage=global.onmessage,oldPost=global.postMessage;
  let active:any;
  try{
    await import('../../src/workers/projectImport.worker');
    const workerMessage=global.onmessage;
    global.postMessage=(data:unknown)=>queueMicrotask(()=>active.onmessage?.({data}));
    const run=(text:string)=>{
      active={onmessage:null,onerror:null,onmessageerror:null,terminate(){},postMessage(data:unknown){queueMicrotask(()=>void workerMessage({data}));}};
      return startProjectImport(new File([text],'任意名称.json'),true,()=>{},()=>active).promise;
    };
    const fold={vertices_coords:[[0,0],[100,0],[100,100],[0,100]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]],edges_assignment:['B','B','B','B','M']};
    const result=await run(JSON.stringify(fold));assert.equal(result.kind,'crease');
    if(result.kind==='crease'){assert.equal(result.doc.segments.length,5);assert.equal(result.doc.segments.filter(s=>s.assignment==='M').length,1);}
    const native=await run('\uFEFF'+JSON.stringify(blankDoc()));assert.equal(native.kind,'crease');
    await assert.rejects(run(JSON.stringify({...fold,edges_vertices:[...fold.edges_vertices.slice(0,4),[0,99]]})),/顶点|索引|范围/);
    await assert.rejects(run('{bad'));
  }finally{global.onmessage=oldMessage;global.postMessage=oldPost;}
});
