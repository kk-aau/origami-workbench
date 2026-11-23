import type {DiagramProject} from './diagramProject';
import {createArtworkTransferReceiver,type ArtworkTransferOperation} from './artworkImportTransfer';
import {originalDiagramFileNames,registerDiagramProjectSaveBlob} from './diagramProjectTransport';
import {recordActivity} from './activityLog';
import {diagramFileCaptionEdits,type DiagramCaptionEdits} from './diagramProjectContent';

export interface DiagramOpenTiming {stage:string;durationMs:number;count?:number;detail?:boolean}
export interface DiagramOpenPreview {stepId:string;svg:string}

export type DiagramProjectImportReply={type:'progress';message:string}|{type:'error';message:string}
  |({type:'preview'}&DiagramOpenPreview)
  |{type:'diagram-begin';saveBlob:Blob}|{type:'diagram-chunk';index:number;operations:ArtworkTransferOperation[]}|{type:'diagram-complete';chunks:number;storedName?:string;timings?:DiagramOpenTiming[]};
export type DiagramProjectImportInput=File|{storedText:string};
export type DiagramProjectImportRequest=DiagramProjectImportInput|{type:'continue-diagram'}|{type:'export-diagram-file';project:DiagramProject}|{type:'export-captions';source:Blob;edits:DiagramCaptionEdits};

/** Use the import worker for file preparation too, so the native receipt binds
 * both operations to the exact same compiled geometry and drawing code. */
export async function exportDesktopDiagramFile(project:DiagramProject,reuse?:{source:Blob;base:DiagramProject}):Promise<string>{
  const worker=new Worker(new URL('../workers/diagramProjectImport.worker.ts',import.meta.url),{type:'module'});
  const start=performance.now();
  try{
    return await new Promise<string>((resolve,reject)=>{
      worker.onerror=event=>reject(Error(event.message||'折序工程保存线程异常。'));
      worker.onmessageerror=()=>reject(Error('折序工程保存结果传输失败。'));
      worker.onmessage=event=>{
        if(event.data?.type==='needs-full-export'){worker.postMessage({type:'export-diagram-file',project});return;}
        if(event.data?.type==='diagram-file'&&typeof event.data.text==='string'){
          recordActivity('diagram.save.stage',{stage:'工程编码',method:event.data.reused?'复用已验证的纸层与折痕':'完整准备',durationMs:Math.round(performance.now()-start)});
          resolve(event.data.text);
        }
        else reject(Error(event.data?.message||'折序工程保存结果无效。'));
      };
      const edits=reuse&&diagramFileCaptionEdits(reuse.base,project);
      worker.postMessage(edits?{type:'export-captions',edits,source:reuse!.source}:{type:'export-diagram-file',project});
    });
  }finally{worker.terminate();}
}

/** Send the immutable file handle; reading, validation and normalization all
 * run in the worker. Terminating it cancels even synchronous geometry work. */
export function startDiagramProjectImport(file:DiagramProjectImportInput,onProgress:(message:string)=>void=()=>{},factory:()=>Worker=()=>new Worker(new URL('../workers/diagramProjectImport.worker.ts',import.meta.url),{type:'module'}),onPreview?:(preview:DiagramOpenPreview)=>void){
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
          if(reply?.type==='preview'){
            if(typeof reply.stepId!=='string'||typeof reply.svg!=='string'||reply.svg.length>2*1024*1024||!reply.svg.startsWith('<svg'))throw Error('折序预览数据无效。');
            onPreview?.({stepId:reply.stepId,svg:reply.svg});return;
          }
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
            if(reply.storedName!==undefined)originalDiagramFileNames.set(project,reply.storedName);
            registerDiagramProjectSaveBlob(project,incoming.saveBlob);incoming=undefined;
            for(const timing of reply.timings??[])recordActivity('diagram.open.stage',{...timing});
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
