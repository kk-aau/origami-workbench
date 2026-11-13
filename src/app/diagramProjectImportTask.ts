import type {DiagramProject} from './diagramProject';
import {createArtworkTransferReceiver,type ArtworkTransferOperation} from './artworkImportTransfer';
import {registerDiagramProjectSaveBlob} from './diagramProjectTransport';

export type DiagramProjectImportReply={type:'progress';message:string}|{type:'error';message:string}
  |{type:'diagram-begin';saveBlob:Blob}|{type:'diagram-chunk';index:number;operations:ArtworkTransferOperation[]}|{type:'diagram-complete';chunks:number};
export type DiagramProjectImportInput=File|{storedText:string};
export type DiagramProjectImportRequest=DiagramProjectImportInput|{type:'continue-diagram'};

/** Send the immutable file handle; reading, validation and normalization all
 * run in the worker. Terminating it cancels even synchronous geometry work. */
export function startDiagramProjectImport(file:DiagramProjectImportInput,onProgress:(message:string)=>void=()=>{},factory:()=>Worker=()=>new Worker(new URL('../workers/diagramProjectImport.worker.ts',import.meta.url),{type:'module'})){
  let worker:Worker|undefined,done=false,rejectTask!:(error:Error)=>void;
  let incoming:{receiver:ReturnType<typeof createArtworkTransferReceiver>;chunks:number;saveBlob:Blob;lastProgress:number}|undefined;
  const promise=new Promise<DiagramProject>((resolve,reject)=>{
    rejectTask=reject;
    const fail=(error:Error)=>{if(done)return;done=true;incoming=undefined;worker?.terminate();reject(error);};
    try{
      worker=factory();
      worker.onmessage=(event:MessageEvent<DiagramProjectImportReply>)=>{
        if(done)return;
        try{
          const reply=event.data;
          if(reply?.type==='progress'){onProgress(reply.message);return;}
          if(reply?.type==='diagram-begin'){
            if(incoming||!(reply.saveBlob instanceof Blob)||reply.saveBlob.type!=='application/json'||!reply.saveBlob.size)throw Error('折序工程分批准备数据无效，当前工程未替换。');
            incoming={receiver:createArtworkTransferReceiver(),chunks:0,saveBlob:reply.saveBlob,lastProgress:0};
            worker!.postMessage({type:'continue-diagram'});return;
          }
          if(reply?.type==='diagram-chunk'){
            if(!incoming||reply.index!==incoming.chunks)throw Error('折序工程分批数据顺序错误，当前工程未替换。');
            incoming.receiver.receive(reply.operations);incoming.chunks++;
            const now=performance.now();
            // ACK every bounded chunk, but do not rerender a large old canvas
            // for every tiny transfer while the new drawing remains detached.
            if(incoming.chunks===1||now-incoming.lastProgress>=80){incoming.lastProgress=now;onProgress(`正在接收折序工程（第 ${incoming.chunks.toLocaleString()} 批）`);}
            worker!.postMessage({type:'continue-diagram'});return;
          }
          if(reply?.type==='diagram-complete'){
            if(!incoming||!Number.isSafeInteger(reply.chunks)||reply.chunks<1||reply.chunks!==incoming.chunks)throw Error('折序工程尚未接收完整，当前工程未替换。');
            const project=incoming.receiver.finish() as DiagramProject;
            // Full codec, CP normalization and drawing preparation ran in the
            // owned Worker. Check the transfer envelope without repeating them.
            if(!project||project.format!=='zhezhi-diagram'||project.version!==1||typeof project.name!=='string'||!Array.isArray(project.states)||!Array.isArray(project.steps)||!project.steps.length||project.states.length!==project.steps.length+1||typeof project.activeStepId!=='string')throw Error('折序工程准备结果不完整，当前工程未替换。');
            registerDiagramProjectSaveBlob(project,incoming.saveBlob);incoming=undefined;
            done=true;worker!.terminate();resolve(project);return;
          }
          throw Error(reply?.type==='error'?reply.message:'工程加载返回了无效消息。');
        }catch(error){fail(error instanceof Error?error:new Error(String(error)));}
      };
      worker.onerror=event=>fail(new Error(event.message||'工程加载线程异常。'));
      worker.onmessageerror=()=>fail(new Error('工程加载结果传输失败。'));
      worker.postMessage(file);
    }catch(error){fail(error instanceof Error?error:new Error(String(error)));}
  });
  return {promise,cancel(){if(done)return;done=true;incoming=undefined;worker?.terminate();rejectTask(new DOMException('已取消打开工程。','AbortError'));}};
}
