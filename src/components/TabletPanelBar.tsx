import {useLayoutEffect,useRef} from 'react';
type Props={label:string;items:readonly (readonly [string,string])[];value:string;onChange:(value:string)=>void};
export default function TabletPanelBar({label,items,value,onChange}:Props){
  const bar=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    const element=bar.current,root=element?.closest<HTMLElement>('.diagram-workspace,.app');
    if(!element||!root)return;
    const update=()=>root.style.setProperty('--tablet-sheet-top',`${element.getBoundingClientRect().bottom+4}px`);
    const observer=new ResizeObserver(update);observer.observe(element);
    const notice=element.closest('.app')?.querySelector('.web-edition-notice');if(notice)observer.observe(notice);
    window.addEventListener('resize',update);update();
    return()=>{observer.disconnect();window.removeEventListener('resize',update);root.style.removeProperty('--tablet-sheet-top');};
  },[]);
  return <nav ref={bar} className="tablet-panel-bar" aria-label={label}>
    {items.map(([id,title])=><button type="button" key={id} aria-expanded={value===id} onClick={()=>onChange(value===id?'':id)}>{title}</button>)}
    {value&&<button type="button" className="tablet-panel-dismiss" onClick={()=>onChange('')}>收起面板</button>}
  </nav>;
}
export function TabletPanelHeading({title,onClose}:{title:string;onClose:()=>void}){
  return <header className="tablet-panel-heading"><strong>{title}</strong><button type="button" onClick={onClose} aria-label={`收起${title}`}>收起 ×</button></header>;
}
