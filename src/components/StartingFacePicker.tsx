import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc, FoldGraph } from '../core/types';
import { getPaperBounds } from '../app/paper';
import { segmentDisplayColor } from '../app/customColor';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';

/** Select in the unfolded graph: overlapping folded polygons are deliberately not used. */
export default function StartingFacePicker({doc,graph,current,onApply,onCancel}:{doc:Doc;graph:FoldGraph;current:number;onApply:(face:number)=>void;onCancel:()=>void}) {
  const [candidate,setCandidate]=useState<number|null>(null);
  const material=useMemo(()=>hasMaterialTopology(doc)?inspectMaterialTopology(doc):null,[doc]);
  const [pointer,setPointer]=useState<{x:number;y:number}|null>(null);
  const paper=getPaperBounds(doc),pad=Math.max(paper.width,paper.height)*.04;
  const initial={x:paper.x-pad,y:paper.y-pad,width:paper.width+pad*2,height:paper.height+pad*2};
  const [view,setView]=useState(initial),viewRef=useRef(view);viewRef.current=view;
  const svg=useRef<SVGSVGElement>(null);
  const pan=useRef<{id:number;x:number;y:number;view:typeof view;matrix:DOMMatrix}|null>(null);
  useEffect(()=>{
    const element=svg.current;if(!element)return;
    const wheel=(e:WheelEvent)=>{
      e.preventDefault();if(pan.current)return;
      const matrix=element.getScreenCTM();if(!matrix)return;
      const anchor=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),old=viewRef.current;
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?240:1);
      const width=Math.max(initial.width/256,Math.min(initial.width*4,old.width*Math.exp(Math.max(-2,Math.min(2,delta*.002)))));
      const factor=width/old.width;
      const next={x:anchor.x+(old.x-anchor.x)*factor,y:anchor.y+(old.y-anchor.y)*factor,width,height:old.height*factor};
      viewRef.current=next;setView(next);
    };
    const stop=()=>{pan.current=null;};
    element.addEventListener('wheel',wheel,{passive:false});window.addEventListener('blur',stop);
    return()=>{element.removeEventListener('wheel',wheel);window.removeEventListener('blur',stop);};
  },[initial.width]);
  useEffect(()=>{
    const modal=()=>!!document.querySelector('[role="dialog"],dialog[open]');
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!modal()){e.preventDefault();e.stopPropagation();onCancel();}};
    const cancel=(e:MouseEvent)=>{if(!modal()){e.preventDefault();onCancel();}};
    window.addEventListener('keydown',key,true);window.addEventListener('contextmenu',cancel,true);
    return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('contextmenu',cancel,true);};
  },[onCancel]);
  return <section aria-label="选择起始面" onContextMenu={e=>{e.preventDefault();onCancel();}}>
    <h2>设置起始面</h2>
    <p className="note">点击展开图中的纸面，再应用。滚轮缩放，按住滚轮拖动；紫色为候选，右击或 Esc 取消。</p>
    {material?.ok&&<label className="select-field">材料面<select aria-label="起始材料面" value={candidate??''} onChange={e=>setCandidate(Number(e.target.value))}><option value="" disabled>按部件选择，重叠材料也可区分…</option>{material.components.flatMap((c,i)=>c.faces.map(f=><option key={f} value={f}>部件 {i+1} · F{f+1} · {graph.faces_vertices![f].length} 角</option>))}</select></label>}
    <div className="readout"><span>视图 {Math.round(initial.width/view.width*100)}%</span><button className="text-button" onClick={()=>{pan.current=null;viewRef.current=initial;setView(initial);}}>复位选面视图</button></div>
    <svg ref={svg} aria-label="起始面展开图" onMouseMove={e=>{if(!pan.current)setPointer({x:e.clientX,y:e.clientY});}} onMouseLeave={()=>setPointer(null)}
      onPointerDown={e=>{if(e.button!==1)return;e.preventDefault();const matrix=e.currentTarget.getScreenCTM();if(!matrix)return;pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,view:viewRef.current,matrix:matrix.inverse()};setPointer(null);e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const p=pan.current;if(!p||p.id!==e.pointerId)return;if(!(e.buttons&4)){pan.current=null;return;}const dx=e.clientX-p.x,dy=e.clientY-p.y;const next={...p.view,x:p.view.x-p.matrix.a*dx-p.matrix.c*dy,y:p.view.y-p.matrix.b*dx-p.matrix.d*dy};viewRef.current=next;setView(next);}}
      onPointerUp={e=>{if(pan.current?.id===e.pointerId){pan.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}}
      onPointerCancel={()=>{pan.current=null;}} onLostPointerCapture={()=>{pan.current=null;}} onAuxClick={e=>e.preventDefault()}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} style={{display:'block',width:'100%',height:240,touchAction:'none',userSelect:'none',background:'#fffefb',border:'1px solid #d3ddd0'}}>
      {graph.faces_vertices?.map((face,i)=><polygon key={i} pointerEvents="fill" role="button" tabIndex={0} aria-label={`起始面候选 F${i+1}`} aria-pressed={candidate===i} points={face.map(v=>graph.vertices_coords[v].join(',')).join(' ')} fill={candidate===i?'#d9c9e8':i===current?'#dbe7d7':'#fffefb'} stroke={candidate===i?'#8052ad':'#aebdac'} strokeWidth={candidate===i?2:1} vectorEffect="non-scaling-stroke" onClick={()=>setCandidate(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setCandidate(i);}}}><title>{`点击选择 F${i+1} 为起始面候选`}</title></polygon>)}
      <g pointerEvents="none">{doc.segments.map(s=><line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={segmentDisplayColor(s)} strokeWidth=".7" vectorEffect="non-scaling-stroke"/>)}</g>
    </svg>
    {pointer&&<div role="tooltip" style={{position:'fixed',left:Math.max(8,Math.min(pointer.x+14,window.innerWidth-210)),top:Math.max(8,pointer.y-62),width:190,padding:'8px 10px',background:'#fffefb',border:'1px solid #8052ad',borderRadius:4,color:'#5d3c7c',fontSize:12,pointerEvents:'none',zIndex:30}}>{candidate===null?'点击纸面内部，选择起始面。':'可另点一个面，或点击“应用起始面”。'}</div>}
    <p className="note" role="status">{candidate===null?'请点击展开图中的一个面。':`候选 F${candidate+1}：应用后点击“计算平折结果”重新求解。`}</p>
    <button className="primary" disabled={candidate===null} onClick={()=>{if(candidate!==null)onApply(candidate);}}>应用起始面</button>{' '}
    <button className="outline" onClick={onCancel}>取消选面</button>
  </section>;
}
