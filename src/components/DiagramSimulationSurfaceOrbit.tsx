import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import type {SimulationPose} from '../engine/simPose';
import type {DiagramSpatialPose} from '../app/diagramSpatialPose';
import type {DiagramSimulationSurface} from '../app/diagramSimulationSurface';
import {renderDiagramSimulationSurface} from '../app/diagramSimulationSurfaceRender';
import {diagramSimulationSurfaceOrbitCamera,diagramSimulationSurfaceViewFromCamera,sameDiagramSimulationSurfaceView} from '../app/diagramSimulationSurfaceCamera';
import {arcballCamera} from '../app/diagramArcball';
import DiagramRotationGizmo from './DiagramRotationGizmo';
import './DiagramSpatialOrbit.css';

type View=SimulationPose['view'];
type Camera=DiagramSpatialPose['camera'];
type Drag={id:number;x:number;y:number;left:number;top:number;width:number;height:number;view:View;camera:Camera};
/** Captured surfaces rotate without solving or modifying any vertex. Only
 * complete gestures enter project history; cancelled previews are disposable. */
export default function DiagramSimulationSurfaceOrbit({surface,drawingRotation=0,onCommit,onExit}:{surface:DiagramSimulationSurface;drawingRotation?:number;onCommit:(view:View)=>void;onExit:()=>void}){
  const host=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),keyboard=useRef<View|null>(null),frame=useRef(0),axisStart=useRef<View|null>(null);
  const [view,setView]=useState(surface.pose.view),pending=useRef(view),[moving,setMoving]=useState(false),[gizmoShown,setGizmoShown]=useState(true);
  const [error,setError]=useState('');
  const [viewport,setViewport]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  const update=(value:View)=>{pending.current=value;if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;setView(pending.current);});};
  const props=useRef({surface,onCommit,onExit});props.current={surface,onCommit,onExit};
  useEffect(()=>{cancelAnimationFrame(frame.current);frame.current=0;setView(surface.pose.view);pending.current=surface.pose.view;},[surface.pose.view]);
  useEffect(()=>{
    const node=host.current;node?.focus({preventScroll:true});
    const scene=node?.parentElement?.querySelector<SVGSVGElement>('svg[data-diagram-model]');
    const read=()=>{if(scene){const b=scene.viewBox.baseVal;setViewport({x:b.x,y:b.y,width:b.width,height:b.height});}};read();
    const observer=new MutationObserver(read);if(scene)observer.observe(scene,{attributes:true,attributeFilter:['viewBox']});
    return()=>{observer.disconnect();cancelAnimationFrame(frame.current);};
  },[]);
  const release=()=>{const old=drag.current;drag.current=null;if(old&&host.current?.hasPointerCapture(old.id))host.current.releasePointerCapture(old.id);};
  const cancel=()=>{release();keyboard.current=null;axisStart.current=null;setMoving(false);update(props.current.surface.pose.view);};
  const commit=(value=pending.current)=>{
    if(sameDiagramSimulationSurfaceView(value,props.current.surface.pose.view)){update(props.current.surface.pose.view);return;}
    try{props.current.onCommit(value);setError('');}catch(cause){update(props.current.surface.pose.view);setError(cause instanceof Error?cause.message:'视角未能保存。');}
  };
  useEffect(()=>{window.addEventListener('blur',cancel);return()=>window.removeEventListener('blur',cancel);},[]);
  const artwork=useMemo(()=>renderDiagramSimulationSurface({...surface,pose:{...surface.pose,view}},{resolution:480}),[surface,view]);
  const {x,y,width,height}=artwork.bounds,pad=Math.max(width,height)*.16;
  const box=viewport??{x:x-pad,y:y-pad,width:width+2*pad,height:height+2*pad};
  const totalRotation=drawingRotation+(surface.displayRotation??0);
  const end=(event:PointerEvent<HTMLDivElement>)=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;release();setMoving(false);if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>2)commit();else update(props.current.surface.pose.view);};
  const axisChange=(camera:Camera)=>update(diagramSimulationSurfaceViewFromCamera(axisStart.current??pending.current,camera));
  return <div ref={host} className={'diagram-spatial-orbit'+(moving?' is-dragging is-previewing':'')} data-simulation-surface-orbit="true" data-orbit-yaw={view.yaw} data-orbit-pitch={view.pitch} data-orbit-orient={view.orient?.join(',')} role="application" aria-label="转动曲面视角；拖动或使用三轴旋转环，Escape 退出" tabIndex={0}
    onPointerDown={event=>{if(event.button!==0||(event.target as Element).closest('button'))return;event.preventDefault();event.stopPropagation();host.current?.focus({preventScroll:true});const rect=event.currentTarget.getBoundingClientRect();drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height,view:pending.current,camera:diagramSimulationSurfaceOrbitCamera(pending.current)};setMoving(true);event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;event.preventDefault();const scale=event.shiftKey ? .2 : 1;const camera=arcballCamera(start.camera,[start.x-start.left,start.y-start.top],[start.x-start.left+(event.clientX-start.x)*scale,start.y-start.top+(event.clientY-start.y)*scale],start,false,totalRotation);update(diagramSimulationSurfaceViewFromCamera(start.view,camera));}}
    onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
    onContextMenu={event=>{event.preventDefault();event.stopPropagation();cancel();}}
    onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(drag.current||keyboard.current||axisStart.current)cancel();else onExit();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();keyboard.current??=pending.current;setMoving(true);
      const amount=event.shiftKey?2:10,rect=event.currentTarget.getBoundingClientRect(),center:[number,number]=[rect.width/2,rect.height/2];
      const camera=arcballCamera(diagramSimulationSurfaceOrbitCamera(pending.current),center,[center[0]+(event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0),center[1]+(event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0)],rect,false,totalRotation);
      update(diagramSimulationSurfaceViewFromCamera(pending.current,camera));
    }}
    onKeyUp={event=>{if(event.key.startsWith('Arrow')&&keyboard.current){event.preventDefault();event.stopPropagation();keyboard.current=null;setMoving(false);commit();}}}>
    {moving&&<svg viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} aria-hidden="true"><g transform={`rotate(${drawingRotation} ${box.x+box.width/2} ${box.y+box.height/2})`} dangerouslySetInnerHTML={{__html:artwork.markup}}/></svg>}
    <div className="diagram-spatial-orbit-help"><div>曲面视角 · 自由拖转或拖动三色旋转环<span>{error||'Shift 微调 · 松开保存 · Esc 取消 / 退出'}</span></div><div className="diagram-spatial-orbit-actions"><button type="button" disabled={moving} aria-pressed={gizmoShown} onClick={()=>setGizmoShown(value=>!value)}>三轴旋转环</button><button type="button" onClick={onExit}>完成转动</button></div></div>
    {gizmoShown&&<DiagramRotationGizmo camera={diagramSimulationSurfaceOrbitCamera(view)} drawingRotation={totalRotation} onStart={()=>{axisStart.current=pending.current;setError('');setMoving(true);}} onChange={axisChange} onEnd={(camera,cancelled)=>{const start=axisStart.current??pending.current;axisStart.current=null;setMoving(false);if(cancelled){update(props.current.surface.pose.view);return;}const next=diagramSimulationSurfaceViewFromCamera(start,camera);update(next);commit(next);}}/>}
    <div className="diagram-spatial-orbit-readout">{view.orient?'自由三轴视角':`方位 ${(view.yaw*180/Math.PI).toFixed(0)}° · 俯仰 ${(view.pitch*180/Math.PI).toFixed(0)}°`}</div>
  </div>;
}
