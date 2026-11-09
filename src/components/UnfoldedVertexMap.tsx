import {useEffect,useRef,useState} from 'react';
import type {FoldGraph} from '../core/types';
import type {FoldedVertexSelection} from '../app/foldedVertexEdit';

export default function UnfoldedVertexMap({source,selection,disabled,onChoose}:{source:FoldGraph;selection:FoldedVertexSelection;disabled:boolean;onChoose:(index:number)=>void}){
  const vertices=source.vertices_coords,xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]);
  const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(1,Math.max(...xs)-x),height=Math.max(1,Math.max(...ys)-y),pad=Math.max(width,height)*.06;
  const initial={x:x-pad,y:y-pad,width:width+2*pad,height:height+2*pad};
  const [view,setView]=useState(initial),viewRef=useRef(view);viewRef.current=view;
  const svg=useRef<SVGSVGElement>(null),[pixelWidth,setPixelWidth]=useState(240);
  const [hint,setHint]=useState<{x:number;y:number;index:number|null}|null>(null);
  const pan=useRef<{id:number;x:number;y:number;inverse:DOMMatrix;view:typeof view}|null>(null),suppress=useRef(false),cancelled=useRef(false);
  const radius=Math.max(view.width/pixelWidth,view.height/190)*3.5;
  function cancel(){if(!pan.current)return;const old=pan.current.view;pan.current=null;viewRef.current=old;setView(old);suppress.current=true;cancelled.current=true;setHint(null);}
  function nearest(clientX:number,clientY:number):number|null{
    const m=svg.current?.getScreenCTM();if(!m)return null;
    let nearest:number|null=null,distance=8;
    vertices.forEach((p,i)=>{const q=new DOMPoint(...p).matrixTransform(m),d=Math.hypot(q.x-clientX,q.y-clientY);if(d<distance){distance=d;nearest=i;}});
    return nearest;
  }
  useEffect(()=>{pan.current=null;viewRef.current=initial;setView(initial);setHint(null);},[source]);
  useEffect(()=>{
    const el=svg.current;if(!el)return;
    const observer=new ResizeObserver(()=>setPixelWidth(Math.max(1,el.getBoundingClientRect().width)));observer.observe(el);
    const wheel=(e:WheelEvent)=>{e.preventDefault();if(pan.current)return;const m=el.getScreenCTM();if(!m)return;const a=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),v=viewRef.current;
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?190:1),w=Math.max(initial.width/256,Math.min(initial.width*4,v.width*Math.exp(Math.max(-2,Math.min(2,delta*.002))))),f=w/v.width;
      const next={x:a.x+(v.x-a.x)*f,y:a.y+(v.y-a.y)*f,width:w,height:v.height*f};viewRef.current=next;setView(next);setHint(null);};
    const key=(e:KeyboardEvent)=>{if(pan.current&&(e.key==='Escape'||((e.ctrlKey||e.metaKey)&&!e.altKey&&['z','y'].includes(e.key.toLowerCase())))){e.preventDefault();e.stopPropagation();cancel();}};
    el.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
    return()=>{observer.disconnect();el.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);};
  },[source]);
  return <>
    <div className="readout"><span>视图 {Math.round(initial.width/view.width*100)}%</span><button className="text-button" onClick={()=>{pan.current=null;viewRef.current=initial;setView(initial);setHint(null);}}>复位顶点视图</button></div>
    <p className="note">滚轮缩放，按住滚轮平移；密集处先放大，再点最近的顶点。平移途中右击或 Esc 恢复视图。</p>
    <svg ref={svg} aria-label="展开图顶点选择" tabIndex={0} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} style={{display:'block',width:'100%',height:190,background:'#fffefb',touchAction:'none',userSelect:'none'}}
      onPointerDown={e=>{if(e.button===0){suppress.current=false;cancelled.current=false;}if(e.button!==1)return;e.preventDefault();const m=e.currentTarget.getScreenCTM();if(!m)return;e.currentTarget.focus({preventScroll:true});suppress.current=true;cancelled.current=false;pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,inverse:m.inverse(),view:viewRef.current};setHint(null);e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const p=pan.current;if(!p){if(e.buttons===0)setHint({x:e.clientX,y:e.clientY,index:nearest(e.clientX,e.clientY)});return;}if(p.id!==e.pointerId)return;if(!(e.buttons&4)||(e.buttons&2)){cancel();return;}const dx=e.clientX-p.x,dy=e.clientY-p.y,next={...p.view,x:p.view.x-p.inverse.a*dx-p.inverse.c*dy,y:p.view.y-p.inverse.b*dx-p.inverse.d*dy};viewRef.current=next;setView(next);}}
      onPointerUp={e=>{if(pan.current?.id===e.pointerId){pan.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerLeave={()=>setHint(null)} onAuxClick={e=>e.preventDefault()}
      onContextMenu={e=>{if(pan.current||cancelled.current){e.preventDefault();e.stopPropagation();cancel();cancelled.current=false;}}}
      onClick={e=>{if(disabled||suppress.current)return;const index=nearest(e.clientX,e.clientY);if(index!==null)onChoose(index);}}>
      <g pointerEvents="none">{source.edges_vertices.map(([a,b],i)=><line key={i} x1={vertices[a][0]} y1={vertices[a][1]} x2={vertices[b][0]} y2={vertices[b][1]} stroke="#a6b6aa" strokeWidth=".7" vectorEffect="non-scaling-stroke"/>)}</g>
      {vertices.map((p,i)=><circle key={i} data-model-vertex={i} cx={p[0]} cy={p[1]} r={radius} fill={selection.selected.includes(i)?'#8052ad':selection.group.includes(i)?'#d9c9e8':'#fffefb'} stroke="#8052ad" strokeWidth=".7" vectorEffect="non-scaling-stroke" role="button" tabIndex={disabled?-1:0} aria-label={`选择模型顶点 ${i+1}`} aria-pressed={selection.selected.includes(i)} aria-disabled={disabled} onKeyDown={e=>{if(!disabled&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onChoose(i);}}}/>)}
    </svg>
    {hint&&!disabled&&<div role="tooltip" style={{position:'fixed',left:Math.max(8,Math.min(hint.x+14,window.innerWidth-230)),top:Math.max(8,hint.y-48),maxWidth:210,padding:'6px 9px',background:'#fffefb',border:'1px solid #8052ad',borderRadius:4,color:'#583278',fontSize:12,pointerEvents:'none',zIndex:30}}>{hint.index===null?'点选顶点；密集处可滚轮放大。':`点击切换顶点 ${hint.index+1} 的选择。`}</div>}
  </>;
}
