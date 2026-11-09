import { useRef } from 'react';
interface Props {label?:string;side:'left'|'right';value:number;min:number;max:number;onChange:(value:number)=>void;onReset:()=>void;}
export default function PanelDivider({side,value,min,max,onChange,onReset,label}:Props){
  const drag=useRef<{x:number;value:number;id:number}|null>(null);
  const sign=side==='left'?1:-1;
  const change=(n:number)=>onChange(Math.max(min,Math.min(max,n)));
  return <div className="panel-divider" role="separator" tabIndex={0} aria-label={label??(side==='left'?'工具栏宽度':'属性栏宽度')} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} title="拖动调整宽度；方向键微调；双击恢复默认"
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();drag.current={x:e.clientX,value,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(drag.current)change(drag.current.value+(e.clientX-drag.current.x)*sign);}}
    onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{if(drag.current)change(drag.current.value);drag.current=null;}}
    onLostPointerCapture={()=>{drag.current=null;}}
    onDoubleClick={onReset}
    onKeyDown={e=>{e.stopPropagation();if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();change(value+(e.key==='ArrowRight'?1:-1)*sign*(e.shiftKey?32:8));}if(e.key==='Home'){e.preventDefault();onReset();}if(e.key==='Escape'&&drag.current){e.preventDefault();change(drag.current.value);drag.current=null;}}}><span/></div>;
}
