import {useEffect,useId,useRef,useState,type ReactNode} from 'react';

/** Compact application menu; every entry keeps its normal button semantics. */
export default function HeaderMenu({label,children,icon,align='right',onOpen}:{label:string;children:ReactNode;icon?:ReactNode;align?:'left'|'right';onOpen?:()=>void}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
 },[open]);
 function focusItem(last=false){requestAnimationFrame(()=>{const items=panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(items?.length)items[last?items.length-1:0].focus();});}
 return <div className="header-menu" ref={root} data-align={align} data-no-window-drag="true" onKeyDown={event=>{
  // Menus isolate drawing keys while keeping application commands available.
  const key=event.key.toLowerCase();
  const appShortcut=!event.altKey&&((event.ctrlKey||event.metaKey)
   ? ['s','o','k','z','y'].includes(key)||(key==='p'&&!event.shiftKey)
   : key==='f11'&&!event.shiftKey);
  if(appShortcut)setOpen(false);else event.stopPropagation();
 }} onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <button ref={trigger} type="button" className={icon?'header-menu-trigger icon-menu-trigger':'header-menu-trigger'} aria-label={label} title={label} aria-expanded={open} aria-controls={id} onClick={()=>{if(!open)onOpen?.();setOpen(value=>!value);}} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open)onOpen?.();setOpen(true);focusItem(event.key==='ArrowUp');}}}>{icon??label}{!icon&&<ChromeIcon name="down"/>}</button>
  {open&&<div id={id} ref={panel} className="header-menu-panel" aria-label={label} onClick={event=>{if((event.target as HTMLElement).closest('button:not(:disabled)'))setOpen(false);}} onKeyDown={event=>{
   if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
   const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(!items.length)return;
   const current=items.indexOf(document.activeElement as HTMLButtonElement);
   const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
   event.preventDefault();items[next].focus();
  }}>{children}</div>}
 </div>;
}

export function ChromeIcon({name}:{name:'edit'|'tess'|'sim'|'diagram'|'design'|'focus'|'settings'|'down'|'help'}){
 const paths={edit:'M4 3h16v18H4ZM4 3l16 18M20 3 4 21M12 3v18',tess:'m12 2 9 5v10l-9 5-9-5V7Zm0 0v20M3 7l18 10M21 7 3 17M7 5v14M17 5v14',sim:'m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5m-9 5v9',diagram:'M3 3h7v7H3Zm11 11h7v7h-7ZM14 6h4v4m-3-3 3 3M6 14v4h4',focus:'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',down:'m7 10 5 5 5-5',help:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1'};
 return <svg className="chrome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={name==='design'?'M12 11 4 4M12 11l8-7M12 11l-7 9M12 11l8 9M2 2h4v4H2ZM18 2h4v4h-4ZM3 18h4v4H3ZM18 18h4v4h-4ZM10 9h4v4h-4Z':paths[name]}/></svg>;
}
