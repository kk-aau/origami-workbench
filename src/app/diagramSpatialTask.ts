import type {createDiagramSpatialPose,reprojectDiagramSpatialPose,DiagramSpatialPose} from './diagramSpatialPose';
import type {DiagramPose} from './diagramProject';
import type {SpatialLayerRequest} from './diagramSpatialLayerSolver';
import {restoreDiagramSpatialError} from './diagramSpatialDiagnostic';

export function startDiagramSpatialLayerAdjustment(pose:DiagramPose,request:SpatialLayerRequest,history:readonly DiagramPose[]=[]){
 const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});let done=false,rejectTask!:(error:Error)=>void;
 const promise=new Promise<{result:DiagramPose['result'];spatial:DiagramSpatialPose}>((resolve,reject)=>{rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(restoreDiagramSpatialError(event.data.message,event.data.diagnostic));};worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'立体层序求解失败。'));};worker.postMessage({mode:'layers',pose,request,history});});
 return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消立体层序求解。'));}};
}

/** One worker and one verified model per orbit mode. Frame, commit and sync
 * requests are serialized; the component keeps only the latest mouse frame.
 * Closing immediately terminates active work and rejects every queued caller. */
export function createDiagramSpatialPreviewSession(pose:DiagramPose,history:readonly DiagramPose[]=[],drawingRotation=0){
 const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});
 type Request={message:unknown;resolve:(value:unknown)=>void;reject:(error:Error)=>void};
 let closed=false,current:Request|undefined;const queue:Request[]=[];
 const pump=()=>{if(closed||current||!queue.length)return;current=queue.shift()!;try{worker.postMessage(current.message);}catch(cause){const failed=current;current=undefined;failed.reject(cause instanceof Error?cause:Error('视角请求发送失败。'));pump();}};
 const send=<T>(message:unknown)=>new Promise<T>((resolve,reject)=>{if(closed){reject(Error('视角预览已关闭。'));return;}queue.push({message,resolve:value=>resolve(value as T),reject});pump();});
 const stop=(error:Error)=>{if(closed)return;closed=true;worker.terminate();const pending=current;current=undefined;pending?.reject(error);for(const request of queue.splice(0))request.reject(error);};
 worker.onmessage=event=>{if(closed||!current)return;const request=current;current=undefined;event.data.ok?request.resolve(event.data.value):request.reject(restoreDiagramSpatialError(event.data.message,event.data.diagnostic));pump();};
 worker.onerror=event=>stop(Error(event.message||'视角预览失败。'));
 const ready=send<void>({mode:'preview-init',pose,history,drawingRotation});ready.catch(()=>{});
 // A failed initialization must fail later requests as well, while allowing
 // ordinary per-camera diagnostic failures to be corrected in the same mode.
 ready.catch(cause=>stop(cause instanceof Error?cause:Error('视角模型初始化失败。')));
 return {ready,frame:(camera:DiagramSpatialPose['camera'])=>send<string>({mode:'preview-frame',camera}),
  sync:(pose:DiagramPose,history:readonly DiagramPose[]=[],drawingRotation=0)=>send<void>({mode:'preview-sync',pose,history,drawingRotation}),
  project:(camera:DiagramSpatialPose['camera'])=>send<ReturnType<typeof reprojectDiagramSpatialPose>>({mode:'preview-project',camera}),
  close(){stop(Error('已取消视角预览。'));}};
}
/** Spatial geometry and overlap arrangement remain cancellable off the UI thread. */
export function startDiagramSpatialPose(args:Parameters<typeof createDiagramSpatialPose>,history:readonly (DiagramPose|null|undefined)[]=[]){
  const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});
  let rejectTask:(reason:Error)=>void=()=>{},done=false;
  const promise=new Promise<ReturnType<typeof createDiagramSpatialPose>>((resolve,reject)=>{
    rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(restoreDiagramSpatialError(event.data.message,event.data.diagnostic));};
    worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'空间折叠计算失败。'));};
    worker.postMessage({args,history});
  });
  return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消空间折叠计算。'));}};
}

/** Changing the camera reuses the verified folded paper; it does not solve new fold angles. */
export function startDiagramSpatialReprojection(pose:DiagramPose,camera:DiagramSpatialPose['camera'],history:readonly DiagramPose[]=[]){
  const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});
  let rejectTask:(reason:Error)=>void=()=>{},done=false;
  const promise=new Promise<ReturnType<typeof reprojectDiagramSpatialPose>>((resolve,reject)=>{
    rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(restoreDiagramSpatialError(event.data.message,event.data.diagnostic));};
    worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'空间视角更新失败。'));};
    worker.postMessage({mode:'camera',pose,camera,history});
  });
  return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消视角更新。'));}};
}

/** Orbit frames use the same projected overlap regions as the saved drawing.
 * Work stays cancellable off the UI thread; no unverified depth preview. */
export function startDiagramSpatialPreview(pose:DiagramPose,camera:DiagramSpatialPose['camera'],history:readonly DiagramPose[]=[],drawingRotation=0){
 const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});let done=false,rejectTask!:(error:Error)=>void;
 const promise=new Promise<string>((resolve,reject)=>{rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(restoreDiagramSpatialError(event.data.message,event.data.diagnostic));};worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'视角预览失败。'));};worker.postMessage({mode:'preview',pose,camera,history,drawingRotation});});
 return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消视角预览。'));}};
}
