import {useEffect,useMemo,useRef,useState} from 'react';
import type {Doc,Point} from '../core/types';
import type {CPPathOptimization} from '../core/cpPathOptimizer';
import type {CPProcessingReadbackReport} from '../core/cpProcessingExport';
import {getDrawingBounds} from '../app/paper';
import {processingPreviewLines,processingPreviewPaths,processingPreviewStrokeOwners} from '../app/cpProcessingPreview';
import {PROCESSING_COLORS,PROCESSING_LABELS} from '../app/cpProcessingSettings';
export default function CPProcessingPreview({doc,plan,original,numbers,groups,representation='dxf-line'}:{doc:Doc;plan:CPPathOptimization|null;original:boolean;numbers:boolean;groups:boolean;representation?:CPProcessingReadbackReport['representation']}){
 const svg=useRef<SVGSVGElement>(null),bounds=useMemo(()=>getDrawingBounds({...doc,objects:[]}),[doc]),span=Math.max(bounds.width,bounds.height,1e-9),pad=span*.055,base=useMemo(()=>({x:bounds.x-pad,y:bounds.y-pad,width:Math.max(bounds.width+pad*2,span*.11),height:Math.max(bounds.height+pad*2,span*.11)}),[bounds,span,pad]);
 const [view,setView]=useState(base),[hover,setHover]=useState<string|null>(null),[dragging,setDragging]=useState(false),drag=useRef<{id:number;screen:Point;view:typeof base;inverse:DOMMatrix}|null>(null);
 const paths=useMemo(()=>processingPreviewPaths(doc,plan,original,groups,representation),[doc,plan,original,groups,representation]),lines=useMemo(()=>processingPreviewLines(paths,processingPreviewStrokeOwners(plan,original,groups,paths.length,representation)),[paths,plan,original,groups,representation]),active=lines.find(l=>l.key===hover),highlighted=active?lines.filter(l=>l.stroke===active.stroke):[];
 useEffect(()=>{setView(base);setHover(null);},[base]);useEffect(()=>setHover(null),[paths]);
 const zoom=(factor:number,point?:Point)=>{setHover(null);setView(v=>{const scale=Math.max(1/64,Math.min(4096,base.width/v.width/factor)),width=base.width/scale,height=base.height/scale,p=point??[v.x+v.width/2,v.y+v.height/2];return {x:p[0]-(p[0]-v.x)*width/v.width,y:p[1]-(p[1]-v.y)*height/v.height,width,height};});};
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();if(drag.current)return;const inverse=el.getScreenCTM()?.inverse();if(!inverse)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?el.clientHeight:1);zoom(Math.exp(Math.max(-1,Math.min(1,delta*.002))),[p.x,p.y]);};el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel);},[base]);
 const radius=view.width*.005,labelSize=view.width*.019;
 const polyline=representation==='dxf-polyline',mode=original?'原始加工线段':groups?'规划组':polyline?'导出 POLYLINE':'导出 LINE';
 return <>
  <svg ref={svg} className="cp-processing-preview" role="img" aria-label={original?'原始 CP 几何预览':'优化加工路径预览'} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} data-preview-count={paths.length} data-preview-mode={mode} data-dragging={dragging}
   onPointerDown={e=>{if(e.button!==0)return;const inverse=svg.current?.getScreenCTM()?.inverse();if(!inverse)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,screen:[e.clientX,e.clientY],view,inverse};setDragging(true);setHover(null);}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const a=new DOMPoint(...d.screen).matrixTransform(d.inverse),b=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.inverse);setView({...d.view,x:d.view.x+a.x-b.x,y:d.view.y+a.y-b.y});}}
   onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={()=>{drag.current=null;setDragging(false);}} onPointerLeave={()=>{if(!drag.current)setHover(null);}}>
   {lines.map(l=><g key={l.key} data-processing-path={l.path+1} data-optimized-path={l.stroke+1} data-processing-line={l.key} data-highlighted={!!active&&l.stroke===active.stroke}>
    <path d={`M${l.a[0]} ${l.a[1]} L${l.b[0]} ${l.b[1]}`} fill="none" stroke={active&&l.stroke===active.stroke?'#00aab3':PROCESSING_COLORS[l.assignment]} strokeWidth={active&&l.stroke===active.stroke?4:1.4} vectorEffect="non-scaling-stroke" pointerEvents="none"/>
    <path className="cp-preview-hit" d={`M${l.a[0]} ${l.a[1]} L${l.b[0]} ${l.b[1]}`} fill="none" stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" pointerEvents="stroke" onPointerEnter={()=>{if(!drag.current)setHover(l.key);}} onPointerLeave={()=>{if(!drag.current)setHover(null);}}/>
   </g>)}
   {numbers&&paths.map((p,i)=><g key={p.id} pointerEvents="none"><circle cx={p.points[0][0]} cy={p.points[0][1]} r={radius} fill={PROCESSING_COLORS[p.assignments[0]]}/><text x={p.points[0][0]+radius*2} y={p.points[0][1]-radius*2} fontSize={labelSize} fill="#354b40" paintOrder="stroke" stroke="#fff" strokeWidth={view.width*.006}>{i+1}</text></g>)}
  </svg>
  <div className="cp-preview-navigation"><button aria-label="缩小加工预览" onClick={()=>zoom(1.25)}>−</button><button aria-label="适合加工预览" onClick={()=>{setView(base);setHover(null);}}>适合画布</button><button aria-label="放大加工预览" onClick={()=>zoom(.8)}>＋</button></div>
  <div className="cp-preview-inspector" aria-label="加工预览线段信息">{active?`${!original&&plan?.options.pathMode==='continuous'?`${polyline?'连续路径':'连续组'} ${active.stroke+1} · ${highlighted.length} ${groups||polyline?'段':'条 LINE'}`:`${mode} ${active.path+1}`} · ${[...new Set(highlighted.map(l=>PROCESSING_LABELS[l.assignment]))].join(' / ')} · 来源 ${highlighted.reduce((n,l)=>n+l.sourceIds.length,0)} 段 · ${highlighted.reduce((n,l)=>n+Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),0).toLocaleString('zh-CN',{maximumFractionDigits:3})} mm`:`${mode} ${paths.length} ${groups&&!original?'组':'条'} · 滚轮缩放，拖动画布，悬停高亮${!original&&plan?.options.pathMode==='continuous'?'整条连续路径':'完整线段'}`}</div>
 </>;
}
