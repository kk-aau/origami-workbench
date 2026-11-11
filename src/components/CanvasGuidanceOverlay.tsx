import {useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {placeCanvasHelp,type HelpRect} from '../app/canvasHelpPlacement';
import './CanvasToolHelp.css';

export default function CanvasGuidanceOverlay({size,paper,label,tool,instruction,enabled,error,children}:{size:{w:number;h:number};paper:HelpRect;label?:string;tool:string;instruction:string;enabled:boolean;error?:string;children:ReactNode}){
  const root=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false);
  const [metrics,setMetrics]=useState({width:380,height:46,top:56});
  useLayoutEffect(()=>{setOpen(false);},[tool,enabled]);
  useLayoutEffect(()=>{
    const node=root.current;if(!node)return;
    const measure=node.querySelector<HTMLElement>('.canvas-help-measure');
    const parameters=node.closest('.canvas-pane')?.querySelector<HTMLElement>('.canvas-parameter-panel');
    const update=()=>{
      const width=Math.ceil(measure?.getBoundingClientRect().width??380)+24;
      const top=Math.max(56,(parameters?.getBoundingClientRect().height??0)+12);
      const height=(label?22:0)+(enabled||error?24:0);
      setMetrics(old=>old.width===width&&old.top===top&&old.height===height?old:{width,height,top});
    };
    const observer=new ResizeObserver(update);if(measure)observer.observe(measure);if(parameters)observer.observe(parameters);update();
    return()=>observer.disconnect();
  },[label,tool,instruction,enabled,error]);
  const place=placeCanvasHelp(size,paper,metrics.width,metrics.height,metrics.top,open);
  const style={left:place.x,top:place.y,maxWidth:place.width,'--canvas-help-height':Math.max(36,place.height-(place.compact?24:metrics.height)-12)+'px'} as CSSProperties;
  return <div ref={root} className="canvas-guidance-overlay" style={style} data-compact={place.compact}>
    <span className="canvas-help-measure" aria-hidden="true"><strong>{tool}</strong> · {instruction} · 操作说明</span>
    {label&&!place.compact&&<div className="canvas-workspace-label" title={label}>{label}</div>}
    {enabled&&<details className="canvas-tool-guide" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
      <summary className="tool-guide" title={`${tool} · ${instruction} · 操作说明`}>
        {place.compact?<span>操作说明</span>:<><strong>{tool}</strong>{' · '}<span aria-live="polite">{instruction}</span>{' · 操作说明'}</>}
      </summary>
      {children}
    </details>}
    {!enabled&&error&&<div className="canvas-tool-error" role="alert">{error}</div>}
  </div>;
}

