import {useEffect,useRef,useState,type CSSProperties,type HTMLAttributes,type PointerEvent,type ReactNode} from 'react';
import './OverlayScrollArea.css';

type ScrollMetrics={top:number;height:number;maxScroll:number;travel:number};
const emptyMetrics:ScrollMetrics={top:0,height:0,maxScroll:0,travel:0};

export default function OverlayScrollArea({as:Root='div',className='',style,label,viewportClassName='',viewportProps,children}:{as?:'div'|'aside';className?:string;style?:CSSProperties;label?:string;viewportClassName?:string;viewportProps?:HTMLAttributes<HTMLDivElement>;children:ReactNode}){
  const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),track=useRef<HTMLDivElement>(null);
  const requestMeasure=useRef<()=>void>(()=>{}),scrollTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const drag=useRef<{pointerId:number;y:number;scrollTop:number;maxScroll:number;travel:number}|null>(null);
  const [metrics,setMetrics]=useState(emptyMetrics),[scrolling,setScrolling]=useState(false),[dragging,setDragging]=useState(false);
  const {onScroll,className:extraViewportClass='',...viewportAttributes}=viewportProps??{};
  function showScroll(){setScrolling(true);clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(()=>setScrolling(false),900);}
  useEffect(()=>{
    const view=viewport.current,body=content.current,bar=track.current;if(!view||!body||!bar)return;
    let frame=0;
    function measure(){
      frame=0;
      const maxScroll=Math.max(0,view!.scrollHeight-view!.clientHeight),trackHeight=bar!.clientHeight;
      const height=maxScroll>0?Math.min(trackHeight,Math.max(28,trackHeight*view!.clientHeight/view!.scrollHeight)):0;
      const travel=Math.max(0,trackHeight-height),top=maxScroll>0?Math.max(0,Math.min(maxScroll,view!.scrollTop))/maxScroll*travel:0;
      setMetrics(previous=>previous.top===top&&previous.height===height&&previous.maxScroll===maxScroll&&previous.travel===travel?previous:{top,height,maxScroll,travel});
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    requestMeasure.current=schedule;
    const resize=new ResizeObserver(schedule);resize.observe(view);resize.observe(body);
    function wheel(event:WheelEvent){
      if(event.ctrlKey||!event.deltaY||view!.scrollHeight<=view!.clientHeight)return;
      event.preventDefault();
      view!.scrollTop+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?view!.clientHeight:1);
    }
    bar.addEventListener('wheel',wheel,{passive:false});schedule();
    return()=>{resize.disconnect();bar.removeEventListener('wheel',wheel);cancelAnimationFrame(frame);clearTimeout(scrollTimer.current);requestMeasure.current=()=>{};};
  },[]);
  function beginDrag(event:PointerEvent<HTMLDivElement>){
    const view=viewport.current;if(!view||event.button!==0||metrics.travel<=0)return;
    event.preventDefault();event.stopPropagation();view.focus({preventScroll:true});
    drag.current={pointerId:event.pointerId,y:event.clientY,scrollTop:view.scrollTop,maxScroll:metrics.maxScroll,travel:metrics.travel};
    event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);showScroll();
  }
  function moveDrag(event:PointerEvent<HTMLDivElement>){
    const gesture=drag.current;if(!gesture||gesture.pointerId!==event.pointerId||!viewport.current)return;
    viewport.current.scrollTop=gesture.scrollTop+(event.clientY-gesture.y)/gesture.travel*gesture.maxScroll;
  }
  function endDrag(event:PointerEvent<HTMLDivElement>){
    if(drag.current?.pointerId!==event.pointerId)return;
    drag.current=null;setDragging(false);showScroll();
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <Root className={`overlay-scroll-area ${className}${scrolling?' is-scrolling':''}${dragging?' is-dragging':''}`} style={style} aria-label={label}>
    <div {...viewportAttributes} ref={viewport} tabIndex={viewportAttributes.tabIndex??0} className={`overlay-scroll-viewport ${viewportClassName} ${extraViewportClass}`} onScroll={event=>{onScroll?.(event);requestMeasure.current();showScroll();}}>
      <div ref={content} className="overlay-scroll-content">{children}</div>
    </div>
    <div ref={track} className="overlay-scrollbar" aria-hidden="true" data-scrollable={metrics.maxScroll>0} onPointerDown={event=>{
      if(event.target!==event.currentTarget||event.button!==0||!viewport.current)return;
      event.preventDefault();viewport.current.focus({preventScroll:true});
      const offset=event.clientY-event.currentTarget.getBoundingClientRect().top-metrics.height/2;
      viewport.current.scrollTop=metrics.travel>0?Math.max(0,Math.min(metrics.travel,offset))/metrics.travel*metrics.maxScroll:0;
      showScroll();
    }}>
      <div className="overlay-scroll-thumb" style={{height:metrics.height,transform:`translateY(${metrics.top}px)`}} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}/>
    </div>
  </Root>;
}
