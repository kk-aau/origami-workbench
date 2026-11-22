import type {DiagramProject} from './diagramProject';

/** Preserve the existing full export validation without blocking the canvas or
 * returning a second, unused copy of the serialized project to the UI. */
export function validateDiagramZoomProject(project:DiagramProject,signal:AbortSignal,onProgress:(message:string)=>void):Promise<void>{
  return new Promise((resolve,reject)=>{
    let worker:Worker|undefined,done=false;
    const finish=(error?:Error)=>{
      if(done)return;done=true;
      signal.removeEventListener('abort',cancel);worker?.terminate();
      if(error)reject(error);else resolve();
    };
    const cancel=()=>finish(new DOMException('已取消应用放大区域。','AbortError'));
    if(signal.aborted){cancel();return;}
    signal.addEventListener('abort',cancel,{once:true});
    try{
      worker=new Worker(new URL('../workers/diagramZoomValidation.worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=event=>{
        if(done)return;
        const reply=event.data;
        if(reply?.type==='progress'&&typeof reply.message==='string')onProgress(reply.message);
        else if(reply?.type==='complete')finish();
        else finish(new Error(reply?.type==='error'&&typeof reply.message==='string'?reply.message:'放大区域校验返回了无效结果。'));
      };
      worker.onerror=event=>finish(new Error(event.message||'放大区域校验线程异常，请重试。'));
      worker.onmessageerror=()=>finish(new Error('无法读取放大区域校验结果。'));
      worker.postMessage(project);
    }catch(error){finish(error instanceof Error?error:new Error(String(error)));}
  });
}
