import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {DiagramPose} from '../app/diagramProject';
import type {DiagramSpatialPose} from '../app/diagramSpatialPose';
import {arcballCamera,centeredOrbitCamera,sameSpatialCamera} from '../app/diagramArcball';
import {createDiagramSpatialPreviewSession} from '../app/diagramSpatialTask';
import DiagramRotationGizmo from './DiagramRotationGizmo';
import './DiagramSpatialOrbit.css';

type Camera=DiagramSpatialPose['camera'];
type Drag={id:number;x:number;y:number;left:number;top:number;width:number;height:number;camera:Camera};
export type DiagramSpatialCameraJob={promise:Promise<{result:DiagramPose['result'];spatial:DiagramSpatialPose}>;cancel:()=>void};
export interface DiagramSpatialOrbitProps {pose:DiagramPose;history?:readonly DiagramPose[];disabled?:boolean;drawingRotation?:number;onCommit:(camera:Camera,prepared?:DiagramSpatialCameraJob)=>Promise<boolean>;onExit:()=>void}
const emptyHistory:readonly DiagramPose[]=[];

/** Orbit mode is a transient viewer. Only a completed gesture asks its parent
 * to validate and save a camera; neither a drag nor a cancelled gesture edits CP. */
export default function DiagramSpatialOrbit({pose,history=emptyHistory,disabled=false,drawingRotation=0,onCommit,onExit}:DiagramSpatialOrbitProps){
  const element=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),keyboard=useRef<Camera|null>(null),mounted=useRef(true),pending=useRef(false);
  const [camera,setCamera]=useState<Camera>(()=>({...pose.spatial!.camera})),cameraRef=useRef(camera);
  const [moving,setMoving]=useState(false),[applying,setApplying]=useState(false),[preparing,setPreparing]=useState(true),[error,setError]=useState(''),[preview,setPreview]=useState(''),[viewport,setViewport]=useState('');
  const [gizmoShown,setGizmoShown]=useState(true);
  const props=useRef({pose,history,drawingRotation,disabled,onCommit,onExit});props.current={pose,history,drawingRotation,disabled,onCommit,onExit};
  const disabledRef=useRef(disabled);disabledRef.current=disabled;
  const work=useRef<{generation:number;session:ReturnType<typeof createDiagramSpatialPreviewSession>|null;ready:Promise<void>|null;running:boolean;queued:Camera|null}>({generation:0,session:null,ready:null,running:false,queued:null});
  const update=(next:Camera)=>{cameraRef.current=next;setCamera(next);};
  const release=(id:number)=>{if(element.current?.hasPointerCapture(id))element.current.releasePointerCapture(id);};
  // A gesture invalidates its pending picture, not the verified material or
  // worker. Exit and explicit computation cancellation release the session.
  const clearPreviewWork=(close=false)=>{const state=work.current;state.generation++;state.queued=null;if(close){state.session?.close();state.session=null;state.ready=null;state.running=false;}};
  const ensureSession=()=>{const state=work.current;if(!state.session){const p=props.current;state.session=createDiagramSpatialPreviewSession(p.pose,p.history,p.drawingRotation);state.ready=state.session.ready;}return state.session;};
  const pump=()=>{
    const state=work.current;if(state.running||!state.queued||!mounted.current||disabledRef.current||pending.current)return;
    const next=state.queued;state.queued=null;const generation=state.generation,session=ensureSession();state.running=true;
    state.ready!.then(()=>session.frame(next)).then(svg=>{if(mounted.current&&work.current.generation===generation){setPreview(svg);setError('');}}).catch(cause=>{if(mounted.current&&work.current.generation===generation)setError(cause instanceof Error?cause.message:'视角预览未能确认。');}).finally(()=>{if(work.current.session!==session)return;work.current.running=false;pump();});
  };
  const cancel=()=>{const current=drag.current;drag.current=null;keyboard.current=null;clearPreviewWork();setPreview('');setMoving(false);update({...props.current.pose.spatial!.camera});if(current)release(current.id);};
  const commit=async(next:Camera)=>{
    if(pending.current||disabledRef.current)return;
    const saved=props.current.pose.spatial!.camera;if(sameSpatialCamera(next,saved)){clearPreviewWork();setPreview('');return;}
    clearPreviewWork();pending.current=true;setApplying(true);setError('');
    const session=ensureSession(),promise=work.current.ready!.then(()=>session.project(next));promise.catch(()=>{});
    try{const accepted=await props.current.onCommit(next,{promise,cancel:()=>clearPreviewWork(true)});if(mounted.current&&!accepted){update({...props.current.pose.spatial!.camera});setError('此视角未能确认，已回到原视角。');}}
    catch(cause){if(mounted.current){update({...props.current.pose.spatial!.camera});setError(cause instanceof Error?cause.message:'此视角未能应用，已保留原视角。');}}
    finally{pending.current=false;if(mounted.current){setApplying(false);setPreview('');}}
  };
  useEffect(()=>{
    if(!drag.current&&!keyboard.current)update({...pose.spatial!.camera});setPreview('');clearPreviewWork();setPreparing(true);
    const state=work.current,existing=state.session,session=ensureSession();
    const ready=state.ready=existing?session.sync(pose,history,drawingRotation):session.ready;
    ready.then(()=>{if(mounted.current&&work.current.session===session&&work.current.ready===ready){setPreparing(false);setError('');}}).catch(cause=>{if(mounted.current&&work.current.session===session&&work.current.ready===ready){setPreparing(false);setError(cause instanceof Error?cause.message:'视角预览未能准备完成。');}});
  },[pose,history,drawingRotation]);
  useEffect(()=>{mounted.current=true;element.current?.focus({preventScroll:true});return()=>{mounted.current=false;clearPreviewWork(true);};},[]);
  useEffect(()=>{if(!moving&&!keyboard.current||applying||disabled||sameSpatialCamera(camera,props.current.pose.spatial!.camera))return;work.current.queued=camera;pump();},[camera,moving,applying,disabled]);
  useEffect(()=>{
    const node=element.current;if(!node)return;
    const scene=node.parentElement?.querySelector<SVGSVGElement>('svg[data-diagram-model]');
    const read=()=>{if(scene)setViewport(scene.getAttribute('viewBox')??'');};read();
    const observer=new MutationObserver(read);if(scene)observer.observe(scene,{attributes:true,attributeFilter:['viewBox']});
    const wheel=(event:WheelEvent)=>event.preventDefault(),blur=()=>{if(drag.current||keyboard.current)cancel();};
    node.addEventListener('wheel',wheel,{passive:false});window.addEventListener('blur',blur);
    return()=>{observer.disconnect();node.removeEventListener('wheel',wheel);window.removeEventListener('blur',blur);};
  },[]);
  const end=(event:PointerEvent<HTMLDivElement>)=>{
    if(drag.current?.id!==event.pointerId)return;const previous=drag.current;drag.current=null;setMoving(false);release(event.pointerId);
    if(Math.hypot(event.clientX-previous.x,event.clientY-previous.y)>2)void commit(cameraRef.current);
    else{clearPreviewWork();setPreview('');update({...props.current.pose.spatial!.camera});}
  };
  // Display only completed exact overlap frames, including during a gesture.
  const previewing=(moving||applying||!!keyboard.current)&&!!preview;
  const markup=viewport?preview.replace(/viewBox="[^"]*"/,`viewBox="${viewport}"`):preview;
  return <div ref={element} className={'diagram-spatial-orbit'+(moving?' is-dragging':'')+(previewing?' is-previewing':'')} data-diagram-spatial-orbit="true" data-orbit-previewing={previewing} data-orbit-preparing={preparing} data-orbit-renderer="exact-regions" data-orbit-yaw={camera.yaw} data-orbit-elevation={camera.elevation} role="application" aria-label="转动立体视角；拖动或使用方向键，松开应用，Escape 退出" aria-busy={applying||disabled} tabIndex={0}
    onPointerDown={event=>{if(event.button!==0||disabled||pending.current||(event.target as Element).closest('button'))return;event.preventDefault();event.stopPropagation();element.current?.focus({preventScroll:true});setError('');const rect=event.currentTarget.getBoundingClientRect();drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height,camera:centeredOrbitCamera(cameraRef.current,pose.spatial!.vertices)};setMoving(true);event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;event.preventDefault();const amount=event.shiftKey ? .2 : 1;update(arcballCamera(start.camera,[start.x-start.left,start.y-start.top],[start.x-start.left+(event.clientX-start.x)*amount,start.y-start.top+(event.clientY-start.y)*amount],start,pose.view?.side==='back',drawingRotation+(pose.view?.rotation??0)));}}
    onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={event=>{if(drag.current?.id===event.pointerId)cancel();}}
    onContextMenu={event=>{event.preventDefault();event.stopPropagation();if(drag.current)cancel();}}
    onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(drag.current||keyboard.current)cancel();else if(!pending.current&&!disabled)onExit();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||disabled||pending.current)return;
      event.preventDefault();event.stopPropagation();keyboard.current??={...cameraRef.current};const amount=event.shiftKey?2:10,rect=event.currentTarget.getBoundingClientRect(),center:[number,number]=[rect.width/2,rect.height/2];
      update(arcballCamera(centeredOrbitCamera(cameraRef.current,pose.spatial!.vertices),center,[center[0]+(event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0),center[1]+(event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0)],rect,pose.view?.side==='back',drawingRotation+(pose.view?.rotation??0)));
    }} onKeyUp={event=>{if(keyboard.current&&event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();keyboard.current=null;void commit(cameraRef.current);}}}>
    {previewing&&<div className="diagram-spatial-orbit-preview" dangerouslySetInnerHTML={{__html:markup}}/>}
    <div className="diagram-spatial-orbit-help"><div>{applying?'正在应用视角…':preparing?'正在准备连续转动…':'自由拖转 · 或拖动三色旋转环'}<span>{error||'Shift 慢速微调 · 松开应用 · Esc 取消 / 退出'}</span></div><div className="diagram-spatial-orbit-actions"><button type="button" disabled={applying||disabled||moving} aria-pressed={gizmoShown} onClick={()=>setGizmoShown(value=>!value)}>三轴旋转环</button><button type="button" disabled={applying||disabled} onClick={onExit}>完成转动</button></div></div>
    {gizmoShown&&<DiagramRotationGizmo camera={centeredOrbitCamera(camera,pose.spatial!.vertices)} back={pose.view?.side==='back'} drawingRotation={drawingRotation+(pose.view?.rotation??0)} disabled={applying||disabled} onStart={()=>{setError('');setMoving(true);}} onChange={update} onEnd={(next,cancelled)=>{setMoving(false);if(cancelled){clearPreviewWork();setPreview('');update({...props.current.pose.spatial!.camera});return;}if(sameSpatialCamera(next,centeredOrbitCamera(props.current.pose.spatial!.camera,props.current.pose.spatial!.vertices))){update({...props.current.pose.spatial!.camera});return;}void commit(next);}}/>}
    <div className="diagram-spatial-orbit-readout">{camera.rotation?'自由视角':`方位 ${camera.yaw.toFixed(0)}° · 俯仰 ${camera.elevation.toFixed(0)}°`}</div>
  </div>;
}
