import {projectFileKind,type ProjectFileKind} from './projectFileRouting';

export async function identifyProjectFile(file:File,signal?:AbortSignal):Promise<ProjectFileKind>{
  signal?.throwIfAborted();
  if(!/\.json$/i.test(file.name))return projectFileKind(file.name);
  // Never parse a large generic JSON project on the UI thread just to route it.
  return new Promise((resolve,reject)=>{
    let worker:Worker|undefined,done=false;
    const finish=(kind?:ProjectFileKind,error?:Error)=>{
      if(done)return;done=true;worker?.terminate();signal?.removeEventListener('abort',cancel);
      if(error)reject(error);else resolve(kind!);
    };
    const cancel=()=>finish(undefined,new DOMException('已取消识别工程文件。','AbortError'));
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    try{
      worker=new Worker(new URL('../workers/projectFileRouting.worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=event=>{
        const value=event.data;
        if(['crease','diagram','design','artwork','curve','model','models'].includes(value?.kind))finish(value.kind);
        else finish(undefined,new Error(typeof value?.error==='string'?value.error:'文件类型识别结果无效。'));
      };
      worker.onerror=event=>finish(undefined,new Error(event.message||'文件类型识别线程异常。'));
      worker.onmessageerror=()=>finish(undefined,new Error('无法读取文件类型识别结果。'));
      worker.postMessage(file);
    }catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}
  });
}
