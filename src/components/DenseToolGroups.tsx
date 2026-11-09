import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {DockGroup} from '../app/orieditaToolLayout';
import {denseDockLayout} from '../app/denseDockLayout';
import DockToolGroup,{type DockToolProps} from './DockToolGroup';

export default function DenseToolGroups({groups,columns=0,label,...props}:DockToolProps&{groups:DockGroup[];columns?:number;label:string}){
  const viewport=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  useLayoutEffect(()=>{
    const node=viewport.current!;
    const measure=()=>setSize({width:node.clientWidth,height:node.clientHeight});
    const observer=new ResizeObserver(measure);
    measure();observer.observe(node);return()=>observer.disconnect();
  },[]);
  const layout=denseDockLayout(groups,size.width,size.height,columns);
  return <div className="dense-tools">
    <div ref={viewport} className="dense-tools-viewport" aria-label={label} data-headings={layout.showHeadings} data-labels={layout.showLabels} style={{'--dock-columns':layout.columns,'--dock-row-height':`${layout.rowHeight}px`,'--dock-icon-size':`${layout.iconSize}px`} as CSSProperties}>
      {groups.map(group=><DockToolGroup key={group.name} group={group} {...props}/>)}
      {!groups.length&&<p className="dock-empty">没有匹配的工具</p>}
    </div>
  </div>;
}
