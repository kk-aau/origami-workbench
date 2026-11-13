import {useLayoutEffect,useRef,useState} from 'react';
import type {Point} from '../core/types';
import {CreaseGpuRenderer,type CreaseGpuScene,type CreaseGpuView} from './creaseGpuRenderer';
import {CREASE_GPU_ASYNC_THRESHOLD,prepareCreaseGpuLines,prepareCreaseGpuPoints,sameCreaseGpuLines,type CreaseGpuLines} from './creaseGpuScenePreparation';

interface Props {
  scene:CreaseGpuScene;view:CreaseGpuView;size:{w:number;h:number};drag:Point;
  adaptive:boolean;showMarkers:boolean;onFailure:(reason:string)=>void;
}

/** Keep the canvas at the exact SVG paint position. The foreignObject occupies
 * the current viewport, so paper/grid remain below and tools remain above it.
 * It never receives pointer events: geometric picking stays on the SVG. */
export default function CreaseGpuLayer(p:Props){
  const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<CreaseGpuRenderer|null>(null);
  const latest=useRef(p);latest.current=p;
  const task=useRef<AbortController|null>(null),lineWork=useRef<{scene:CreaseGpuScene;controller:AbortController;promise:Promise<CreaseGpuLines>;ready?:CreaseGpuLines}|null>(null);
  const [progress,setProgress]=useState<{scene:CreaseGpuScene;percent:number}|null>(null);
  const linePreparations=useRef(0);
  const uploaded=useRef<CreaseGpuScene|null>(null),failed=useRef(false),failure=useRef(p.onFailure);failure.current=p.onFailure;
  function fail(reason:unknown){if(failed.current)return;failed.current=true;task.current?.abort();lineWork.current?.controller.abort();failure.current(reason instanceof Error?reason.message:String(reason));}
  function draw(target:CreaseGpuRenderer){const view=latest.current;target.draw(view.view,view.size,view.drag,view.adaptive,view.showMarkers);}
  useLayoutEffect(()=>{
    const el=canvas.current;if(!el)return;
    const lost=(event:Event)=>{event.preventDefault();fail('WebGL context lost');};
    el.addEventListener('webglcontextlost',lost);
    try{renderer.current=new CreaseGpuRenderer(el);}catch(error){fail(error);}
    return()=>{task.current?.abort();task.current=null;lineWork.current?.controller.abort();lineWork.current=null;el.removeEventListener('webglcontextlost',lost);renderer.current?.dispose();renderer.current=null;uploaded.current=null;};
  },[]);
  useLayoutEffect(()=>{
    const target=renderer.current;if(failed.current||!target)return;
    const scene=p.scene,controller=new AbortController();task.current?.abort();task.current=controller;
    const live=()=>!controller.signal.aborted&&task.current===controller&&renderer.current===target&&!failed.current;
    let lastProgress=0;
    const update=(percent:number,force=false)=>{if(!live())return;const now=performance.now();if(force||now-lastProgress>=80){lastProgress=now;setProgress({scene,percent:Math.min(99,Math.floor(percent))});}};
    try{
      if(scene.segments.length+scene.vertices.length<CREASE_GPU_ASYNC_THRESHOLD){
        lineWork.current?.controller.abort();lineWork.current=null;target.setScene(scene);uploaded.current=scene;canvas.current!.dataset.packing='false';setProgress(null);draw(target);
      }else{
        let lines=lineWork.current;
        if(!lines||!sameCreaseGpuLines(lines.scene,scene)){
          lines?.controller.abort();target.clearScene();uploaded.current=null;
          canvas.current!.dataset.linePreparations=String(++linePreparations.current);
          const lineController=new AbortController();
          const promise=prepareCreaseGpuLines(scene,{signal:lineController.signal,onProgress:fraction=>{
            const current=lineWork.current;if(current?.controller!==lineController)return;
            const active=latest.current.scene,now=performance.now();if(now-lastProgress>=80&&task.current&&!task.current.signal.aborted){lastProgress=now;setProgress({scene:active,percent:Math.floor(fraction*80)});}
          }});
          lines={scene,controller:lineController,promise};lineWork.current=lines;
        }else lines.scene=scene;
        const currentLines=lines;uploaded.current=null;canvas.current!.dataset.packing='true';canvas.current!.dataset.sceneState='packing';update(lines.ready?80:0,true);
        void (async()=>{
          const lineData=await currentLines.promise;currentLines.ready=lineData;if(!live())return;
          update(80,true);
          const points=await prepareCreaseGpuPoints(scene.vertices,{signal:controller.signal,onProgress:fraction=>update(80+fraction*10)});if(!live())return;
          update(90,true);
          await target.setPackedSceneAsync(scene,{...lineData,points},{signal:controller.signal,onProgress:fraction=>update(90+fraction*10)});if(!live())return;
          uploaded.current=scene;canvas.current!.dataset.packing='false';setProgress(null);draw(target);
        })().catch(error=>{if(live()&&(error as Error).name!=='AbortError')fail(error);});
      }
    }catch(error){fail(error);}
    return()=>{controller.abort();if(task.current===controller)task.current=null;};
  },[p.scene]);
  useLayoutEffect(()=>{if(failed.current||!renderer.current)return;try{draw(renderer.current);}catch(error){fail(error);}},[p.view,p.size,p.drag[0],p.drag[1],p.adaptive,p.showMarkers]);
  // Lay HTML out in screen pixels, then cancel the outer SVG camera transform.
  // A world-sized HTML box makes Chromium rasterize/downsample the canvas at
  // that small CSS size before magnifying it, shifting and blurring the ink.
  const packing=progress?.scene===p.scene;
  return <foreignObject data-crease-gpu-layer="true" x={0} y={0} width={p.size.w} height={p.size.h} transform={`translate(${p.view.x} ${p.view.y}) scale(${p.view.w/p.size.w} ${p.view.h/p.size.h})`} pointerEvents="none" aria-hidden={packing?undefined:true} style={{overflow:'hidden'}}>
    <div style={{position:'relative',width:'100%',height:'100%'}}>
      <canvas ref={canvas} data-crease-gpu="true" data-packing={packing?'true':'false'} aria-hidden="true" style={{display:'block',width:'100%',height:'100%',pointerEvents:'none'}}/>
      {packing&&<div role="status" data-crease-gpu-progress="true" style={{position:'absolute',left:12,top:12,padding:'6px 10px',border:'1px solid var(--line, #d9e1d6)',borderRadius:4,background:'var(--panel, #fffefb)',color:'var(--muted, #53665e)',fontSize:12,pointerEvents:'none'}}>正在准备折痕显示… {progress.percent}%</div>}
    </div>
  </foreignObject>;
}
