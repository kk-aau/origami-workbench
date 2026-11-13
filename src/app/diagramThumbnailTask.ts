import {preferenceStorage} from './preferenceStorage';
import {DIAGRAM_LINE_DEFAULTS_KEY} from './diagramLineStyles';
import {ADAPTIVE_LINE_STYLE_KEY} from './adaptiveLineStyle';

export interface DiagramThumbnailRequest {storedText:string;preferences?:[string,string|null][]}
export type DiagramThumbnailReply={type:'result';thumbnail:string|null}|{type:'error';message:string};

/** Only a visible card with no cached thumbnail needs the full legacy drawing.
 * Parsing, model validation and image-rich SVG generation stay off the UI. */
export function startDiagramThumbnailImport(storedText:string,
  factory:()=>Worker=()=>new Worker(new URL('../workers/diagramThumbnail.worker.ts',import.meta.url),{type:'module'})){
  let worker:Worker|undefined,settled=false,resolveTask!:(thumbnail:string|null)=>void,rejectTask!:(error:Error)=>void;
  const promise=new Promise<string|null>((resolve,reject)=>{resolveTask=resolve;rejectTask=reject;});
  const finish=(thumbnail:string|null,error?:Error)=>{if(settled)return;settled=true;worker?.terminate();if(error)rejectTask(error);else resolveTask(thumbnail);};
  try{
    worker=factory();
    worker.onmessage=(event:MessageEvent<DiagramThumbnailReply>)=>{
      if(settled)return;const reply=event.data;
      if(reply?.type==='result'&&(reply.thumbnail===null||typeof reply.thumbnail==='string'))finish(reply.thumbnail);
      else finish(null,new Error(reply?.type==='error'&&typeof reply.message==='string'?reply.message:'缩略图线程返回了无效数据。'));
    };
    worker.onerror=event=>finish(null,new Error(event.message||'缩略图线程异常。'));
    worker.onmessageerror=()=>finish(null,new Error('缩略图结果传输失败。'));
    const preferences:[string,string|null][]=[DIAGRAM_LINE_DEFAULTS_KEY,ADAPTIVE_LINE_STYLE_KEY].map(key=>{
      try{return [key,preferenceStorage.getItem(key)];}catch{return [key,null];}
    });
    worker.postMessage({storedText,preferences} satisfies DiagramThumbnailRequest);
  }catch(error){finish(null,error instanceof Error?error:new Error(String(error)));}
  return {promise,cancel(){finish(null,new DOMException('已取消读取缩略图。','AbortError'));}};
}
