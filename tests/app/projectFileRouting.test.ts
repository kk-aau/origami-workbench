import assert from 'node:assert/strict';
import test from 'node:test';
import {projectFileKind,projectFileWorkspace,isProjectFileName,PROJECT_FILE_ACCEPT} from '../../src/app/projectFileRouting';
import {identifyProjectFile} from '../../src/app/projectFileRoutingTask';
import {installProjectFileDrop} from '../../src/app/projectFileDrop';

test('supported project extensions route independently of the current workspace',()=>{
  for(const [name,kind,workspace] of [
    ['作品.ZDS','diagram','diagram'],['作品.oriw','artwork','edit'],['设计.TMD5','design','design'],['设计.tmd4','design','design'],['设计.bps','design','design'],
    ...['zcp','fold','cp','opx','ori','orh'].map(ext=>['折痕.'+ext,'crease','edit']),
  ] as const){assert.equal(projectFileKind(name),kind);assert.equal(projectFileWorkspace(kind as any),workspace);assert.ok(isProjectFileName(name));}
  assert.ok(PROJECT_FILE_ACCEPT.includes('.tmd4'));assert.ok(!isProjectFileName('图片.png'));
  assert.throws(()=>projectFileKind('说明.txt'),/不支持/);
});

test('generic JSON is routed by the root content, not a name or a nested field',()=>{
  for(const [format,kind] of [['zhezhi-diagram','diagram'],['zhezhi-base-design','design'],['zhezhi-artwork','artwork'],['zhezhi-folded-model','model'],['zhezhi-model-collection','models'],['zhezhi-curve-design','curve']] as const){
    assert.equal(projectFileKind('任意名称.json',{format}),kind);
  }
  assert.equal(projectFileKind('a.json',{design:{tree:{},layout:{}}}),'design');
  assert.equal(projectFileKind('a.json',{paper:{},segments:[],metadata:{curveDesign:{}}}),'curve');
  assert.equal(projectFileKind('a.json',{paper:{},segments:[],metadata:{tessellation:{parameters:{}}}}),'crease','adopted tessellation CP remains editable CP');
  assert.equal(projectFileKind('a.json',{paper:{},segments:[],metadata:{text:'"format":"zhezhi-diagram"'}}),'crease');
  assert.equal(projectFileKind('a.json',{vertices_coords:[],edges_vertices:[]}),'crease');
  assert.throws(()=>projectFileKind('a.json',{payload:{format:'zhezhi-diagram'}}),/无法识别/);
  assert.throws(()=>projectFileKind('a.json',{format:'zhezhi-tool-layout'}),/无法识别/);
});

test('JSON identification uses a worker, releases it, and ignores replies after cancellation',async()=>{
  const original=globalThis.Worker,workers:any[]=[];
  class MockWorker {onmessage:any;onerror:any;onmessageerror:any;terminated=0;posted:any;constructor(){workers.push(this);}terminate(){this.terminated++;}postMessage(value:any){this.posted=value;}}
  try{
    globalThis.Worker=MockWorker as any;
    assert.equal(await identifyProjectFile(new File(['{}'],'a.zds')),'diagram');assert.equal(workers.length,0);
    const file=new File(['{"format":"zhezhi-diagram"}'],'a.json'),pending=identifyProjectFile(file);
    assert.equal(workers[0].posted,file);workers[0].onmessage({data:{kind:'diagram'}});
    assert.equal(await pending,'diagram');assert.equal(workers[0].terminated,1);
    const abort=new AbortController(),cancelled=identifyProjectFile(file,abort.signal),worker=workers[1];
    abort.abort();await assert.rejects(cancelled,{name:'AbortError'});worker.onmessage({data:{kind:'design'}});assert.equal(worker.terminated,1);
    for(const failure of ['invalid','runtime','transfer']){
      const p=identifyProjectFile(file),w=workers.at(-1);
      if(failure==='invalid')w.onmessage({data:{kind:'wrong'}});
      if(failure==='runtime')w.onerror({message:'failed'});
      if(failure==='transfer')w.onmessageerror();
      await assert.rejects(p);assert.equal(w.terminated,1);
    }
  }finally{globalThis.Worker=original;}
});

test('real routing worker reads JSON and reports malformed files without publishing a project',async()=>{
  const globals=globalThis as any,previous={self:globals.self,onmessage:globals.onmessage,postMessage:globals.postMessage},replies:any[]=[];
  try{
    globals.self=globals;globals.postMessage=(value:any)=>replies.push(value);
    await import('../../src/workers/projectFileRouting.worker');
    await globals.onmessage({data:new File(['\uFEFF{"format":"zhezhi-diagram"}'],'任意.json')});
    assert.deepEqual(replies.shift(),{kind:'diagram'});
    await globals.onmessage({data:new File(['{bad'],'坏.json')});assert.match(replies.shift().error,/有效的 JSON/);
    await globals.onmessage({data:new File(['{"unknown":true}'],'其它.json')});assert.match(replies.shift().error,/无法识别/);
  }finally{Object.assign(globals,previous);}
});

test('external project drops are consumed once; internal drags and image imports are preserved',()=>{
  const target=new EventTarget(),received:File[][]=[],errors:string[]=[],hover:boolean[]=[];
  const off=installProjectFileDrop(target as unknown as Window,files=>received.push(files),value=>hover.push(value),value=>errors.push(value));
  let downstream=0;target.addEventListener('drop',()=>downstream++);
  const fire=(type:string,types:string[],files:File[]=[])=>{
    const e=new Event(type,{cancelable:true});Object.defineProperty(e,'dataTransfer',{value:{types,files,dropEffect:'none'}});target.dispatchEvent(e);return e;
  };
  assert.equal(fire('drop',['application/x-zhezhi-document']).defaultPrevented,false);assert.equal(downstream,1);
  assert.equal(fire('dragenter',['Files']).defaultPrevented,true);assert.equal(hover.at(-1),true);
  const a=new File(['{}'],'a.zds'),b=new File(['{}'],'b.bps');
  assert.equal(fire('drop',['Files'],[a,b]).defaultPrevented,true);assert.deepEqual(received,[[a,b]]);assert.equal(downstream,1);assert.equal(hover.at(-1),false);
  fire('drop',['Files'],[new File([''],'image.png',{type:'image/png'})]);assert.equal(downstream,2);
  fire('drop',['Files'],[new File([''],'unknown.exe')]);assert.equal(errors.length,1);assert.equal(downstream,2);
  off();fire('drop',['Files'],[a]);assert.equal(received.length,1);assert.equal(downstream,3);
});
