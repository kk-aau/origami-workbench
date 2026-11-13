import {useEffect,useRef,useState,type ReactNode} from 'react';
import {designListWindow} from '../app/designCanvasRendering';
type Modifiers={shiftKey:boolean;ctrlKey:boolean;metaKey:boolean};
interface Props<T>{items:readonly T[];className:string;label:string;selected:ReadonlySet<number>;onSelect:(id:number,event:Modifiers)=>void;render:(item:T)=>ReactNode;describe:(item:T)=>string}
/** Only visible rows own DOM. The full source stays in the workspace and both
 * scrolling and Home/End/arrow navigation can reach every node and edge. */
export default function DesignObjectList<T extends {id:number}>({items,className,label,selected,onSelect,render,describe}:Props<T>){
 const root=useRef<HTMLDivElement>(null),[scroll,setScroll]=useState(0),[focused,setFocused]=useState(0),virtual=items.length>200,rowHeight=34;
 const range=designListWindow(items.length,scroll,240,rowHeight),active=selected.size===1?selected.values().next().value:undefined;
 function reveal(index:number,focus=false){const element=root.current;if(!element)return;const top=index*rowHeight;if(top<element.scrollTop)element.scrollTop=top;else if(top+rowHeight>element.scrollTop+element.clientHeight)element.scrollTop=top+rowHeight-element.clientHeight;setScroll(element.scrollTop);if(focus)requestAnimationFrame(()=>element.querySelector<HTMLButtonElement>(`button[data-design-row="${index}"]`)?.focus());}
 useEffect(()=>{if(virtual&&active!==undefined){const index=items.findIndex(item=>item.id===active);if(index>=0){setFocused(index);reveal(index);}}},[items,active,virtual]);
 const button=(item:T,index:number)=><button key={item.id} data-design-row={index} aria-label={describe(item)} title={describe(item)} aria-pressed={selected.has(item.id)} tabIndex={!virtual||(index===focused||((focused<range.start||focused>=range.end)&&index===range.start))?0:-1} style={virtual?{position:'absolute',top:index*rowHeight,left:0,right:0,height:32}:undefined} onFocus={()=>setFocused(index)} onClick={event=>onSelect(item.id,event)} onKeyDown={event=>{if(!virtual)return;const target=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?Math.min(items.length-1,index+1):event.key==='ArrowUp'?Math.max(0,index-1):-1;if(target<0)return;event.preventDefault();event.stopPropagation();setFocused(target);onSelect(items[target].id,event);reveal(target,true);}}>{render(item)}</button>;
 return <div ref={root} className={className+(virtual?' design-virtual-list':'')} role="group" aria-label={label} data-design-count={items.length} onScroll={event=>{if(virtual)setScroll(event.currentTarget.scrollTop);}}>{virtual?<div style={{height:items.length*rowHeight,position:'relative'}}>{items.slice(range.start,range.end).map((item,index)=>button(item,range.start+index))}</div>:items.map(button)}</div>;
}

