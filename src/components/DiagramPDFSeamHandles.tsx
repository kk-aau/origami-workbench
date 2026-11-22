import {useEffect,useRef,type PointerEvent} from 'react';
import {diagramPDFPageSeams,type DiagramPDFSeamHandle} from '../app/diagramPDFDecoration';
import type {DiagramPDFOptions,DiagramPDFPlan} from '../app/diagramPDFLayout';
import {changeDiagramPDFSeamHeight,diagramPDFSeamEndHeight,setDiagramPDFSeamLinked,type DiagramPDFSeamSide} from '../app/diagramPDFSeams';
import './DiagramPDFSeamHandles.css';

interface Props {options:DiagramPDFOptions;plan:DiagramPDFPlan;pageIndex:number}
export type ChangeSeamHeight=(key:string,height:number|undefined,side:DiagramPDFSeamSide)=>void;

function label(seam:DiagramPDFSeamHandle){
  return (seam.kind==='incoming'?'入口 · 接第 ':'出口 · 续第 ')+(seam.otherPage+1)+' 页';
}

export function DiagramPDFSeamControls({options,plan,pageIndex,onChange}:Props&{onChange:(patch:Partial<DiagramPDFOptions>)=>void}){
  const seams=diagramPDFPageSeams(options,plan,plan.pages[pageIndex]);
  if(!seams.length)return null;
  return <fieldset className="diagram-seam-controls">
    <legend>跨页彩带节点</legend>
    {seams.map(seam=>{
      const name=label(seam),value=Math.round(seam.height*100);
      const setting=options.ribbonSeamHeights?.[seam.key],linked=typeof setting!=='object';
      const set=(height:number|undefined)=>onChange({ribbonSeamHeights:changeDiagramPDFSeamHeight(options.ribbonSeamHeights,seam.key,height,seam.kind)});
      const disambiguate=seams.some(other=>other.key!==seam.key&&label(other)===name);
      const title=disambiguate&&seam.stepLabel?name+' · 步骤 '+seam.stepLabel:name;
      const linkLabel=seam.kind==='incoming'?'联动上页出口':'联动下页入口';
      return <div key={seam.key} className="diagram-seam-setting">
        <div className="diagram-seam-control">
          <label><span>{title}</span><input type="range" aria-label={title+'高度'} min={0} max={100} step={1} value={value} onChange={e=>set(e.currentTarget.valueAsNumber/100)}/></label>
          <output>{value}%</output><button type="button" aria-label={title+'恢复自动'} disabled={diagramPDFSeamEndHeight(setting,seam.kind)===undefined} onClick={()=>set(undefined)}>自动</button>
        </div>
        <label className="diagram-seam-link" title="重新联动时，两端采用本页节点的高度">
          <input type="checkbox" checked={linked} aria-label={linkLabel+' · '+title} onChange={e=>onChange({ribbonSeamHeights:setDiagramPDFSeamLinked(options.ribbonSeamHeights,seam.key,e.currentTarget.checked,seam.height)})}/>
          {linkLabel}
        </label>
      </div>;
    })}
  </fieldset>;
}

export default function DiagramPDFSeamHandles({options,plan,pageIndex,onChange}:Props&{onChange:ChangeSeamHeight}){
  const drag=useRef<{id:number;key:string;side:DiagramPDFSeamSide;inverse:DOMMatrix;initialY:number;pointerY:number;initialClientY:number;original?:number;last?:number;pending?:number}|null>(null);
  const frame=useRef<number|undefined>(undefined);
  useEffect(()=>()=>{if(frame.current!==undefined)cancelAnimationFrame(frame.current);},[]);
  function position(event:PointerEvent<SVGGElement>){
    const active=drag.current;
    if(!active||active.id!==event.pointerId)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(active.inverse);
    return Math.max(0,Math.min(1,active.initialY+(point.y-active.pointerY)/plan.height));
  }
  function finish(event:PointerEvent<SVGGElement>,commit:boolean){
    const active=drag.current,y=position(event);
    if(!active||y===undefined)return;
    event.stopPropagation();
    if(frame.current!==undefined){cancelAnimationFrame(frame.current);frame.current=undefined;}
    drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    const value=commit&&Math.abs(event.clientY-active.initialClientY)>1?y:active.original;
    if(value!==(active.last??active.original))onChange(active.key,value,active.side);
  }
  function move(event:PointerEvent<SVGGElement>){
    const active=drag.current,y=position(event);
    if(!active||y===undefined)return;
    event.stopPropagation();
    if(active.last===undefined&&Math.abs(event.clientY-active.initialClientY)<=1)return;
    active.pending=y;
    if(frame.current!==undefined)return;
    frame.current=requestAnimationFrame(()=>{
      frame.current=undefined;
      if(drag.current!==active||active.pending===active.last)return;
      active.last=active.pending;
      onChange(active.key,active.last,active.side);
    });
  }
  return <g data-preview-seam-handles="true">{diagramPDFPageSeams(options,plan,plan.pages[pageIndex]).map(seam=>{
    const incoming=seam.kind==='incoming',height=seam.height;
    const x=incoming?7:plan.width-7,y=Math.max(11,Math.min(plan.height-11,height*plan.height)),title=label(seam);
    return <g key={seam.key} data-seam-kind={seam.kind} className="diagram-seam-handle" role="slider" tabIndex={0} aria-label={title+'高度'} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(height*100)} transform={`translate(${x} ${y})`}
      onPointerDown={event=>{
        const matrix=event.currentTarget.ownerSVGElement?.getScreenCTM();
        if(event.button!==0||!matrix||drag.current)return;
        event.preventDefault();event.stopPropagation();event.currentTarget.focus();
        const inverse=matrix.inverse(),pointerY=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse).y;
        drag.current={id:event.pointerId,key:seam.key,side:seam.kind,inverse,initialY:seam.height,pointerY,initialClientY:event.clientY,original:diagramPDFSeamEndHeight(options.ribbonSeamHeights?.[seam.key],seam.kind)};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={event=>finish(event,true)} onPointerCancel={event=>finish(event,false)} onLostPointerCapture={event=>finish(event,false)}
      onKeyDown={event=>{
        const step=event.shiftKey ? 0.05 : 0.01;
        const values:Record<string,number|undefined>={ArrowUp:height-step,ArrowDown:height+step,Home:0,End:1,Delete:undefined,Backspace:undefined};
        if(!Object.hasOwn(values,event.key))return;
        event.preventDefault();event.stopPropagation();onChange(seam.key,values[event.key],seam.kind);
      }}>
      <title>{title}，沿页边上下拖动</title>
      <rect x="-7" y="-14" width="14" height="28" fill="transparent"/>
      <rect className="diagram-seam-grip" x="-4" y="-9" width="8" height="18" rx="3"/>
      <path d="M -1.4 -3 v6 M 1.4 -3 v6" fill="none" stroke="currentColor" strokeWidth="1.1"/>
    </g>;
  })}</g>;
}
