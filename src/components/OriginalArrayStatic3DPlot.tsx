import {useEffect,useMemo,useRef,useState,type PointerEvent,type Dispatch,type SetStateAction} from 'react';
import {projectRigidQuad} from '../app/rigidQuadView';
import type {OriginalArrayStatic3D} from '../app/originalArrayStatic3D';
import './OriginalArrayStatic3DPlot.css';

export type OriginalArrayCamera={azimuth:number;elevation:number;zoom:number};
export const INITIAL_ORIGINAL_ARRAY_CAMERA:OriginalArrayCamera={azimuth:-25,elevation:48,zoom:1};

/** Camera operations affect only the viewport; CP, source angles and world points stay untouched. */
export default function OriginalArrayStatic3DPlot({reference,current,camera,onCameraChange}:{reference:OriginalArrayStatic3D;current:boolean;camera?:OriginalArrayCamera;onCameraChange?:Dispatch<SetStateAction<OriginalArrayCamera>>}){
 const svg=useRef<SVGSVGElement>(null),drag=useRef<{id:number;x:number;y:number;a:number;e:number}|null>(null),
  [localCamera,setLocalCamera]=useState<OriginalArrayCamera>(()=>({...INITIAL_ORIGINAL_ARRAY_CAMERA})),[font,setFont]=useState(22),[vertex,setVertex]=useState(0),scene=reference.scene;
 const {azimuth,elevation,zoom}=camera??localCamera,setCamera=onCameraChange??setLocalCamera;
 const axisStep=useMemo(()=>{const ranges=[0,1,2].map(k=>Math.max(...scene.vertices.map(p=>p[k]))-Math.min(...scene.vertices.map(p=>p[k]))),span=Math.max(...ranges),base=10**Math.floor(Math.log10(span/4));return [1,2,5,10].map(n=>n*base).find(n=>n>=span/4)??base;},[scene]),
  drawing=useMemo(()=>projectRigidQuad({...scene,vertices:[...scene.vertices,[0,0,0],[axisStep,0,0],[0,axisStep,0],[0,0,axisStep]]},azimuth,elevation,false,0),[scene,axisStep,azimuth,elevation]),
  selected=Math.min(vertex,scene.vertices.length-1),fmt=(x:number)=>Number(x.toPrecision(6)).toString(),transform=`translate(500 350) scale(${zoom}) translate(-500 -350)`;
 useEffect(()=>{if(!camera)setLocalCamera({...INITIAL_ORIGINAL_ARRAY_CAMERA});setVertex(0);},[reference.source.construction]);
 useEffect(()=>{const el=svg.current;if(!el)return;const update=()=>{const m=el.getScreenCTM(),s=m?Math.hypot(m.a,m.b):0;if(s>0)setFont(12.1/s);};const o=new ResizeObserver(update);o.observe(el);update();
  const wheel=(e:WheelEvent)=>{e.preventDefault();setCamera(c=>({...c,zoom:Math.max(.3,Math.min(5,c.zoom*Math.exp(-e.deltaY*.001)))}));};el.addEventListener('wheel',wheel,{passive:false});return()=>{o.disconnect();el.removeEventListener('wheel',wheel);};},[]);
 const start=(e:PointerEvent<SVGSVGElement>)=>{if(e.button!==0)return;e.preventDefault();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,a:azimuth,e:elevation};e.currentTarget.setPointerCapture(e.pointerId);},
  move=(e:PointerEvent<SVGSVGElement>)=>{const d=drag.current;if(!d||e.pointerId!==d.id)return;setCamera(c=>({...c,azimuth:d.a+(e.clientX-d.x)*.45,elevation:Math.max(-85,Math.min(85,d.e+(e.clientY-d.y)*.35))}));},reset=()=>setCamera({...INITIAL_ORIGINAL_ARRAY_CAMERA});
 const origin=scene.vertices.length,solid=drawing.surfaceOrderReliable;
 return <figure className="original-array-spatial" data-testid="original-array-static-3d" data-current={current}>
  <div className="original-array-spatial-toolbar"><span>拖动旋转 · 滚轮缩放 · mm</span><button type="button" onClick={reset}>复位 3D 视角</button></div>
  <svg ref={svg} role="img" aria-label="原正负目标折角的静态三维材料构形" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"
   data-view-azimuth={azimuth} data-view-elevation={elevation} data-view-zoom={zoom} data-world-points={JSON.stringify(scene.vertices)} data-surface-order={solid?'view-ordered':'ambiguous-wireframe'}
   onPointerDown={start} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
   <title>当前静态面等距与面闭环已核验；连续运动、自碰撞和层序未认证。</title>
   <g transform={transform}>
    {solid&&drawing.faceOrder.map(f=><polygon key={f} data-spatial-face={f} points={scene.faces[f].map(v=>drawing.points[v].join(',')).join(' ')} fill={drawing.frontFacing[f]?'#d6e9db':'#ead9ec'} stroke="#789080" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>)}
    {scene.edges.map(([a,b],e)=><line key={e} data-spatial-edge={e} data-assignment={scene.assignments[e]} x1={drawing.points[a][0]} y1={drawing.points[a][1]} x2={drawing.points[b][0]} y2={drawing.points[b][1]} stroke={scene.assignments[e]==='B'?'#283e33':scene.assignments[e]==='M'?'#bd4051':'#366bc1'} strokeWidth={scene.assignments[e]==='B'?1.8:1.25} vectorEffect="non-scaling-stroke"/>)}
   </g>
   <g className="original-array-spatial-axes" transform={transform} fontSize={font/zoom}>
    {[['X','#ba4851'],['Y','#38835a'],['Z','#3f6da8']].map(([name,color],k)=>{const a=drawing.points[origin],b=drawing.points[origin+k+1];return <g key={name} data-spatial-axis={name}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke"/><text x={b[0]} y={b[1]-font/zoom*.6} textAnchor="middle" fill={color}>{name} {fmt(axisStep)} mm</text></g>;})}
   </g>
  </svg>
  <figcaption>{current?'当前原参数':'上次已核验参数'} · {scene.faces.length} 面 · {solid?'当前视角表面绘制':'遮挡次序不确定，显示线框'}；不作为层序证书。</figcaption>
  <label className="original-array-spatial-query">空间顶点 <input type="number" aria-label="静态三维顶点索引" min={0} max={scene.vertices.length-1} step={1} value={selected} onChange={e=>{const v=Number(e.target.value);if(Number.isSafeInteger(v)&&v>=0&&v<scene.vertices.length)setVertex(v);}}/><output data-spatial-vertex={selected}>[{scene.vertices[selected].map(fmt).join(', ')}] mm</output></label>
 </figure>;
}
