import type {createDiagramSpatialPose,reprojectDiagramSpatialPose,DiagramSpatialPose} from './diagramSpatialPose';
import type {DiagramPose} from './diagramProject';
import type {SpatialLayerRequest} from './diagramSpatialLayerSolver';

export function startDiagramSpatialLayerAdjustment(pose:DiagramPose,request:SpatialLayerRequest,history:readonly DiagramPose[]=[]){
 const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});let done=false,rejectTask!:(error:Error)=>void;
 const promise=new Promise<{result:DiagramPose['result'];spatial:DiagramSpatialPose}>((resolve,reject)=>{rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(Error(event.data.message));};worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'立体层序求解失败。'));};worker.postMessage({mode:'layers',pose,request,history});});
 return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消立体层序求解。'));}};
}

/** One worker and one immutable model per orbit session, at most one frame in
 * flight. The component keeps only the latest mouse position while it runs. */
export function createDiagramSpatialPreviewSession(pose:DiagramPose,history:readonly DiagramPose[]=[],drawingRotation=0){
 const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});
 let closed=false,resolvePending:((value:string|null)=>void)|undefined,rejectPending:((error:Error)=>void)|undefined;
 const send=(message:unknown)=>new Promise<string|null>((resolve,reject)=>{if(closed){reject(Error('视角预览已关闭。'));return;}if(resolvePending){reject(Error('上一帧仍在生成。'));return;}resolvePending=resolve;rejectPending=reject;worker.postMessage(message);});
 worker.onmessage=event=>{const resolve=resolvePending,reject=rejectPending;resolvePending=undefined;rejectPending=undefined;event.data.ok?resolve?.(event.data.value):reject?.(Error(event.data.message));};
 worker.onerror=event=>{const reject=rejectPending;resolvePending=undefined;rejectPending=undefined;closed=true;worker.terminate();reject?.(Error(event.message||'视角预览失败。'));};
 const ready=send({mode:'preview-init',pose,history,drawingRotation});ready.catch(()=>{});
 return {async frame(camera:DiagramSpatialPose['camera']){await ready;return (await send({mode:'preview-frame',camera}))!;},close(){if(closed)return;closed=true;worker.terminate();rejectPending?.(Error('已取消视角预览。'));resolvePending=undefined;rejectPending=undefined;}};
}
/** Spatial geometry and overlap arrangement remain cancellable off the UI thread. */
export function startDiagramSpatialPose(args:Parameters<typeof createDiagramSpatialPose>,history:readonly (DiagramPose|null|undefined)[]=[]){
  const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});
  let rejectTask:(reason:Error)=>void=()=>{},done=false;
  const promise=new Promise<ReturnType<typeof createDiagramSpatialPose>>((resolve,reject)=>{
    rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(Error(event.data.message));};
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
    rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(Error(event.data.message));};
    worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'空间视角更新失败。'));};
    worker.postMessage({mode:'camera',pose,camera,history});
  });
  return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消视角更新。'));}};
}

/** Orbit frames use the same projected overlap regions as the saved drawing.
 * Work stays cancellable off the UI thread; no unverified depth preview. */
export function startDiagramSpatialPreview(pose:DiagramPose,camera:DiagramSpatialPose['camera'],history:readonly DiagramPose[]=[],drawingRotation=0){
 const worker=new Worker(new URL('../workers/diagramSpatial.worker.ts',import.meta.url),{type:'module'});let done=false,rejectTask!:(error:Error)=>void;
 const promise=new Promise<string>((resolve,reject)=>{rejectTask=reject;worker.onmessage=event=>{if(done)return;done=true;worker.terminate();event.data.ok?resolve(event.data.value):reject(Error(event.data.message));};worker.onerror=event=>{if(done)return;done=true;worker.terminate();reject(Error(event.message||'视角预览失败。'));};worker.postMessage({mode:'preview',pose,camera,history,drawingRotation});});
 return {promise,cancel(){if(done)return;done=true;worker.terminate();rejectTask(Error('已取消视角预览。'));}};
}
