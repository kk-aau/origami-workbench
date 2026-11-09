import type {DiagramProject} from './diagramProject';

export type DiagramProjectImportReply={type:'progress';message:string}|{type:'result';project:DiagramProject}|{type:'error';message:string};

/** Send the immutable file handle; reading, validation and normalization all
 * run in the worker. Terminating it cancels even synchronous geometry work. */
export function startDiagramProjectImport(file:File,onProgress:(message:string)=>void=()=>{},factory:()=>Worker=()=>new Worker(new URL('../workers/diagramProjectImport.worker.ts',import.meta.url),{type:'module'})){
  const worker=factory();let done=false,rejectTask!:(error:Error)=>void;
  const promise=new Promise<DiagramProject>((resolve,reject)=>{
    rejectTask=reject;
    const fail=(error:Error)=>{if(done)return;done=true;worker.terminate();reject(error);};
    worker.onmessage=(event:MessageEvent<DiagramProjectImportReply>)=>{
      if(done)return;
      const reply=event.data;
      if(reply?.type==='progress'){onProgress(reply.message);return;}
      if(reply?.type==='result'&&reply.project){done=true;worker.terminate();resolve(reply.project);}
      else fail(new Error(reply?.type==='error'?reply.message:'工程加载返回了无效消息。'));
    };
    worker.onerror=event=>fail(new Error(event.message||'工程加载线程异常。'));
    worker.onmessageerror=()=>fail(new Error('工程加载结果传输失败。'));
    try{worker.postMessage(file);}catch(error){fail(error instanceof Error?error:new Error(String(error)));}
  });
  return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(new DOMException('已取消打开工程。','AbortError'));}};
}
