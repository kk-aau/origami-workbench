import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import type {SimulationPose} from '../engine/simPose';
import type {DiagramSimulationSurface} from '../app/diagramSimulationSurface';
import {renderDiagramSimulationSurface} from '../app/diagramSimulationSurfaceRender';
import './DiagramSpatialOrbit.css';

type View=SimulationPose['view'];
/** Captured surfaces rotate without solving or modifying any vertex. Only
 * complete gestures enter project history; cancelled previews are disposable. */
export default function DiagramSimulationSurfaceOrbit({surface,drawingRotation=0,onCommit,onExit}:{surface:DiagramSimulationSurface;drawingRotation?:number;onCommit:(view:View)=>void;onExit:()=>void}){
  const host=useRef<HTMLDivElement>(null),drag=useRef<{id:number;x:number;y:number;view:View}|null>(null),keyboard=useRef(false),frame=useRef(0);
  const [view,setView]=useState(surface.pose.view),pending=useRef(view),[moving,setMoving]=useState(false);
  const [error,setError]=useState('');
  const [viewport,setViewport]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  const update=(value:View)=>{pending.current=value;if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;setView(pending.current);});};
  useEffect(()=>{setView(surface.pose.view);pending.current=surface.pose.view;},[surface.pose.view]);
  useEffect(()=>{
    const node=host.current;node?.focus({preventScroll:true});
    const scene=node?.parentElement?.querySelector<SVGSVGElement>('svg[data-diagram-model]');
    if(!scene)return;
    const read=()=>{const b=scene.viewBox.baseVal;setViewport({x:b.x,y:b.y,width:b.width,height:b.height});};read();
    const observer=new MutationObserver(read);observer.observe(scene,{attributes:true,attributeFilter:['viewBox']});
    return()=>{observer.disconnect();cancelAnimationFrame(frame.current);};
  },[]);
  const release=()=>{const old=drag.current;drag.current=null;if(old&&host.current?.hasPointerCapture(old.id))host.current.releasePointerCapture(old.id);};
  const cancel=()=>{release();keyboard.current=false;setMoving(false);update(surface.pose.view);};
  const commit=()=>{try{onCommit(pending.current);setError('');}catch(cause){update(surface.pose.view);setError(cause instanceof Error?cause.message:'视角未能保存。');}};
  useEffect(()=>{window.addEventListener('blur',cancel);return()=>window.removeEventListener('blur',cancel);},[surface]);
  const artwork=useMemo(()=>renderDiagramSimulationSurface({...surface,pose:{...surface.pose,view}},{resolution:480}),[surface,view]);
  const {x,y,width,height}=artwork.bounds,pad=Math.max(width,height)*.16;
  const box=viewport??{x:x-pad,y:y-pad,width:width+2*pad,height:height+2*pad};
  const preview=moving||keyboard.current;
  const end=(event:PointerEvent<HTMLDivElement>)=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;release();setMoving(false);if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>2)commit();else update(surface.pose.view);};
  return <div ref={host} className={'diagram-spatial-orbit'+(moving?' is-dragging':'')+(preview?' is-previewing':'')} data-simulation-surface-orbit="true" data-orbit-yaw={view.yaw} data-orbit-pitch={view.pitch} role="application" aria-label="转动曲面视角；拖动或使用方向键，Escape 退出" tabIndex={0}
    onPointerDown={event=>{if(event.button!==0||(event.target as Element).closest('button'))return;event.preventDefault();event.stopPropagation();host.current?.focus({preventScroll:true});drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,view:pending.current};setMoving(true);event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;event.preventDefault();update({...start.view,yaw:start.view.yaw+(event.clientX-start.x)*.008,pitch:start.view.pitch+(event.clientY-start.y)*.008});}}
    onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
    onContextMenu={event=>{event.preventDefault();event.stopPropagation();cancel();}}
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(drag.current||keyboard.current)cancel();else onExit();return;}if(!event.key.startsWith('Arrow'))return;event.preventDefault();event.stopPropagation();keyboard.current=true;const d=(event.shiftKey?15:5)*Math.PI/180;update({...pending.current,yaw:pending.current.yaw+(event.key==='ArrowLeft'?-d:event.key==='ArrowRight'?d:0),pitch:pending.current.pitch+(event.key==='ArrowUp'?-d:event.key==='ArrowDown'?d:0)});}}
    onKeyUp={event=>{if(event.key.startsWith('Arrow')&&keyboard.current){event.preventDefault();event.stopPropagation();keyboard.current=false;commit();}}}>
    {preview&&<svg viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} aria-hidden="true"><g transform={`rotate(${drawingRotation} ${box.x+box.width/2} ${box.y+box.height/2})`} dangerouslySetInnerHTML={{__html:artwork.markup}}/></svg>}
    <div className="diagram-spatial-orbit-help"><div>曲面视角 · 拖动旋转 · 松开保存<span>{error||'方向键微调 · Shift 加速 · Esc 退出'}</span></div><button type="button" onClick={onExit}>完成转动</button></div>
    <div className="diagram-spatial-orbit-readout">方位 {(view.yaw*180/Math.PI).toFixed(0)}° · 俯仰 {(view.pitch*180/Math.PI).toFixed(0)}°</div>
  </div>;
}
