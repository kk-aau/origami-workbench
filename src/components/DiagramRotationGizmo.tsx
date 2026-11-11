import {useEffect,useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import type {DiagramSpatialPose} from '../app/diagramSpatialPose';
import {diagramAxisProjection,diagramAxisRingPoint,diagramAxisPointerAngle,diagramAxisDragStart,diagramAxisAngleDelta,rotateDiagramCameraAxis,type DiagramRotationAxis,type DiagramAxisProjection} from '../app/diagramAxisRotation';
import './DiagramRotationGizmo.css';

type Camera=DiagramSpatialPose['camera'];
export interface DiagramRotationGizmoProps {
  camera:Camera;disabled?:boolean;back?:boolean;drawingRotation?:number;
  onStart?:()=>void;onChange:(camera:Camera)=>void;onEnd:(camera:Camera,cancelled:boolean)=>void;
}
const axes:DiagramRotationAxis[]=['x','y','z'],center=76,radius=56;
type Drag={id:number;axis:DiagramRotationAxis;camera:Camera;projection:DiagramAxisProjection;point:[number,number];lastAngle:number;tangent:[number,number];elliptic:boolean;total:number};

/** A view-only world-axis gizmo. It changes the existing rotation matrix,
 * including roll, and delegates persistence/validation to the parent. */
export default function DiagramRotationGizmo({camera,disabled=false,back=false,drawingRotation=0,onStart,onChange,onEnd}:DiagramRotationGizmoProps){
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),keyboard=useRef<Camera|null>(null),frame=useRef(0),latest=useRef(camera),pendingDegrees=useRef(0);
  const callbacks=useRef({onStart,onChange,onEnd});callbacks.current={onStart,onChange,onEnd};
  const [axis,setAxis]=useState<DiagramRotationAxis>('z'),[moving,setMoving]=useState(false),[degrees,setDegrees]=useState(0);
  const props=useRef({camera,disabled,back,drawingRotation});props.current={camera,disabled,back,drawingRotation};
  if(!drag.current&&!keyboard.current)latest.current=camera;
  const update=(value:Camera)=>{latest.current=value;if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;setDegrees(pendingDegrees.current);callbacks.current.onChange(latest.current);});};
  const release=()=>{const current=drag.current;drag.current=null;if(current&&svg.current?.hasPointerCapture(current.id))svg.current.releasePointerCapture(current.id);};
  const finish=(cancelled:boolean)=>{
    const original=drag.current?.camera??keyboard.current;if(!original)return;
    const value=cancelled?original:latest.current;release();keyboard.current=null;setMoving(false);cancelAnimationFrame(frame.current);frame.current=0;latest.current=value;
    callbacks.current.onChange(value);callbacks.current.onEnd(value,cancelled);
  };
  useEffect(()=>{const blur=()=>finish(true);window.addEventListener('blur',blur);return()=>{window.removeEventListener('blur',blur);cancelAnimationFrame(frame.current);};},[]);
  useEffect(()=>{if(disabled)finish(true);},[disabled]);
  const point=(event:PointerEvent<SVGSVGElement>):[number,number]=>{const rect=event.currentTarget.getBoundingClientRect();return [(event.clientX-rect.left)*152/rect.width,(event.clientY-rect.top)*152/rect.height];};
  const down=(event:PointerEvent<SVGSVGElement>)=>{
    event.stopPropagation();if(event.button!==0||disabled||drag.current||keyboard.current)return;
    const picked=(event.target as Element).getAttribute('data-axis') as DiagramRotationAxis|null;if(!picked||!axes.includes(picked))return;
    event.preventDefault();setAxis(picked);svg.current?.focus({preventScroll:true});
    const position=point(event),normalized:[number,number]=[(position[0]-center)/radius,(position[1]-center)/radius],projection=diagramAxisProjection(camera,picked,back,drawingRotation),start=diagramAxisDragStart(projection,normalized);
    drag.current={id:event.pointerId,axis:picked,camera,projection,point:position,lastAngle:start.angle,tangent:start.tangent,elliptic:start.elliptic,total:0};latest.current=camera;pendingDegrees.current=0;setDegrees(0);setMoving(true);callbacks.current.onStart?.();event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=(event:PointerEvent<SVGSVGElement>)=>{
    event.stopPropagation();const current=drag.current;if(!current||current.id!==event.pointerId)return;event.preventDefault();
    const position=point(event),normalized:[number,number]=[(position[0]-center)/radius,(position[1]-center)/radius],angle=diagramAxisPointerAngle(current.projection,normalized);
    let delta:number;
    if(current.elliptic&&angle!==undefined){delta=diagramAxisAngleDelta(current.lastAngle,angle);current.lastAngle=angle;}
    else delta=((position[0]-current.point[0])*current.tangent[0]+(position[1]-current.point[1])*current.tangent[1])/radius;
    current.point=position;current.total+=delta*(event.shiftKey ? .2 : 1);pendingDegrees.current=current.total*180/Math.PI;update(rotateDiagramCameraAxis(current.camera,current.axis,current.total));
  };
  const keyDown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&(drag.current||keyboard.current)){event.preventDefault();event.stopPropagation();finish(true);return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||disabled)return;
    event.preventDefault();event.stopPropagation();if(drag.current)return;
    if(!keyboard.current){keyboard.current=props.current.camera;latest.current=props.current.camera;pendingDegrees.current=0;setDegrees(0);setMoving(true);callbacks.current.onStart?.();}
    const amount=(event.shiftKey?1:5)*(event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:1);pendingDegrees.current+=amount;update(rotateDiagramCameraAxis(latest.current,axis,amount*Math.PI/180));
  };
  const order=[...axes.filter(item=>item!==axis),axis];
  const rings=order.map(item=>{
    const projection=diagramAxisProjection(camera,item,back,drawingRotation),points=Array.from({length:97},(_,i)=>diagramAxisRingPoint(projection,i*Math.PI/48));
    const coord=(p:number[])=>`${(center+p[0]*radius).toFixed(2)} ${(center+p[1]*radius).toFixed(2)}`;
    const segments=(front:boolean)=>points.slice(0,-1).flatMap((p,i)=>(p[2]+points[i+1][2]>=0)===front?[`M${coord(p)}L${coord(points[i+1])}`]:[]).join('');
    return <g key={item} className={`axis-${item}${item===axis?' is-active':''}`}>
      <path className="diagram-rotation-ring rear" d={segments(false)}/><path className="diagram-rotation-ring" d={segments(true)}/>
      <path data-axis={item} className="diagram-rotation-ring-hit" d={'M'+points.map(coord).join('L')}><title>拖动绕 {item.toUpperCase()} 轴旋转</title></path>
    </g>;
  });
  return <div className={'diagram-rotation-gizmo'+(moving?' is-dragging':'')} data-rotation-gizmo="true" aria-label="三轴旋转环" aria-disabled={disabled} onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onKeyDown={keyDown} onKeyUp={event=>{if(keyboard.current&&event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();finish(false);}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)&&keyboard.current)finish(true);}}>
    <div className="diagram-rotation-gizmo-heading"><span>三轴旋转</span><output>{moving?`${axis.toUpperCase()} ${degrees.toFixed(0)}°`:'世界坐标'}</output></div>
    <svg ref={svg} viewBox="0 0 152 152" role="application" aria-label="拖动彩色圆环沿对应轴旋转，方向键调整所选轴" tabIndex={disabled?-1:0} onPointerDown={down} onPointerMove={move} onPointerUp={event=>{event.stopPropagation();if(drag.current?.id===event.pointerId)finish(false);}} onPointerCancel={event=>{event.stopPropagation();finish(true);}} onLostPointerCapture={event=>{if(drag.current?.id===event.pointerId)finish(true);}} onContextMenu={event=>{event.preventDefault();event.stopPropagation();finish(true);}}>
      <circle cx={center} cy={center} r="3" className="diagram-rotation-center"/>{rings}
    </svg>
    <div className="diagram-rotation-axis-buttons">{axes.map(item=><button key={item} type="button" className={`axis-${item}`} disabled={disabled} aria-label={`选择 ${item.toUpperCase()} 轴旋转`} aria-pressed={axis===item} title={`选择 ${item.toUpperCase()} 轴，方向键微调`} onClick={()=>setAxis(item)}>{item.toUpperCase()} 轴</button>)}</div>
    <small>拖动圆环 · Shift 微调</small>
  </div>;
}
