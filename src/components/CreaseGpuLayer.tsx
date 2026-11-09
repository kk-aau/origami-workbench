import {useLayoutEffect,useRef} from 'react';
import type {Point} from '../core/types';
import {CreaseGpuRenderer,type CreaseGpuScene,type CreaseGpuView} from './creaseGpuRenderer';

interface Props {
  scene:CreaseGpuScene;view:CreaseGpuView;size:{w:number;h:number};drag:Point;
  adaptive:boolean;showMarkers:boolean;onFailure:(reason:string)=>void;
}

/** Keep the canvas at the exact SVG paint position. The foreignObject occupies
 * the current viewport, so paper/grid remain below and tools remain above it.
 * It never receives pointer events: geometric picking stays on the SVG. */
export default function CreaseGpuLayer(p:Props){
  const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<CreaseGpuRenderer|null>(null);
  const uploaded=useRef<CreaseGpuScene|null>(null),failed=useRef(false),failure=useRef(p.onFailure);failure.current=p.onFailure;
  function fail(reason:unknown){if(failed.current)return;failed.current=true;failure.current(reason instanceof Error?reason.message:String(reason));}
  useLayoutEffect(()=>{
    const el=canvas.current;if(!el)return;
    const lost=(event:Event)=>{event.preventDefault();fail('WebGL context lost');};
    el.addEventListener('webglcontextlost',lost);
    try{renderer.current=new CreaseGpuRenderer(el);}catch(error){fail(error);}
    return()=>{el.removeEventListener('webglcontextlost',lost);renderer.current?.dispose();renderer.current=null;uploaded.current=null;};
  },[]);
  useLayoutEffect(()=>{
    if(failed.current||!renderer.current)return;
    try{
      if(uploaded.current!==p.scene){renderer.current.setScene(p.scene);uploaded.current=p.scene;}
      renderer.current.draw(p.view,p.size,p.drag,p.adaptive,p.showMarkers);
    }catch(error){fail(error);}
  },[p.scene,p.view,p.size,p.drag[0],p.drag[1],p.adaptive,p.showMarkers]);
  // Lay HTML out in screen pixels, then cancel the outer SVG camera transform.
  // A world-sized HTML box makes Chromium rasterize/downsample the canvas at
  // that small CSS size before magnifying it, shifting and blurring the ink.
  return <foreignObject data-crease-gpu-layer="true" x={0} y={0} width={p.size.w} height={p.size.h} transform={`translate(${p.view.x} ${p.view.y}) scale(${p.view.w/p.size.w} ${p.view.h/p.size.h})`} pointerEvents="none" aria-hidden="true" style={{overflow:'hidden'}}>
    <canvas ref={canvas} data-crease-gpu="true" style={{display:'block',width:'100%',height:'100%',pointerEvents:'none'}}/>
  </foreignObject>;
}
