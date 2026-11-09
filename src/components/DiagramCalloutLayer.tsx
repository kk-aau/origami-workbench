import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import type {Point} from '../core/types';
import {DIAGRAM_CALLOUT_MIN_RADIUS,DIAGRAM_CALLOUT_MAX_RADIUS,diagramCalloutLocator,diagramCalloutTargets,type DiagramCallout,type DiagramCalloutCircle,type DiagramCalloutTargetPart} from '../app/diagramCallouts';
import {diagramCalloutsSVG,type DiagramCalloutPaperMarkup} from '../app/diagramCalloutSVG';
import './DiagramCalloutLayer.css';

export interface DiagramCalloutLayerProps {
  callouts:readonly DiagramCallout[];
  selectedId?:string;
  editable:boolean;
  onSelect:(id:string|null)=>void;
  /** One complete, immutable update on release; drafts stay inside this layer. */
  onChange:(callouts:DiagramCallout[])=>void;
  paperMarkup:DiagramCalloutPaperMarkup;
  cpMarkup:(stateId:string,sourceUnits?:number,hideExistingCreases?:boolean)=>string;
  /** World units occupied by one screen pixel. */
  units:number;
  stroke?:string;
}
type Part='source'|DiagramCalloutTargetPart;
interface Gesture {id:number;target:SVGCircleElement;callout:DiagramCallout;part:Part;resize:boolean;start:Point;inverse:DOMMatrix;next:DiagramCallout;moved:boolean}
const radius=(value:number)=>Math.max(DIAGRAM_CALLOUT_MIN_RADIUS,Math.min(DIAGRAM_CALLOUT_MAX_RADIUS,value));
const coordinate=(value:number)=>Math.max(-1_000_000,Math.min(1_000_000,value));
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const circleForPart=(callout:DiagramCallout,part:Part)=>part==='source'?diagramCalloutLocator(callout):part==='comparison'?callout.comparison!.target:callout.target;
function withCircle(callout:DiagramCallout,part:Part,circle:DiagramCalloutCircle):DiagramCallout {
  // Preserve an older CP inset's derived locator on its first edit, so moving
  // its large circle also leaves the small circle where the user saw it.
  const source=callout.source.kind==='cp'?{...callout.source,locator:part==='source'?circle:diagramCalloutLocator(callout)}:part==='source'?{...callout.source,...circle}:callout.source;
  return {...callout,source,target:part==='target'?circle:callout.target,...(part==='comparison'?{comparison:{...callout.comparison!,target:circle}}:{})};
}

/** A drawing overlay: circle gestures never change CP or the surrounding canvas camera. */
export default function DiagramCalloutLayer({callouts,selectedId,editable,onSelect,onChange,paperMarkup,cpMarkup,units,stroke='#293d35'}:DiagramCalloutLayerProps){
  const group=useRef<SVGGElement>(null),gesture=useRef<Gesture|null>(null),[draft,setDraft]=useState<DiagramCallout|null>(null);
  const prefix='callout-layer-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),pixel=Number.isFinite(units)&&units>0?units:1;
  const current=useRef({callouts,onChange});current.current={callouts,onChange};
  function cancel(){const old=gesture.current;gesture.current=null;setDraft(null);if(old?.target.hasPointerCapture(old.id))old.target.releasePointerCapture(old.id);}
  useEffect(()=>{
    if(!editable)cancel();
    const key=(event:KeyboardEvent)=>{if(gesture.current&&(event.key==='Escape'||(event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))){event.preventDefault();event.stopPropagation();cancel();}};
    const context=(event:MouseEvent)=>{if(gesture.current){event.preventDefault();event.stopPropagation();cancel();}};
    window.addEventListener('keydown',key,true);window.addEventListener('contextmenu',context,true);window.addEventListener('blur',cancel);
    return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('contextmenu',context,true);window.removeEventListener('blur',cancel);const old=gesture.current;gesture.current=null;if(old?.target.hasPointerCapture(old.id))old.target.releasePointerCapture(old.id);};
  },[editable]);
  useEffect(()=>{const active=gesture.current;if(active&&!equal(callouts.find(item=>item.id===active.callout.id),active.callout))cancel();},[callouts]);
  function local(inverse:DOMMatrix,x:number,y:number):Point{return [inverse.a*x+inverse.c*y+inverse.e,inverse.b*x+inverse.d*y+inverse.f];}
  function change(callout:DiagramCallout){current.current.onChange(current.current.callouts.map(item=>item.id===callout.id?callout:item));}
  function begin(event:ReactPointerEvent<SVGCircleElement>,callout:DiagramCallout,part:Part,resize=false){
    if(!editable||event.button!==0)return;
    const matrix=group.current?.getScreenCTM();if(!matrix)return;
    event.preventDefault();event.stopPropagation();onSelect(callout.id);
    const inverse=matrix.inverse();gesture.current={id:event.pointerId,target:event.currentTarget,callout,part,resize,start:local(inverse,event.clientX,event.clientY),inverse,next:callout,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function update(active:Gesture,x:number,y:number){
    const point=local(active.inverse,x,y),circle=circleForPart(active.callout,active.part);
    const radialDelta=Math.hypot(point[0]-circle.center[0],point[1]-circle.center[1])-Math.hypot(active.start[0]-circle.center[0],active.start[1]-circle.center[1]);
    const next=active.resize?{...circle,radius:radius(circle.radius+radialDelta)}:{...circle,center:[coordinate(circle.center[0]+(point[0]-active.start[0])),coordinate(circle.center[1]+(point[1]-active.start[1]))] as Point};
    active.moved=!equal(next,circle);active.next=active.moved?withCircle(active.callout,active.part,next):active.callout;setDraft(active.moved?active.next:null);
  }
  function move(event:ReactPointerEvent<SVGCircleElement>){const active=gesture.current;if(!active||active.id!==event.pointerId)return;event.stopPropagation();if(!(event.buttons&1)||event.buttons&2){cancel();return;}update(active,event.clientX,event.clientY);}
  function end(event:ReactPointerEvent<SVGCircleElement>){const active=gesture.current;if(!active||active.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(event.button===0)update(active,event.clientX,event.clientY);const next=active.next,moved=active.moved;cancel();if(event.button===0&&moved)change(next);}
  function key(event:ReactKeyboardEvent<SVGCircleElement>,callout:DiagramCallout,part:Part,resize=false){
    if(!editable)return;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onSelect(callout.id);return;}
    const direction=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,Point>)[event.key];if(!direction)return;
    event.preventDefault();event.stopPropagation();onSelect(callout.id);
    const circle=circleForPart(callout,part),step=pixel*(event.shiftKey?10:1),next=resize?{...circle,radius:radius(circle.radius+((direction[0]||-direction[1])*step))}:{...circle,center:[coordinate(circle.center[0]+direction[0]*step),coordinate(circle.center[1]+direction[1]*step)] as Point};
    if(!equal(next,circle))change(withCircle(callout,part,next));
  }
  const shown=callouts.map(callout=>draft?.id===callout.id?draft:callout);
  const controls=(callout:DiagramCallout,part:Part,index:number,handlesOnly=false)=>{
    const circle=circleForPart(callout,part),selected=callout.id===selectedId,label=part==='source'?(callout.source.kind==='cp'?'CP 定位小圆':'来源小圆'):callout.comparison?(part==='target'?'操作前 CP 放大圆':'操作后 CP 放大圆'):'放大圆';
    const events={onPointerMove:move,onPointerUp:end,onPointerCancel:cancel,onLostPointerCapture:cancel,onContextMenu:(event:React.MouseEvent)=>{event.preventDefault();event.stopPropagation();cancel();},onClick:(event:React.MouseEvent)=>event.stopPropagation()};
    return <g key={part} data-callout-controls={part}>
      {!handlesOnly&&<circle {...events} data-callout-hit={callout.id} data-callout-part={part} cx={circle.center[0]} cy={circle.center[1]} r={circle.radius} fill="transparent" stroke={selected?'#2f68c9':'transparent'} strokeWidth={part==='source'&&!selected?pixel*10:pixel*1.3} pointerEvents={part==='source'&&!selected?'stroke':'all'} role="button" tabIndex={0} aria-label={`移动${label} ${index+1}`} aria-pressed={selected} style={{cursor:gesture.current?'grabbing':'move'}} onPointerDown={event=>begin(event,callout,part)} onKeyDown={event=>key(event,callout,part)}/>}
      {handlesOnly&&selected&&<>
        <circle cx={circle.center[0]+circle.radius} cy={circle.center[1]} r={pixel*5} fill="#2f68c9" stroke="#fff" strokeWidth={pixel*1.5} pointerEvents="none"/>
        <circle {...events} data-callout-resize={part} data-callout-id={callout.id} cx={circle.center[0]+circle.radius} cy={circle.center[1]} r={pixel*10} fill="transparent" pointerEvents="all" role="button" tabIndex={0} aria-label={`缩放${label} ${index+1}`} style={{cursor:'ew-resize'}} onPointerDown={event=>begin(event,callout,part,true)} onKeyDown={event=>key(event,callout,part,true)}/>
      </>}
    </g>;
  };
  return <g ref={group} data-diagram-callout-layer data-callout-dragging={draft?true:undefined} onDragStartCapture={event=>{event.preventDefault();event.stopPropagation();}}>
    <g pointerEvents="none" dangerouslySetInnerHTML={{__html:diagramCalloutsSVG(shown,{paperMarkup,cpMarkup,idPrefix:prefix,stroke,strokeWidth:pixel*1.3,units:pixel})}}/>
    {editable&&shown.map((callout,index)=><g key={callout.id}>{controls(callout,'source',index)}{diagramCalloutTargets(callout).map(target=>controls(callout,target.part,index))}</g>)}
    {editable&&shown.map((callout,index)=>callout.id===selectedId?<g key={callout.id} data-callout-grips>{controls(callout,'source',index,true)}{diagramCalloutTargets(callout).map(target=>controls(callout,target.part,index,true))}</g>:null)}
  </g>;
}
