import test from 'node:test';
import assert from 'node:assert/strict';
import {startDiagramThumbnailImport,type DiagramThumbnailReply,type DiagramThumbnailRequest} from '../../src/app/diagramThumbnailTask';
import {createDiagramProject,exportDiagramProject} from '../../src/app/diagramProject';
import {diagramLibraryThumbnail} from '../../src/app/diagramLibrary';
import {blankDoc} from '../../src/app/state';
import {deflateSync} from 'node:zlib';

function paddedPNG(){
  const crc32=(bytes:Buffer)=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
  const chunk=(kind:string,bytes:Buffer)=>{const result=Buffer.alloc(bytes.length+12);result.writeUInt32BE(bytes.length);result.write(kind,4,'ascii');bytes.copy(result,8);result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length-4);return result;};
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('tEXt',Buffer.concat([Buffer.from('note\0'),Buffer.alloc(125000,32)])),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}

function harness(){
  const worker={onmessage:null as ((event:{data:DiagramThumbnailReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
    sent:undefined as unknown,terminated:0,postMessage(data:unknown){this.sent=data;},terminate(){this.terminated++;}};
  return {worker,factory:()=>worker as unknown as Worker};
}
test('thumbnail task forwards immutable stored text and accepts complete large previews without a cache-size gate',async()=>{
  const h=harness(),task=startDiagramThumbnailImport('not parsed on UI',h.factory);
  assert.equal((h.worker.sent as DiagramThumbnailRequest).storedText,'not parsed on UI');
  const svg='<svg>'+('x'.repeat(160_000))+'</svg>';h.worker.onmessage!({data:{type:'result',thumbnail:svg}});
  assert.equal(await task.promise,svg);assert.equal(h.worker.terminated,1);
  const empty=harness(),emptyTask=startDiagramThumbnailImport('null thumbnail',empty.factory);empty.worker.onmessage!({data:{type:'result',thumbnail:null}});assert.equal(await emptyTask.promise,null);
});
test('cancellation terminates pending work and ignores a queued preview',async()=>{
  const h=harness(),task=startDiagramThumbnailImport('pending',h.factory);task.cancel();task.cancel();
  await assert.rejects(task.promise,{name:'AbortError'});h.worker.onmessage!({data:{type:'result',thumbnail:'late'}});assert.equal(h.worker.terminated,1);
});
test('worker creation, dispatch, validation and transport failures reject without publishing a preview',async()=>{
  const creation=startDiagramThumbnailImport('x',()=>{throw new Error('creation');});await assert.rejects(creation.promise,/creation/);
  for(const kind of ['dispatch','validation','thread','transport','invalid'] as const){
    const h=harness();if(kind==='dispatch')h.worker.postMessage=()=>{throw Error('dispatch');};
    const task=startDiagramThumbnailImport('x',h.factory);
    if(kind==='validation')h.worker.onmessage!({data:{type:'error',message:'invalid project'}});
    if(kind==='thread')h.worker.onerror!({message:'worker failed'});
    if(kind==='transport')h.worker.onmessageerror!();
    if(kind==='invalid')h.worker.onmessage!({data:{type:'result',thumbnail:5} as unknown as DiagramThumbnailReply});
    await assert.rejects(task.promise);assert.equal(h.worker.terminated,1);
  }
});
test('actual thumbnail Worker validates stored projects and renders the same null-cache fallback',async()=>{
  const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage,replies:DiagramThumbnailReply[]=[];
  try{
    scope.postMessage=(reply:DiagramThumbnailReply)=>replies.push(reply);
    await import('../../src/workers/diagramThumbnail.worker');
    const handle=scope.onmessage as (event:{data:DiagramThumbnailRequest})=>void;
    const project=createDiagramProject(blankDoc('缩略图兼容',100,100));
    handle({data:{storedText:JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project:JSON.parse(exportDiagramProject(project)),thumbnail:null})}});
    assert.deepEqual(replies.pop(),{type:'result',thumbnail:diagramLibraryThumbnail(project)});
    handle({data:{storedText:JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project:JSON.parse(exportDiagramProject(project)),thumbnail:'<svg>cached</svg>'})}});
    assert.deepEqual(replies.pop(),{type:'result',thumbnail:'<svg>cached</svg>'});
    const imageProject=structuredClone(project),dataUrl=paddedPNG();imageProject.steps[0].paperVisible=false;imageProject.steps[0].images=[{id:'large-preview',name:'大图片',dataUrl,pixelWidth:1,pixelHeight:1,position:[0,0],width:100,height:100,rotation:0,source:'file'}];
    handle({data:{storedText:JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project:JSON.parse(exportDiagramProject(imageProject)),thumbnail:null})}});
    const large=replies.pop();assert.equal(large?.type,'result');if(large?.type==='result'){assert.ok(large.thumbnail!.length>120000);assert.equal(large.thumbnail,diagramLibraryThumbnail(imageProject));assert.ok(large.thumbnail!.includes(dataUrl));}
    const raw=JSON.parse(exportDiagramProject(project));raw.states.at(-1).doc.paper.width=-1;
    handle({data:{storedText:JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project:raw,thumbnail:null})}});assert.equal(replies.pop()?.type,'error');
    handle({data:{storedText:'{broken'}});assert.equal(replies.pop()?.type,'error');
    handle({data:{storedText:JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project,thumbnail:'x'.repeat(120001)})}});assert.equal(replies.pop()?.type,'error');
  }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
