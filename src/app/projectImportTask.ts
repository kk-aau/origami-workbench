import type {Doc} from '../core/types';
import {PROJECT_IMPORT_CHUNK,validSavedProjectHead,type ProjectImportResult,type ProjectImportReply,type ProjectImportRequest,type SavedProjectImportInfo} from './projectImportProtocol';
import {createArtworkTransferReceiver} from './artworkImportTransfer';
import {registerPreparedArtworkImport,type PreparedArtworkImport} from './artworkImportPreparation';
import {registerPreparedEditorImport,type PreparedEditorImportData} from './editorImportPreparation';
export {PROJECT_IMPORT_CHUNK,type ProjectImportResult,type ProjectImportReply,type SavedProjectImportInfo} from './projectImportProtocol';
export interface ProjectImportTask {promise:Promise<ProjectImportResult>;cancel():void}

/** Parsing and intersection splitting are isolated so a large import can be cancelled. */
export function startProjectImport(file:File,prepare:boolean|Doc=true,onStage?:(message:string)=>void,
  factory:()=>Worker=()=>new Worker(new URL('../workers/projectImport.worker.ts',import.meta.url),{type:'module'}),appendPlacement?:'beside'):ProjectImportTask {
  return startImport({file,prepare,...(appendPlacement?{appendPlacement}:{})},onStage,factory);
}

/** Pass raw HTTP text, never a structured-cloned million-segment document. */
export function startSavedProjectImport(text:string|Blob,onStage?:(message:string)=>void,
  factory:()=>Worker=()=>new Worker(new URL('../workers/projectImport.worker.ts',import.meta.url),{type:'module'})):ProjectImportTask {
  return startImport({type:'prepare-saved-project',text},onStage,factory);
}

/** Recovery uses the same Worker preparation and bounded transfer as a file. */
export function startArtworkImport(text:string,onStage?:(message:string)=>void,
  factory:()=>Worker=()=>new Worker(new URL('../workers/projectImport.worker.ts',import.meta.url),{type:'module'})):ProjectImportTask {
  return startImport({type:'prepare-artwork',text},onStage,factory);
}

function startImport(request:ProjectImportRequest,onStage:((message:string)=>void)|undefined,factory:()=>Worker):ProjectImportTask {
  const savedRequest='type' in request&&request.type==='prepare-saved-project';
  const validSavedInfo=(value:SavedProjectImportInfo|undefined)=>!!value&&typeof value.draft==='boolean'&&validSavedProjectHead(value)
    &&typeof value.sourceSignature==='string'&&typeof value.preparedSignature==='string'&&typeof value.upgraded==='boolean';
  let worker:Worker|undefined,settled=false;
  let incoming:{doc:Doc;count:number;warnings:string[];savedProject?:SavedProjectImportInfo}|undefined;
  let editor:{receiver:ReturnType<typeof createArtworkTransferReceiver>;chunks:number;lastStage:number}|undefined;
  let artwork:{receiver:ReturnType<typeof createArtworkTransferReceiver>;chunks:number;lastStage:number;diagramSaveBlob?:Blob}|undefined;
  let resolve!:(result:ProjectImportResult)=>void,reject!:(error:Error)=>void;
  const promise=new Promise<ProjectImportResult>((yes,no)=>{resolve=yes;reject=no;});
  const finish=(result?:ProjectImportResult,error?:Error)=>{
    if(settled)return;settled=true;worker?.terminate();
    incoming=undefined;editor=undefined;artwork=undefined;
    if(error)reject(error);else resolve(result!);
  };
  try {
    worker=factory();
    worker.onmessage=(event:MessageEvent<ProjectImportReply>)=>{
      if(settled)return;
      const reply=event.data;
      if(!reply||typeof reply!=='object'){finish(undefined,new Error('导入线程返回了无效消息，当前工程未替换。'));return;}
      if(reply.type==='editor-begin'){
        if(incoming||editor||artwork){finish(undefined,new Error('折痕工程分批准备顺序无效，当前工程未替换。'));return;}
        editor={receiver:createArtworkTransferReceiver(),chunks:0,lastStage:0};
        try{worker!.postMessage({type:'continue-editor'});}catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(reply.type==='editor-chunk'){
        try{
          if(!editor||reply.index!==editor.chunks)throw Error('折痕工程分批传输顺序错误，当前工程未替换。');
          editor.receiver.receive(reply.operations);editor.chunks++;
          const now=performance.now();
          if(editor.chunks===1||now-editor.lastStage>=80){editor.lastStage=now;onStage?.(`正在接收完整折痕工程（第 ${editor.chunks.toLocaleString()} 批）`);}
          worker!.postMessage({type:'continue-editor'});
        }catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(reply.type==='editor-complete'){
        try{
          if(!editor||!Number.isSafeInteger(reply.chunks)||reply.chunks<1||reply.chunks!==editor.chunks)throw Error('折痕工程尚未接收完整，当前工程未替换。');
          const value=editor.receiver.finish() as PreparedEditorImportData;
          if(savedRequest&&!validSavedInfo(value?.savedProject))throw Error('本地工程准备信息不完整，当前工程未替换。');
          registerPreparedEditorImport(value);
          finish({kind:'crease',doc:value.doc,warnings:value.warnings,...(value.savedProject?{savedProject:value.savedProject}:{})});
        }catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(editor&&reply.type!=='stage'&&reply.type!=='error'){finish(undefined,new Error('折痕工程分批传输尚未完成，当前工程未替换。'));return;}
      if(reply.type==='artwork-begin'){
        if(savedRequest||incoming||artwork){finish(undefined,new Error('完整作品分批准备顺序无效，当前作品未替换。'));return;}
        if(reply.diagramSaveBlob!==undefined&&(!(reply.diagramSaveBlob instanceof Blob)||reply.diagramSaveBlob.type!=='application/json'||!reply.diagramSaveBlob.size)){
          finish(undefined,new Error('完整作品的绘图保存数据无效，当前作品未替换。'));return;
        }
        artwork={receiver:createArtworkTransferReceiver(),chunks:0,lastStage:0,diagramSaveBlob:reply.diagramSaveBlob};
        try{worker!.postMessage({type:'continue-artwork'});}catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(reply.type==='artwork-chunk'){
        try{
          if(!artwork||reply.index!==artwork.chunks)throw new Error('完整作品分批传输顺序无效，当前作品未替换。');
          artwork.receiver.receive(reply.operations);artwork.chunks++;
          const now=performance.now();
          // Do not re-render the old, potentially large live canvas for every
          // tiny transfer. ACKs still flow immediately; only progress is coalesced.
          if(artwork.chunks===1||now-artwork.lastStage>=80){artwork.lastStage=now;onStage?.(`正在接收完整作品（第 ${artwork.chunks.toLocaleString()} 批）`);}
          worker!.postMessage({type:'continue-artwork'});
        }catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(reply.type==='artwork-complete'){
        try{
          if(!artwork||!Number.isSafeInteger(reply.chunks)||reply.chunks!==artwork.chunks)throw new Error('完整作品尚未接收完整，当前作品未替换。');
          const project=registerPreparedArtworkImport(artwork.receiver.finish() as PreparedArtworkImport,artwork.diagramSaveBlob);artwork=undefined;
          finish({kind:'artwork',project});
        }catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(artwork&&reply.type!=='stage'&&reply.type!=='error'){finish(undefined,new Error('完整作品分批传输尚未完成，当前作品未替换。'));return;}
      if(reply.type==='crease-begin'){
        if(incoming||!Number.isSafeInteger(reply.count)||reply.count<0){finish(undefined,new Error('导入线段数量无效，当前工程未替换。'));return;}
        if(savedRequest&&!validSavedInfo(reply.savedProject)){finish(undefined,new Error('本地工程准备信息不完整，当前工程未替换。'));return;}
        incoming={doc:{...reply.doc,segments:[]},count:reply.count,warnings:reply.warnings,...(reply.savedProject?{savedProject:reply.savedProject}:{})};
        try{worker!.postMessage({type:'continue-crease'});}catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(reply.type==='crease-segments'){
        if(!incoming||reply.offset!==incoming.doc.segments.length||!Array.isArray(reply.segments)||!reply.segments.length||reply.segments.length>PROJECT_IMPORT_CHUNK||reply.offset+reply.segments.length>incoming.count){finish(undefined,new Error('导入线段不完整或顺序错误，当前工程未替换。'));return;}
        for(const segment of reply.segments)incoming.doc.segments.push(segment);
        onStage?.(`正在接收完整折痕 ${incoming.doc.segments.length.toLocaleString()} / ${incoming.count.toLocaleString()}`);
        try{worker!.postMessage({type:'continue-crease'});}catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}return;
      }
      if(reply.type==='crease-complete'){
        if(!incoming||incoming.doc.segments.length!==incoming.count){finish(undefined,new Error('导入线段未接收完整，当前工程未替换。'));return;}
        finish({kind:'crease',doc:incoming.doc,warnings:incoming.warnings,...(incoming.savedProject?{savedProject:incoming.savedProject}:{})});incoming=undefined;return;
      }
      if(incoming&&reply.type==='result'){finish(undefined,new Error('导入线程未完成分批传输，当前工程未替换。'));return;}
      if(reply.type==='stage')onStage?.(reply.message);
      else if(reply.type==='result'){
        if(reply.result.kind==='artwork'){finish(undefined,new Error('完整作品没有经过后台完整准备，当前作品未替换。'));return;}
        if(savedRequest&&(reply.result.kind!=='crease'||!validSavedInfo(reply.result.savedProject))){finish(undefined,new Error('本地工程准备信息不完整，当前工程未替换。'));return;}
        finish(reply.result);
      }
      else finish(undefined,new Error(reply.message));
    };
    worker.onerror=event=>finish(undefined,new Error(`导入线程异常：${event.message||'请检查可用内存并重试。'}`));
    worker.onmessageerror=()=>finish(undefined,new Error('无法读取导入结果，当前工程未替换。'));
    worker.postMessage(request);
  }catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}
  return {promise,cancel:()=>finish(undefined,new DOMException('已取消导入。','AbortError'))};
}
