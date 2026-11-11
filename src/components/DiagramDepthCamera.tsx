import {useRef,useState} from 'react';
import type {DiagramDepth} from '../app/diagramDepth';
import {depthCameraDirectionFromScreen,depthCameraScreenDirection} from '../app/diagramDepthCamera';

export default function DiagramDepthCamera({value,width,height,side,viewRotation,drawingRotation,onPreview,onCommit}:{value:DiagramDepth;width:number;height:number;side:'front'|'back';viewRotation:number;drawingRotation:number;onPreview:(depth:DiagramDepth|null)=>void;onCommit:(depth:DiagramDepth)=>void}){
 const root=useRef<SVGSVGElement>(null),drag=useRef<{id:number;value:DiagramDepth}|null>(null),[dragging,setDragging]=useState(false);
 const cx=width/2,cy=height/2,radius=Math.max(36,Math.min(width,height)/2-36),unit=depthCameraScreenDirection(value.direction,side,viewRotation,drawingRotation),x=cx+unit[0]*radius,y=cy+unit[1]*radius,angle=Math.atan2(-unit[1],-unit[0])*180/Math.PI;
 const read=(clientX:number,clientY:number)=>{const box=root.current!.getBoundingClientRect(),delta:[number,number]=[(clientX-box.left)*width/box.width-cx,(clientY-box.top)*height/box.height-cy];return depthCameraDirectionFromScreen(delta,side,viewRotation,drawingRotation,drag.current?.value.direction??value.direction);};
 const cancel=()=>{drag.current=null;setDragging(false);onPreview(null);};
 return <svg ref={root} className="diagram-depth-camera" viewBox={`0 0 ${width} ${height}`} aria-label="图解立体化相机方向" data-depth-camera="true">
  <circle className="diagram-depth-camera-orbit" cx={cx} cy={cy} r={radius}/>
  <line className="diagram-depth-camera-ray" x1={cx+unit[0]*radius*.55} y1={cy+unit[1]*radius*.55} x2={x} y2={y}/>
  <g className={'diagram-depth-camera-handle'+(dragging?' is-dragging':'')} data-depth-camera-handle="true" role="slider" tabIndex={0} aria-label="图解相机方向" aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(value.direction)%360} aria-valuetext={`${Math.round(value.direction)%360} 度，拖动相机调整方向`} transform={`translate(${x} ${y})`}
   onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,value};setDragging(true);}}
   onPointerMove={e=>{const d=drag.current;if(d?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const next={...d.value,direction:Math.round(read(e.clientX,e.clientY))%360};drag.current={...d,value:next};onPreview(next);}}
   onPointerUp={e=>{const d=drag.current;if(d?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();drag.current=null;setDragging(false);onCommit(d.value);onPreview(null);e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
   onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();return;}const step=e.shiftKey?15:1,delta=['ArrowRight','ArrowUp'].includes(e.key)?step:['ArrowLeft','ArrowDown'].includes(e.key)?-step:0;if(!delta&&e.key!=='Home')return;e.preventDefault();e.stopPropagation();onCommit({...value,direction:e.key==='Home'?0:(value.direction+delta+360)%360});}}>
   <rect x={-24} y={-24} width={48} height={48} fill="transparent"/>
   <g transform={`rotate(${angle})`}><rect className="diagram-depth-camera-body" x={-14} y={-9} width={23} height={18} rx={4}/><path className="diagram-depth-camera-body" d="M9 -4L19 -9L19 9L9 4Z"/><path className="diagram-depth-camera-body" d="M-9 -9V-13H0V-9"/></g>
   <text className="diagram-depth-camera-hint" y={-29} textAnchor="middle">{Math.round(value.direction)%360}°</text><title>拖动相机调整展开方向；方向键微调，Esc 取消拖动</title>
  </g>
 </svg>;
}
