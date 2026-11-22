import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {diagramPDFScrollGeometry,diagramPDFScrollWindow} from '../app/diagramPDFScrollWindow';
import './DiagramPDFScrollPreview.css';

export interface DiagramPDFScrollPreviewProps {
  count:number;page:number;spread:boolean;enlarged:boolean;width:number;height:number;busy:boolean;
  onPageChange:(index:number)=>void;
  renderPage:(index:number,visiblePages:readonly number[])=>ReactNode;
}

/** Pages keep fixed row placeholders while only nearby SVGs are mounted. */
export default function DiagramPDFScrollPreview({count,page,spread,enlarged,width,height,busy,onPageChange,renderPage}:DiagramPDFScrollPreviewProps){
  const root=useRef<HTMLDivElement>(null);
  const [viewport,setViewport]=useState({width:0,height:0}),[scrollTop,setScrollTop]=useState(0);
  const selected=Math.max(0,Math.min(page,count-1));
  const geometry=useMemo(()=>diagramPDFScrollGeometry(count,spread,enlarged,width,height,viewport.width,viewport.height),[count,spread,enlarged,width,height,viewport]);
  const window=useMemo(()=>diagramPDFScrollWindow(count,geometry,scrollTop,viewport.height),[count,geometry,scrollTop,viewport.height]);
  const windowKey=[window.firstVisible,window.lastVisible,count,geometry.columns].join('|');
  const [warmWindow,setWarmWindow]=useState('');
  const first=warmWindow===windowKey?window.first:window.firstVisible,last=warmWindow===windowKey?window.last:window.lastVisible;
  const visiblePages=useMemo(()=>Array.from({length:Math.max(0,Math.min(count,(last+1)*geometry.columns)-first*geometry.columns)},(_,i)=>first*geometry.columns+i),[first,last,count,geometry.columns]);
  const lastLayout=useRef(''),lastPage=useRef(-1),internalPage=useRef<number|null>(null),observedTop=useRef(0);
  const latest=useRef({count,geometry,viewport,window,selected,busy,onPageChange});
  latest.current={count,geometry,viewport,window,selected,busy,onPageChange};
  const frame=useRef<number|null>(null);

  useLayoutEffect(()=>{
    const element=root.current;if(!element)return;
    const measure=()=>{
      const next={width:element.clientWidth,height:element.clientHeight};
      if((next.width!==latest.current.viewport.width||next.height!==latest.current.viewport.height)&&frame.current!==null){
        cancelAnimationFrame(frame.current);frame.current=null;
      }
      setViewport(old=>old.width===next.width&&old.height===next.height?old:next);
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
  // First paint the intersecting sheets; then warm one neighbouring row after
  // scrolling settles, without putting earlier offscreen work in their way.
  useEffect(()=>{const timer=setTimeout(()=>setWarmWindow(windowKey),80);return ()=>clearTimeout(timer);},[windowKey]);

  useLayoutEffect(()=>{
    const element=root.current;if(!element||!viewport.width||!viewport.height)return;
    if(element.clientWidth!==viewport.width||element.clientHeight!==viewport.height)return;
    const layout=[geometry.columns,geometry.rowStride,geometry.rows,viewport.width,viewport.height].join('|');
    const fromInside=internalPage.current===selected;
    if(fromInside)internalPage.current=null;
    if(layout!==lastLayout.current||selected!==lastPage.current&&!fromInside){
      const row=Math.floor(selected/geometry.columns);
      // Centre shorter rows so navigation and scroll selection agree.
      const target=geometry.padding+row*geometry.rowStride-Math.max(0,(viewport.height-geometry.rowHeight)/2);
      element.scrollTop=Math.max(0,Math.min(target,geometry.contentHeight-viewport.height));
      observedTop.current=element.scrollTop;
      setScrollTop(element.scrollTop);
      if(geometry.contentWidth>viewport.width){
        const left=geometry.padding+(selected%geometry.columns)*(geometry.sheetWidth+geometry.gap);
        element.scrollLeft=Math.max(0,left-(viewport.width-geometry.sheetWidth)/2);
      }else element.scrollLeft=0;
    }
    lastLayout.current=layout;lastPage.current=selected;
  },[selected,geometry,viewport]);

  function scroll(){
    if(frame.current!==null)return;
    frame.current=requestAnimationFrame(()=>{
      frame.current=null;
      const element=root.current;if(!element)return;
      const state=latest.current,top=element.scrollTop;
      // A resize can clamp scrollTop before ResizeObserver commits the new row
      // sizes. Never interpret that position through the previous geometry.
      if(element.clientWidth!==state.viewport.width||element.clientHeight!==state.viewport.height)return;
      const next=diagramPDFScrollWindow(state.count,state.geometry,top,state.viewport.height);
      if(next.first!==state.window.first||next.last!==state.window.last||next.current!==state.window.current)setScrollTop(top);
      // Native horizontal scroll and duplicate programmatic scroll events must
      // not change the selected row, especially at a clamped document edge.
      const movedVertically=Math.abs(observedTop.current-top)>.5;
      observedTop.current=top;
      if(!movedVertically||state.busy||next.current===Math.floor(state.selected/state.geometry.columns))return;
      const index=Math.min(state.count-1,next.current*state.geometry.columns+state.selected%state.geometry.columns);
      internalPage.current=index;state.onPageChange(index);
    });
  }
  function select(index:number){
    if(busy||index===latest.current.selected)return;
    internalPage.current=index;
    latest.current.selected=index;
    onPageChange(index);
  }
  const rows=Array.from({length:last-first+1},(_,i)=>first+i);
  return <div ref={root} className="diagram-pdf-scroll-preview" role="region" aria-label="连续 PDF 页面预览" tabIndex={0} onScroll={scroll}>
    <div className="diagram-pdf-scroll-canvas" style={{width:geometry.contentWidth,height:geometry.contentHeight}}>
      {viewport.width>0&&viewport.height>0&&rows.map(row=><div key={row} className="diagram-pdf-scroll-row" role="group"
        aria-label={geometry.columns===2?`第 ${row*2+1}–${Math.min(count,row*2+2)} 页`:`第 ${row+1} 页`}
        style={{top:geometry.padding+row*geometry.rowStride,left:(geometry.contentWidth-geometry.rowWidth)/2,width:geometry.rowWidth,height:geometry.rowHeight,gap:geometry.gap}}>
        {Array.from({length:Math.min(geometry.columns,count-row*geometry.columns)},(_,column)=>{
          const index=row*geometry.columns+column;
          return <div key={index} className="diagram-pdf-scroll-sheet" data-active={index===selected} data-scroll-page-index={index}
            style={{width:geometry.sheetWidth}} onPointerDownCapture={event=>{if(event.button===0)select(index);}}>
            <div className="diagram-pdf-scroll-paper" style={{height:geometry.sheetHeight}}>{renderPage(index,visiblePages)}</div>
            <button type="button" className="diagram-pdf-scroll-select" disabled={busy} aria-pressed={index===selected}
              aria-label={`选中第 ${index+1} 页`} onClick={()=>select(index)}>第 {index+1} 页</button>
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}
