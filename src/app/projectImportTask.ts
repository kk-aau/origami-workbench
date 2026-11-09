import type {Doc} from '../core/types';
import {PROJECT_IMPORT_CHUNK,type ProjectImportResult,type ProjectImportReply,type ProjectImportRequest,type SavedProjectImportInfo} from './projectImportProtocol';
export {PROJECT_IMPORT_CHUNK,type ProjectImportResult,type ProjectImportReply,type SavedProjectImportInfo} from './projectImportProtocol';
export interface ProjectImportTask {promise:Promise<ProjectImportResult>;cancel():void}

/** Parsing and intersection splitting are isolated so a large import can be cancelled. */
export function startProjectImport(file:File,prepare:boolean|Doc=true,onStage?:(message:string)=>void,
  factory:()=>Worker=()=>new Worker(new URL('../workers/projectImport.worker.ts',import.meta.url),{type:'module'}),appendPlacement?:'beside'):ProjectImportTask {
  return startImport({file,prepare,...(appendPlacement?{appendPlacement}:{})},onStage,factory);
}

/** Pass raw HTTP text, never a structured-cloned million-segment document. */
export function startSavedProjectImport(text:string,onStage?:(message:string)=>void,
  factory:()=>Worker=()=>new Worker(new URL('../workers/projectImport.worker.ts',import.meta.url),{type:'module'})):ProjectImportTask {
  return startImport({type:'prepare-saved-project',text},onStage,factory);
}

function startImport(request:ProjectImportRequest,onStage:((message:string)=>void)|undefined,factory:()=>Worker):ProjectImportTask {
  const savedRequest='type' in request;
  const validSavedInfo=(value:SavedProjectImportInfo|undefined)=>!!value&&typeof value.draft==='boolean'&&typeof value.revision==='string'&&!!value.revision.trim()
    &&typeof value.sourceSignature==='string'&&typeof value.preparedSignature==='string'&&typeof value.upgraded==='boolean';
  let worker:Worker|undefined,settled=false;
  let incoming:{doc:Doc;count:number;warnings:string[];savedProject?:SavedProjectImportInfo}|undefined;
  let resolve!:(result:ProjectImportResult)=>void,reject!:(error:Error)=>void;
  const promise=new Promise<ProjectImportResult>((yes,no)=>{resolve=yes;reject=no;});
  const finish=(result?:ProjectImportResult,error?:Error)=>{
    if(settled)return;settled=true;worker?.terminate();
    if(error){incoming=undefined;reject(error);}else resolve(result!);
  };
  try {
    worker=factory();
    worker.onmessage=(event:MessageEvent<ProjectImportReply>)=>{
      if(settled)return;
      const reply=event.data;
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
