import {useLayoutEffect,useRef,useState} from 'react';
import type {Point} from '../core/types';
import './CanvasTargetMarker.css';

/** A view marker only: never participates in material hit testing or exports. */
export default function CanvasTargetMarker({point,kind,units}:{point:Point;kind:'crease'|'fold';units?:number}){
 const marker=useRef<SVGGElement>(null),[measuredUnits,setMeasuredUnits]=useState(1);
 const measure=()=>{
  const matrix=marker.current?.getScreenCTM();if(!matrix)return;
  const scale=Math.hypot(matrix.a,matrix.b);if(!(scale>0))return;
  const next=1/scale;setMeasuredUnits(previous=>Math.abs(previous-next)<next*1e-6?previous:next);
 };
 useLayoutEffect(()=>{if(units===undefined)measure();});
 useLayoutEffect(()=>{
  const svg=marker.current?.ownerSVGElement;if(units!==undefined||!svg)return;
  const observer=new ResizeObserver(measure);observer.observe(svg);return()=>observer.disconnect();
 },[units]);
 const scale=units??measuredUnits,radius=6*scale,halfArm=2*scale;
 const path=`M${-halfArm} ${-radius}H${halfArm}V${-halfArm}H${radius}V${halfArm}H${halfArm}V${radius}H${-halfArm}V${halfArm}H${-radius}V${-halfArm}H${-halfArm}Z`;
 return <g ref={marker} className={`canvas-target-marker canvas-target-marker-${kind}`} data-canvas-target-marker={kind} transform={`translate(${point[0]} ${point[1]})`} pointerEvents="none" role="img" aria-label={kind==='crease'?'CP 计算目标':'平折结果操作目标'}>
  <path className="canvas-target-marker-cross" d={path}/>
 </g>;
}
