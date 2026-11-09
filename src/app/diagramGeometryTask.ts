import type {DiagramGeometryKind,DiagramGeometryArgs,DiagramGeometryResult} from './diagramGeometryOperations';
/** No default timeout. Termination also interrupts synchronous geometry loops. */
export function startDiagramGeometry<K extends DiagramGeometryKind>(kind:K,args:DiagramGeometryArgs<K>,onProgress?:(operations:number)=>void){
  let worker:Worker|undefined,done=false,rejectTask!:(error:Error)=>void;
  const finish=()=>{if(done)return false;done=true;worker?.terminate();return true;};
  const promise=new Promise<DiagramGeometryResult<K>>((resolve,reject)=>{
    rejectTask=reject;
    try{
      worker=new Worker(new URL('../workers/diagramGeometry.worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=event=>{
        if(done)return;
        if(event.data.type==='progress'){onProgress?.(event.data.operations);return;}
        if(event.data.type==='result'){if(finish())resolve(event.data.value);}
        else if(finish())reject(Error(event.data.message||'折序几何计算返回了无效结果。'));
      };
      worker.onerror=event=>{if(finish())reject(Error(event.message||'折序几何计算线程异常。'));};
      worker.onmessageerror=()=>{if(finish())reject(Error('无法读取折序几何计算结果。'));};
      worker.postMessage({kind,args});
    }catch(error){if(finish())reject(error instanceof Error?error:Error(String(error)));}
  });
  return {promise,cancel(){if(finish())rejectTask(new DOMException('已停止折序几何计算。','AbortError'));}};
}
