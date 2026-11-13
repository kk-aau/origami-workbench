import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ChromeIcon} from './HeaderMenu';

/** Tool forms stay mounted; opening them never reserves canvas space. */
export default function CanvasToolOptions({label,children}:{label:string;children:ReactNode}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
 },[open]);
 return <div className="canvas-tool-options" ref={root} onKeyDown={event=>{
  const key=event.key.toLowerCase();
  const shortcut=!event.altKey&&((event.ctrlKey||event.metaKey)?['s','o','k','z','y'].includes(key)||(key==='p'&&!event.shiftKey):key==='f11'&&!event.shiftKey);
  if(shortcut)setOpen(false);else event.stopPropagation();
 }} onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <button type="button" ref={trigger} className="header-menu-trigger" title={label+'：工具参数与提示'} aria-label={label+'：工具参数与提示'} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>{label}<ChromeIcon name="down"/></button>
  <div id={id} className="canvas-tool-options-panel" aria-label={label+'参数与提示'} hidden={!open}>{children}</div>
 </div>;
}
